/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    OtaUpdateAvailableDetails,
    OtaUpdateStatus,
    SoftwareUpdateManager,
} from "#behavior/system/software-update/SoftwareUpdateManager.js";
import { AccessControlServer } from "#behaviors/access-control";
import { DescriptorServer } from "#behaviors/descriptor";
import { AccessControl } from "#clusters/access-control";
import { OtaSoftwareUpdateProvider } from "#clusters/ota-software-update-provider";
import {
    Bytes,
    Crypto,
    Duration,
    Logger,
    MatterError,
    MaybePromise,
    Minutes,
    Seconds,
    Time,
    Timestamp,
} from "#general";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    assertRemoteActor,
    BdxProtocol,
    BdxSession,
    FabricAuthority,
    Flow,
    NodeSession,
    PeerAddress,
    ScopedStorage,
} from "#protocol";
import { FabricIndex, NodeId } from "#types";
import { OtaSoftwareUpdateProviderBehavior } from "./OtaSoftwareUpdateProviderBehavior.js";

const logger = Logger.get("OtaSoftwareUpdateProviderServer");

const OTA_UPDATE_TOKEN_LENGTH_BYTES = 32;

interface OtaUpdateInProgressDetails {
    requestorNodeId: NodeId;
    fabricIndex: FabricIndex;
    lastState: OtaUpdateStatus;
    timestamp: Timestamp;
    versionToApply?: number;
    directConsentObtained?: boolean;
    /** Called when the entry is removed to clean up external listeners (e.g. sessionStarted) */
    cleanup?: () => void;
}

export enum OtaSoftwareUpdateConsentState {
    Granted,
    Denied,
    Obtaining,
    Unknown,
}

/**
 * This is the default server implementation of {@link OtaSoftwareUpdateProviderBehavior}.
 *
 * This cluster is usually used by Controller nodes and allows Servers to handle OTA software updates.
 * For the state and detailed usage for Clients, please check the SoftwareUpdateManager behavior which provides
 * configurability for this.
 *
 *
 * For special use cases the cluster provides the following extension point methods:
 * * {@link checkUpdateAvailable}: By default, the implementation uses the SoftwareUpdateManager to check for available
 *     updates from the DCL or being available in the local OTA storage. If this needs to be more vendor-specific, it
 *     can be implemented by overriding this method.
 *
 * * {@link requestUserConsentForUpdate}: If the client is able to gather user update consent via other means, then this can be
 *     implemented by overriding this method. One example could be that users state "automatic update" for certain peers
 *     or device types (e.g., sensors and lights but not sockets). This method then can be used to get such automatic
 *     consents that will be then applied in a queue.
 */
export class OtaSoftwareUpdateProviderServer extends OtaSoftwareUpdateProviderBehavior {
    declare readonly internal: OtaSoftwareUpdateProviderServer.Internal;

