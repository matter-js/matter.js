/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OtaUpdateStatus } from "#behavior/system/software-update/OtaProgress.js";
import type { OtaUpdateAttempt } from "#behavior/system/software-update/OtaUpdateAttempts.js";
import {
    OtaUpdateAvailableDetails,
    SoftwareUpdateManager,
} from "#behavior/system/software-update/SoftwareUpdateManager.js";
import { AccessControlServer } from "#behaviors/access-control";
import { DescriptorServer } from "#behaviors/descriptor";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Bytes, Crypto, Duration, Logger, MatterError, MaybePromise, Minutes, Seconds } from "@matter/general";
import {
    assertRemoteActor,
    BdxProtocol,
    BdxSession,
    FabricAuthority,
    Flow,
    NodeSession,
    PeerAddress,
    ScopedStorage,
} from "@matter/protocol";
import { AccessControl } from "@matter/types/clusters/access-control";
import { OtaSoftwareUpdateProvider } from "@matter/types/clusters/ota-software-update-provider";
import { OtaSoftwareUpdateProviderBehavior } from "./OtaSoftwareUpdateProviderBehavior.js";

const logger = Logger.get("OtaSoftwareUpdateProviderServer");

/**
 * The longest `DelayedActionTime` this provider sends, in seconds; a requestor may treat a longer one as this.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.20.6.5.4.2
 */
const MAX_DELAYED_ACTION_TIME = 86_400;

const OTA_UPDATE_TOKEN_LENGTH_BYTES = 32;

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
 * * {@link checkUpdateAvailable}: By default, the implementation uses the SoftwareUpdateManager to find an update
 *     in the OTA storage, which the SoftwareUpdateManager fills from the DCL, or which holds imported local files
 *     (offered, like test-net images, only with `allowTestOtaImages`). If this needs to be
 *     more vendor-specific, it can be implemented by overriding this method.
 *
 * * {@link requestUserConsentForUpdate}: If the client is able to gather user update consent via other means, then this can be
 *     implemented by overriding this method. One example could be that users state "automatic update" for certain peers
 *     or device types (e.g., sensors and lights but not sockets). A consent granted this way lets the node apply the
 *     offered version under the update token of that query, see {@link SoftwareUpdateManager.applyUpdate}.
 *
 * The SoftwareUpdateManager tracks each QueryImage flow as an update attempt and decides whether an update may apply;
 * this provider reports the flow to it.  An override of {@link queryImage} that does not call this implementation
 * creates no attempt, so an apply of its offers is an apply under an unknown update token, see
 * {@link SoftwareUpdateManager.applyUpdate}.
 */
export class OtaSoftwareUpdateProviderServer extends OtaSoftwareUpdateProviderBehavior {
    declare readonly internal: OtaSoftwareUpdateProviderServer.Internal;
    declare readonly state: OtaSoftwareUpdateProviderServer.State;

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
        const fabricAuthority = await this.env.load(FabricAuthority);
        const ownFabric = fabricAuthority.fabrics[0];
        if (!ownFabric) {
            // Can only happen if the SoftwareUpdateManager is used without any commissioned nodes
            logger.info(`No owning fabric, delay initialization`);
            this.reactTo(fabricAuthority.fabricAdded, this.#nodeOnline, { once: true });
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
                            targets[0].cluster === OtaSoftwareUpdateProvider.id,
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
                        targets: [{ endpoint: this.endpoint.number, cluster: OtaSoftwareUpdateProvider.id }],
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
        assertRemoteActor(this.context);
        const session = this.context.session;
        NodeSession.assert(session);
        const manager = this.agent.get(SoftwareUpdateManager);
        const attempt = manager.beginQuery(session.peerAddress);
        try {
            return await this.#answerQuery(request, session, attempt);
        } finally {
            manager.endQuery(attempt);
        }
    }

    /**
     * Answers the query.  The offer is recorded after the last await, see {@link SoftwareUpdateManager.offerUpdate}, so
     * nothing changes the decision before the answer is sent.
     */
    async #answerQuery(
        request: OtaSoftwareUpdateProvider.QueryImageRequest,
        session: NodeSession,
        attempt: OtaUpdateAttempt,
    ): Promise<OtaSoftwareUpdateProvider.QueryImageResponse> {
        const { protocolsSupported } = request;
        const { peerAddress } = session;

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

        const manager = this.agent.get(SoftwareUpdateManager);
        if (!(await manager.admitQuery(peerAddress, session, request.softwareVersion))) {
            return {
                status: OtaSoftwareUpdateProvider.Status.Busy,
                delayedActionTime: Seconds.of(Minutes(2)),
            };
        }

        const crypto = this.env.get(Crypto);
        const updateToken = crypto.randomBytes(OTA_UPDATE_TOKEN_LENGTH_BYTES);

        // A requestor that may obtain the consent itself gets the update without asking; else we ask for a consent if
        // the update details require one
        const delegated = consentRequired && manager.mayDelegateConsentTo(peerAddress, request);
        if (consentRequired && !delegated) {
            manager.reportAttemptStatus(attempt, OtaUpdateStatus.WaitForConsent);

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
                    break;
                case OtaSoftwareUpdateConsentState.Obtaining:
                    return {
                        status: OtaSoftwareUpdateProvider.Status.Busy,
                        delayedActionTime: Seconds.of(delayTime),
                    };
                case OtaSoftwareUpdateConsentState.Denied:
                case OtaSoftwareUpdateConsentState.Unknown:
                default:
                    manager.reportAttemptStatus(attempt, OtaUpdateStatus.Cancelled);
                    return {
                        status: OtaSoftwareUpdateProvider.Status.NotAvailable,
                    };
            }
        }