    override async initialize() {
        (await this.agent.load(DescriptorServer)).addDeviceTypes("OtaProvider");

        this.agent.require(SoftwareUpdateManager);
        await this.agent.load(SoftwareUpdateManager);

        // Verify and adjust ACL if needed
        const node = Node.forEndpoint(this.endpoint) as ServerNode;
        this.reactTo(node.lifecycle.online, this.#nodeOnline);
        if (node.lifecycle.isOnline) {
            await this.#nodeOnline();
        }
    }

    get updateStorage() {
        if (this.internal.updateStorage === undefined) {
            this.internal.updateStorage = this.agent.get(SoftwareUpdateManager).storage;
        }
        return this.internal.updateStorage;
    }

    async #nodeOnline() {
        const fabricAuthority = this.env.get(FabricAuthority);
        const ownFabric = fabricAuthority.fabrics[0];
        if (!ownFabric) {
            // Can only happen if the SoftwareUpdateManager is used without any commissioned nodes
            logger.error(`No owning fabric, delay initialization`);
            fabricAuthority.fabricAdded.once(() => this.#nodeOnline());
            return;
        }

        const node = Node.forEndpoint(this.endpoint) as ServerNode;
        await node.act(agent => agent.load(AccessControlServer));
        if (node.behaviors.has(AccessControlServer)) {
            if (
                !node
                    .stateOf(AccessControlServer)
                    .acl.some(
                        ({ fabricIndex, privilege, authMode, subjects, targets }) =>
                            fabricIndex === ownFabric.fabricIndex &&
                            privilege === AccessControl.AccessControlEntryPrivilege.Operate &&
                            authMode === AccessControl.AccessControlEntryAuthMode.Case &&
                            subjects?.length === 0 &&
                            targets?.length === 1 &&
                            targets[0].endpoint === this.endpoint.number &&
                            targets[0].cluster === OtaSoftwareUpdateProvider.Cluster.id,
                    )
            ) {
                // Allow anyone in the fabric to access the OTA Software Update Provider cluster on this node here
                const acl = [
                    ...node.stateOf(AccessControlServer).acl,
                    {
                        fabricIndex: ownFabric.fabricIndex,
                        privilege: AccessControl.AccessControlEntryPrivilege.Operate,
                        authMode: AccessControl.AccessControlEntryAuthMode.Case,
                        subjects: [],
                        targets: [{ endpoint: this.endpoint.number, cluster: OtaSoftwareUpdateProvider.Cluster.id }],
                    },
                ];
                await node.setStateOf(AccessControlServer, { acl });
                logger.info(`Added ACL entry to allow access to OTA Software Update Provider for anyone in the fabric`);
            }
        }
    }

    /**
     * Default implementation of the QueryImage command according to Matter specification.
     */
    override async queryImage(
        request: OtaSoftwareUpdateProvider.QueryImageRequest,
    ): Promise<OtaSoftwareUpdateProvider.QueryImageResponse> {
        const { protocolsSupported } = request;

        assertRemoteActor(this.context);
        const session = this.context.session;
        NodeSession.assert(session);
        const peerAddress = session.peerAddress;

        const updateDetails = await this.checkUpdateAvailable(request, peerAddress);
        if (updateDetails === undefined) {
            return {
                status: OtaSoftwareUpdateProvider.Status.NotAvailable,
            };
        }
        const {
            fileDesignator,
            httpsUri,
            newSoftwareVersion,
            newSoftwareVersionString,
            consentRequired,
            metadataForRequestor,
        } = updateDetails;

        // If for this fabricIndex and peerNodeId an update is already ongoing, return busy (with a delay time)
        const updateInProgress = this.#inProgressDetailsForPeer(peerAddress);
        if (updateInProgress !== undefined) {
            logger.info(
                `OTA Update for Requestor`,
                peerAddress,
                `already in progress (${OtaUpdateStatus[updateInProgress.lastState]})`,
            );
            return {
                status: OtaSoftwareUpdateProvider.Status.Busy,
                delayedActionTime: Seconds.of(Minutes(5)), // the usual bdx session timeout is 5 minutes, so let's use this
            };
        }

        const crypto = this.env.get(Crypto);
        const updateToken = crypto.randomBytes(OTA_UPDATE_TOKEN_LENGTH_BYTES);

        // If the requestor can consent, we send the update without asking for a consent
        //  else we need to ask for consent if required by the update details
        if (consentRequired && !request.requestorCanConsent) {
            this.#updateInProgressDetails(peerAddress, updateToken, OtaUpdateStatus.WaitForConsent, newSoftwareVersion);

            const { consentState, delayTime = Seconds(120) } = await this.requestUserConsentForUpdate(
                request,
                updateDetails,
                peerAddress,
            );
            logger.info(
                `OTA Update for Requestor`,
                peerAddress,
                `(${Bytes.toHex(updateToken)}) consent is ${OtaSoftwareUpdateConsentState[consentState]}`,
            );
            switch (consentState) {
                case OtaSoftwareUpdateConsentState.Granted:
                    // proceed
                    this.#updateInProgressDetails(
                        peerAddress,
                        updateToken,
                        OtaUpdateStatus.Querying,
                        newSoftwareVersion,
                        true,
                    );
                    break;
                case OtaSoftwareUpdateConsentState.Obtaining:
                    return {
                        status: OtaSoftwareUpdateProvider.Status.Busy,
                        delayedActionTime: Seconds.of(delayTime),
                    };
                case OtaSoftwareUpdateConsentState.Denied:
                case OtaSoftwareUpdateConsentState.Unknown:
                default:
                    this.#removeInProgressDetails(peerAddress);
                    return {
                        status: OtaSoftwareUpdateProvider.Status.NotAvailable,
                    };
            }
        } else {
            this.#updateInProgressDetails(peerAddress, updateToken, OtaUpdateStatus.Querying, newSoftwareVersion);
        }

        let imageUri: string;
        // Synchronous BDX is mandatory, so it should always be supported, and because we manage the OTA files,
        //  we always prefer a local transfer over an HTTPS one directly from the device
        if (protocolsSupported.includes(OtaSoftwareUpdateProvider.DownloadProtocol.BdxSynchronous)) {
            // Enable BDX for this scope
            const bdxProtocol = this.env.get(BdxProtocol);
            if (
                !bdxProtocol.enablePeerForScope(peerAddress, this.updateStorage, {
                    preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                    // That's also the default but especially states for OTA, but let's set it explicitly
                    messageTimeout: Minutes(5),
                    // maxBlockSize 1024 (non-TCP), 8192 (TCP) - We support whatever the peer wants, so do not set that
                })
            ) {
                // We could not enable BDX for this scope because another process is registered with different details
                logger.info("Could not enable Bdx");
                return {
                    status: OtaSoftwareUpdateProvider.Status.Busy,
                    delayedActionTime: Seconds.of(Minutes(5)),
                };
            }

            const sessionListener = (bdxSession: BdxSession, scope: string) => {
                if (scope !== this.updateStorage.scope || !PeerAddress.is(bdxSession.peerAddress, peerAddress)) {
                    // New session not for us
                    return;
                }

                // Found our session — unregister from sessionStarted to prevent listener accumulation
                bdxProtocol.sessionStarted.off(sessionListener);

                // Verify the entry still exists (might have been cancelled/timed out since queryImage)
                if (this.#inProgressDetailsForPeer(peerAddress, updateToken) === undefined) {
                    return;
                }

                this.#updateInProgressDetails(
                    peerAddress,
                    updateToken,
                    OtaUpdateStatus.Downloading,
                    newSoftwareVersion,
                );
                bdxSession.progressFinished.on(() =>
                    this.#updateInProgressDetails(
                        peerAddress,
                        updateToken,
                        OtaUpdateStatus.WaitForApply,
                        newSoftwareVersion,
                    ),
                );
                bdxSession.progressCancelled.on(() =>
                    this.#updateInProgressDetails(
                        peerAddress,
                        updateToken,
                        OtaUpdateStatus.Cancelled,
                        newSoftwareVersion,
                    ),
                );
                bdxSession.closed.on(() => {
                    const details = this.#inProgressDetailsForPeer(peerAddress, updateToken);
                    if (
                        details !== undefined &&
                        details.lastState !== OtaUpdateStatus.WaitForApply &&
                        details.lastState !== OtaUpdateStatus.Applying &&
                        details.lastState !== OtaUpdateStatus.Done &&
                        details.lastState !== OtaUpdateStatus.Cancelled
                    ) {
                        this.#updateInProgressDetails(
                            peerAddress,
                            updateToken,
                            OtaUpdateStatus.Cancelled,
                            newSoftwareVersion,
                        );
                    }
                });
            };
            bdxProtocol.sessionStarted.on(sessionListener);

            // Store cleanup so the listener is removed when the entry reaches a terminal state
            const details = this.internal.inProgressDetails.get(
                `${peerAddress.nodeId}-${peerAddress.fabricIndex}-${Bytes.toHex(updateToken)}`,
            );
            if (details !== undefined) {
                details.cleanup = () => bdxProtocol.sessionStarted.off(sessionListener);
            }

            // And keep it open until a minimum 5 minutes after the last block transfer to allow partial downloads

            imageUri = fileDesignator.asBdxUri(this.context.session.associatedFabric.rootNodeId);
        } else if (
            httpsUri !== undefined &&
            protocolsSupported.includes(OtaSoftwareUpdateProvider.DownloadProtocol.Https)
        ) {
            imageUri = httpsUri;
        } else {
            return {
                status: OtaSoftwareUpdateProvider.Status.DownloadProtocolNotSupported,
            };
        }

        return {
            status: OtaSoftwareUpdateProvider.Status.UpdateAvailable,
            imageUri,
            softwareVersion: newSoftwareVersion,
            softwareVersionString: newSoftwareVersionString,
            updateToken,
            userConsentNeeded: consentRequired === true ? true : undefined,
            metadataForRequestor,
        };
    }

    /**
     * Default implementation of the ApplyUpdate command according to Matter specification.
     * We always allow updated to be executed immediately by the device.
     */
    override async applyUpdateRequest({
        updateToken,
        newVersion,
    }: OtaSoftwareUpdateProvider.ApplyUpdateRequest): Promise<OtaSoftwareUpdateProvider.ApplyUpdateResponse> {
        assertRemoteActor(this.context);
        const session = this.context.session;
        NodeSession.assert(session);

        const progressInfo = this.#inProgressDetailsForPeer(session.peerAddress, updateToken);

        const bdxProtocol = this.env.get(BdxProtocol);
        try {
            await bdxProtocol.disablePeerForScope(
                session.peerAddress,
                this.updateStorage,
                progressInfo?.lastState !== OtaUpdateStatus.WaitForApply, // Force close when not known as completed
            );
        } catch (error) {
            MatterError.accept(error);
            logger.info("Error while closing BDX session for OTA update apply request, continuing anyway:", error);
        }

        if (!this.#hasUpdateConsent(session.peerAddress, newVersion)) {
            this.#updateInProgressDetails(session.peerAddress, updateToken, OtaUpdateStatus.Cancelled, newVersion);

            return {
                action: OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue,
                delayedActionTime: Minutes(2),
            };
        }

        // Invoked by an OTA Requestor once it is ready to apply a previously downloaded Software Image.
        // Disable BDX protocol again
        this.#updateInProgressDetails(session.peerAddress, updateToken, OtaUpdateStatus.Applying, newVersion);

        return {
            action: OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed,
            delayedActionTime: 0, // Allow immediate update
        };
    }

    /**
     * Default implementation of the NotifyUpdateApplied command according to Matter specification.
     */
    override notifyUpdateApplied({
        updateToken,
        softwareVersion,
    }: OtaSoftwareUpdateProvider.NotifyUpdateAppliedRequest): void {
        assertRemoteActor(this.context);
        const session = this.context.session;
        NodeSession.assert(session);

        // TODO formerly optional, so maybe also check for boot event (General Diagnostics cluster) with any reason and
        //  check if the software version matches and if yes, consider it applied?

        this.#updateInProgressDetails(session.peerAddress, updateToken, OtaUpdateStatus.Done, softwareVersion);
    }

    /**
     * Extension method if the node wants to handle automatic user consent gathering itself. By default, it declines
     * the update request and informs the node of the available update.
     */
    protected requestUserConsentForUpdate(
        _request: OtaSoftwareUpdateProvider.QueryImageRequest,
        _updateDetails: OtaUpdateAvailableDetails,
        _peerAddress: PeerAddress,
    ): MaybePromise<{ consentState: OtaSoftwareUpdateConsentState; delayTime?: Duration }> {
        return { consentState: OtaSoftwareUpdateConsentState.Unknown };
    }

    /**
     * Override to customize how to check for available updates.
     * The default logic also validates the node details like vendorId and productId and the current version.
     * When the requestorCanConsent is true, we send the latest update we have also without a consent.
     * All additional data like hardware, location, and MetadataForProvider can be checked here for specific logic
     */
    protected checkUpdateAvailable(
        request: OtaSoftwareUpdateProvider.QueryImageRequest,
        peerAddress: PeerAddress,
    ): MaybePromise<OtaUpdateAvailableDetails | undefined> {
        return this.endpoint.act(agent => agent.get(SoftwareUpdateManager).updateExistsFor(peerAddress, request));
    }

    #hasUpdateConsent(peerAddress: PeerAddress, targetSoftwareVersion?: number) {
        return (
            !!this.#inProgressDetailsForPeer(peerAddress)?.directConsentObtained ||
            this.endpoint.act(agent => agent.get(SoftwareUpdateManager).hasConsent(peerAddress, targetSoftwareVersion))
        );
    }

    /**
     * Retrieves the in-progress details for a specific peer based on the peer address and an optional update token.
     * Auto-removes entries older than 15 minutes to prevent stale entries from blocking future updates.
     */
    #inProgressDetailsForPeer(peerAddress: PeerAddress, updateToken?: Bytes) {
        const { fabricIndex, nodeId: requestorNodeId } = peerAddress;
        const now = Time.nowMs;
        if (updateToken !== undefined) {
            const key = `${requestorNodeId}-${fabricIndex}-${Bytes.toHex(updateToken)}`;
            const details = this.internal.inProgressDetails.get(key);
            if (details !== undefined && details.timestamp + Minutes(15) < now) {
                logger.info(
                    `Removing stale in-progress OTA entry for Requestor`,
                    peerAddress,
                    `(age: ${Math.round((now - details.timestamp) / 60_000)}min)`,
                );
                details.cleanup?.();
                this.internal.inProgressDetails.delete(key);
                return undefined;
            }
            return details;
        }
        for (const [key, details] of this.internal.inProgressDetails.entries()) {
            if (details.requestorNodeId === requestorNodeId && details.fabricIndex === fabricIndex) {
                if (details.timestamp + Minutes(15) < now) {
                    logger.info(
                        `Removing stale in-progress OTA entry for Requestor`,
                        peerAddress,
                        `(age: ${Math.round((now - details.timestamp) / 60_000)}min)`,
                    );
                    details.cleanup?.();
                    this.internal.inProgressDetails.delete(key);
                    return undefined;
                }
                return details;
            }
        }
    }

    /**
     * Removes all in-progress details entries for a specific peer address.
     */
    #removeInProgressDetails(peerAddress: PeerAddress) {
        const { fabricIndex, nodeId: requestorNodeId } = peerAddress;
        for (const [key, details] of this.internal.inProgressDetails.entries()) {
            if (details.requestorNodeId === requestorNodeId && details.fabricIndex === fabricIndex) {
                details.cleanup?.();
                this.internal.inProgressDetails.delete(key);
            }
        }
    }

    /**
     * Updates the details of an in-progress OTA update process for a specific requestor,
     * tracking the update's state and optionally the target version to apply.
     */
    #updateInProgressDetails(
        peerAddress: PeerAddress,
        updateToken: Bytes,
        lastState: OtaUpdateStatus,
        versionToApply?: number,
        directConsentObtained = false,
    ) {
        const { fabricIndex, nodeId: requestorNodeId } = peerAddress;
        const key = `${requestorNodeId}-${fabricIndex}-${Bytes.toHex(updateToken)}`;
        const origDetails = this.internal.inProgressDetails.get(key);
        const previousState = origDetails?.lastState;
        const details: OtaUpdateInProgressDetails = origDetails ?? {
            requestorNodeId,
            fabricIndex,
            lastState,
            timestamp: Time.nowMs,
            directConsentObtained,
        };
        details.lastState = lastState;
        details.timestamp = Time.nowMs;
        if (versionToApply !== undefined) {
            if (details.versionToApply !== undefined && details.versionToApply !== versionToApply) {
                logger.warn(
                    `OTA Update for Requestor`,
                    peerAddress.toString(),
                    `(${Bytes.toHex(updateToken)}) versionToApply changed from ${details.versionToApply} to ${versionToApply}`,
                );
            }
            details.versionToApply = versionToApply;
        }
        details.directConsentObtained = directConsentObtained;

        logger.info(
            `OTA Update ${details.versionToApply !== undefined ? `to version ${details.versionToApply} ` : ""}for Requestor`,
            peerAddress.toString(),
            `(${Bytes.toHex(updateToken)}) is now ${OtaUpdateStatus[lastState]}${previousState === undefined ? "" : ` (formerly ${OtaUpdateStatus[previousState]})`}`,
        );

        this.internal.inProgressDetails.set(key, details);

        this.endpoint.act(agent =>
            agent.get(SoftwareUpdateManager).onOtaStatusChange(peerAddress, lastState, details.versionToApply),
        );

        // Ensure they don't block future updates
        if (lastState === OtaUpdateStatus.Done || lastState === OtaUpdateStatus.Cancelled) {
            details.cleanup?.();
            this.internal.inProgressDetails.delete(key);
        }
    }
}