        // Synchronous BDX is mandatory, so it should always be supported, and because we manage the OTA files,
        //  we always prefer a local transfer over an HTTPS one directly from the device
        const viaBdx = protocolsSupported.includes(OtaSoftwareUpdateProvider.DownloadProtocol.BdxSynchronous);
        const httpsImageUri =
            viaBdx || !protocolsSupported.includes(OtaSoftwareUpdateProvider.DownloadProtocol.Https)
                ? undefined
                : httpsUri;
        if (!viaBdx && httpsImageUri === undefined) {
            return {
                status: OtaSoftwareUpdateProvider.Status.DownloadProtocolNotSupported,
            };
        }

        if (!manager.offerUpdate(attempt, updateToken, newSoftwareVersion)) {
            return { status: OtaSoftwareUpdateProvider.Status.NotAvailable };
        }
        manager.reportAttemptStatus(attempt, OtaUpdateStatus.Querying);

        let imageUri: string;
        if (httpsImageUri === undefined) {
            // Enable BDX for this scope
            const bdxProtocol = this.env.get(BdxProtocol);
            if (
                !bdxProtocol.enablePeerForScope(peerAddress, this.updateStorage, {
                    preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                    // That's also the default but especially stated for OTA, but let's set it explicitly
                    messageTimeout: Minutes(5),
                    ...manager.bdxTransferOptionsFor(peerAddress),
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

                // A failed download is retried on a fresh session, so stay registered for the whole cycle; the attempt
                // removes this listener when it ends
                this.#reportStatus(attempt, OtaUpdateStatus.Downloading);
                // A transfer in flight keeps its attempt alive; the status does not change again until it ends
                bdxSession.progressInfo.on(() => attempt.touch());
                bdxSession.progressFinished.on(() => this.#reportStatus(attempt, OtaUpdateStatus.WaitForApply));
                bdxSession.progressCancelled.on(() => this.#reportStatus(attempt, OtaUpdateStatus.Cancelled));
                bdxSession.closed.once(() => {
                    if (
                        attempt.status !== OtaUpdateStatus.WaitForApply &&
                        attempt.status !== OtaUpdateStatus.Applying &&
                        attempt.status !== OtaUpdateStatus.Done &&
                        attempt.status !== OtaUpdateStatus.Cancelled
                    ) {
                        this.#reportStatus(attempt, OtaUpdateStatus.Cancelled);
                    }
                });
            };
            bdxProtocol.sessionStarted.on(sessionListener);
            attempt.onEnd(() => bdxProtocol.sessionStarted.off(sessionListener));

            // And keep it open until a minimum 5 minutes after the last block transfer to allow partial downloads

            imageUri = fileDesignator.asBdxUri(session.associatedFabric.rootNodeId);
        } else {
            imageUri = httpsImageUri;
        }

        manager.offerAnswered(attempt);
        return {
            status: OtaSoftwareUpdateProvider.Status.UpdateAvailable,
            imageUri,
            softwareVersion: newSoftwareVersion,
            softwareVersionString: newSoftwareVersionString,
            updateToken,
            userConsentNeeded: delegated ? true : undefined,
            metadataForRequestor,
        };
    }

    /**
     * Default implementation of the ApplyUpdate command according to Matter specification.
     * An update is allowed to apply after {@link OtaSoftwareUpdateProviderServer.State.applyDelay} when the
     * SoftwareUpdateManager allows it, see {@link SoftwareUpdateManager.applyUpdate}; version 0 names the version
     * offered under the update token, see {@link SoftwareUpdateManager.appliedVersionOf}.
     */
    override async applyUpdateRequest(
        request: OtaSoftwareUpdateProvider.ApplyUpdateRequest,
    ): Promise<OtaSoftwareUpdateProvider.ApplyUpdateResponse> {
        const { updateToken, newVersion } = request;
        assertRemoteActor(this.context);
        const session = this.context.session;
        NodeSession.assert(session);

        const manager = this.agent.get(SoftwareUpdateManager);
        const attempt = manager.attemptFor(session.peerAddress, updateToken);

        const bdxProtocol = this.env.get(BdxProtocol);
        try {
            await bdxProtocol.disablePeerForScope(
                session.peerAddress,
                this.updateStorage,
                attempt?.status !== OtaUpdateStatus.WaitForApply, // Force close when not known as completed
            );
        } catch (error) {
            MatterError.accept(error);
            logger.info("Error while closing BDX session for OTA update apply request, continuing anyway:", error);
        }

        // Whole seconds as the response carries them, rounded up because the delay is a minimum wait, and at most a
        // day, which a requestor may treat any longer delay as; the controller starts its restart window with it
        const delayedActionTime = Math.min(
            MAX_DELAYED_ACTION_TIME,
            Math.max(0, Math.ceil(Seconds.fractionalOf(this.state.applyDelay))),
        );
        const proceed = manager.applyUpdate(session.peerAddress, updateToken, newVersion, Seconds(delayedActionTime));
        if (!proceed) {
            return {
                action: OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue,
                delayedActionTime: Seconds.of(Minutes(2)),
            };
        }
        return {
            action: OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed,
            delayedActionTime,
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

        this.agent.get(SoftwareUpdateManager).updateApplied(session.peerAddress, updateToken, softwareVersion);
    }

    /**
     * Extension method if the node wants to handle automatic user consent gathering itself. By default, it declines
     * the update request, which answers "not available".  It is asked only for an offer with `consentRequired` that is
     * not delegated to the requestor, which the default {@link checkUpdateAvailable} never makes.
     */
    protected requestUserConsentForUpdate(
        _request: OtaSoftwareUpdateProvider.QueryImageRequest,
        _updateDetails: OtaUpdateAvailableDetails,
        _peerAddress: PeerAddress,
    ): MaybePromise<{ consentState: OtaSoftwareUpdateConsentState; delayTime?: Duration }> {
        return { consentState: OtaSoftwareUpdateConsentState.Unknown };
    }

    /**
     * Override to customize how to check for available updates.  Returning `undefined` answers "not available".
     * The default offers what {@link SoftwareUpdateManager.updateExistsFor} selects, and when that is nothing, it lets
     * {@link SoftwareUpdateManager.dropUndeliverableUpdate} fail the update queued for the node.  An override decides
     * itself whether to call the latter.
     * All additional data like hardware, location, and MetadataForProvider can be checked here for specific logic
     */
    protected checkUpdateAvailable(
        request: OtaSoftwareUpdateProvider.QueryImageRequest,
        peerAddress: PeerAddress,
    ): MaybePromise<OtaUpdateAvailableDetails | undefined> {
        return this.endpoint.act(async agent => {
            const manager = agent.get(SoftwareUpdateManager);
            const details = await manager.updateExistsFor(peerAddress, request);
            if (details === undefined) {
                manager.dropUndeliverableUpdate(peerAddress, request.softwareVersion);
            }
            return details;
        });
    }

    /** Reports a status from a BDX session listener, which runs outside of this behavior's context. */
    #reportStatus(attempt: OtaUpdateAttempt, status: OtaUpdateStatus) {
        MaybePromise.catch(
            this.endpoint.act(agent => agent.get(SoftwareUpdateManager).reportAttemptStatus(attempt, status)),
            error =>
                logger.warn(`Could not report the status ${OtaUpdateStatus[status]} of ${attempt.toString()}:`, error),
        );
    }
}

export namespace OtaSoftwareUpdateProviderServer {
    export class State extends OtaSoftwareUpdateProviderBehavior.State {
        /**
         * How long a requestor allowed to apply an update waits before it applies, sent as `DelayedActionTime` in
         * whole seconds, rounded up and at most a day.  The default applies at once.
         *
         * @see {@link MatterSpecification.v161.Core} § 11.20.6.5.4.2
         */
        applyDelay: Duration = 0;
    }

    export class Internal {
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
         * Override to customize how to check for available updates.  Returning `undefined` answers "not available".
         * @param request
         * @param peerAddress
         */
        checkUpdateAvailable(
            request: OtaSoftwareUpdateProvider.QueryImageRequest,
            peerAddress: PeerAddress,
        ): MaybePromise<OtaUpdateAvailableDetails | undefined>;
    };
}