export namespace OtaSoftwareUpdateProviderServer {
    export class Internal {
        /** Keyed by the requestorNodeId+fabricIndex+updateToken */
        inProgressDetails = new Map<string, OtaUpdateInProgressDetails>();

        updateStorage!: ScopedStorage;
    }

    export declare const ExtensionInterface: {
        /**
         * Override to customize how to ask for user consent for an update.
         * This method should return the current state of the consent and potentially trigger a User consent request in
         * parallel. If the consent is not yet obtained, return `Obtaining`.
         * The default implementation always returns `Unknown` which declines all non-consented updates.
         * @param request
         * @param updateDetails
         * @param peerAddress
         * @returns The consent state and optionally a delay time in seconds after which the requestor should retry (mainly needed for "Obtaining" state.
         * @protected
         */
        requestUserConsentForUpdate(
            request: OtaSoftwareUpdateProvider.QueryImageRequest,
            updateDetails: OtaUpdateAvailableDetails,
            peerAddress: PeerAddress,
        ): MaybePromise<{ consentState: OtaSoftwareUpdateConsentState; delayTime?: Duration }>;

        /**
         * Override to customize how to check for available updates.
         * @param request
         * @param peerAddress
         */
        checkUpdateAvailable(
            request: OtaSoftwareUpdateProvider.QueryImageRequest,
            peerAddress: PeerAddress,
        ): MaybePromise<OtaUpdateAvailableDetails | undefined>;
    };
}
