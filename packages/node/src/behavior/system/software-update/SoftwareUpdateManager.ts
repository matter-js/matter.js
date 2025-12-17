/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { OtaAnnouncements } from "#behavior/system/software-update/OtaAnnouncements.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { OtaSoftwareUpdateProvider } from "#clusters/ota-software-update-provider";
import { OtaSoftwareUpdateRequestor } from "#clusters/ota-software-update-requestor";
import { Endpoint } from "#endpoint/Endpoint.js";
import {
    Bytes,
    Diagnostic,
    Duration,
    EventEmitter,
    Hours,
    ImplementationError,
    InternalError,
    Logger,
    Millis,
    Minutes,
    Observable,
    ObserverGroup,
    Seconds,
    SharedEnvironmentServices,
    Time,
    Timer,
} from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import { DclOtaUpdateService, FabricAuthority, FileDesignator, OtaUpdateError, PeerAddress } from "#protocol";
import { VendorId } from "#types";

const logger = Logger.get("SoftwareUpdateManager");

interface UpdateConsent {
    vendorId: VendorId;
    productId: number;
    targetSoftwareVersion: number;
    peerAddress: PeerAddress;
}

interface UpdateQueueEntry extends UpdateConsent {
    endpoint: Endpoint;
    lastProgressUpdateTime?: number;
    lastProgressStatus?: OtaUpdateStatus;
}

interface UpdateConsentEntry extends DclOtaUpdateService.OtaUpdateListEntry {
    consentPeers: PeerAddress[];
}

interface CollectedNodesUpdateInfo {
    vendorId: VendorId;
    productId: number;
    softwareVersion: number;
    softwareVersionString: string;
    otaEndpoints: Set<{ endpoint: Endpoint; peerAddress: PeerAddress }>;
}

export interface OtaUpdateAvailableDetails {
    newSoftwareVersion: number;
    newSoftwareVersionString: string;
    fileDesignator: FileDesignator;
    httpsUri?: string;
    consentRequired: boolean;
    metadataForRequestor?: Bytes; // If provided will be passed back with the QueryImage command
}

export enum OtaUpdateStatus {
    Unknown,
    Querying,
    Downloading,
    WaitForApply,
    Applying,
    Done,
}

export interface SoftwareUpdateInfo {
    /** VendorId of the updated device */
    vendorId: VendorId;

    /** ProductId of the updated device */
    productId: number;

    /** Software version of the updated device */
    softwareVersion: number;

    /** Software Version String of the updated device */
    softwareVersionString: string;

    /** ReleaseNotesUrl for the update */
    releaseNotesUrl?: string;

    /** SpecificationVersion of the updated device */
    specificationVersion?: number;
}

/**
 * The Software Update Manager is the instance to bridge between the central OTA store and DCL service and mange the
 * updates for all peers of a node. It gets installed on the endpoint where the OtaSoftwareUpdateProvider behavior is
 * installed. It uses the generic DclOtaUpdateService, which exists globally, to request and get new updates.
 *
 * The following state allows configuring the behavior:
 * * `startupConsents`: Use this to pre-initialize consent to allow nodes to update automatically. The value will not
 *     be persisted, and change during runtime is only supported via `addUpdateConsent`.
 * * `allowTestOtaImages`: When set to true, we also query the Test DCL additionally to the production DCL for update
 *     and use this when a newer version is found. Default is false
 * * `updateCheckInterval`: By default, we check the DCL for updates every 24h. This state value allows adjusting this.
 * * `announceAsDefaultProvider`: By default, we announce ourselves as a default update provider to all nodes in the fabric.
 *     Set to "false" if this is not wanted and updates are only pushed on availability
 */
export class SoftwareUpdateManager extends Behavior {
    static override readonly id = "softwareupdates";

    declare state: SoftwareUpdateManager.State;
    declare internal: SoftwareUpdateManager.Internal;
    declare events: SoftwareUpdateManager.Events;

    override async initialize() {
        this.internal.services = this.env.asDependent();
        this.internal.otaService = this.internal.services.get(DclOtaUpdateService);

        const node = Node.forEndpoint(this.endpoint);
        this.reactTo(node.lifecycle.online, this.#nodeOnline);
        if (node.lifecycle.isOnline) {
            await this.#nodeOnline();
        }
    }

    async #nodeOnline() {
        if (this.internal.announcements !== undefined) {
            await this.internal.announcements.close();
            this.internal.announcements = undefined;
        }

        const fabricAuthority = this.env.get(FabricAuthority);
        const ownFabric = fabricAuthority.fabrics[0];
        if (!ownFabric) {
            // Can only happen if the SoftwareUpdateManager is used without any commissioned nodes
            logger.info(`No commissioned peers yet, cannot check for OTA updates. Wait for Fabric being added.`);
            fabricAuthority.fabricAdded.once(this.callback(this.#nodeOnline));
            return;
        }
        if (this.state.announceAsDefaultProvider) {
            this.internal.announcements = new OtaAnnouncements(
                this.endpoint,
                ownFabric,
                this.state.announcementInterval,
            );
        }

        // Randomly force the first update check 5-10 minutes after startup
        const delay = Millis(Seconds(Math.floor(Math.random() * 300)) + Minutes(10));
        logger.info(`Scheduling first OTA update check in ${Duration.format(delay)}`);
        this.internal.checkForUpdateTimer?.stop();
        this.internal.checkForUpdateTimer = Time.getTimer(
            "initializeUpdateCheck",
            delay,
            this.callback(this.#initializeUpdateCheck),
        ).start();
    }

    /**
     * Trigger the first check for updates some time after the node went online, and register a periodic interval
     * afterward.
     */
    async #initializeUpdateCheck() {
        try {
            await this.#checkAvailableUpdates();
        } catch (error) {
            logger.error(`Error during initial OTA update check:`, error);
        }

        this.internal.checkForUpdateTimer.stop();
        this.internal.checkForUpdateTimer = Time.getPeriodicTimer(
            "checkAvailableUpdates",
            this.state.updateCheckInterval,
            this.callback(this.#checkAvailableUpdates),
        ).start();
    }

    get storage() {
        return this.internal.otaService.storage;
    }

    /**
     * Used to determine if an update is existing in our storage for a peer with a certain software version.
     *
     * It uses the already checked details and does not check again on-demand. It considers consents already given.
     */
    async updateExistsFor(
        peerAddress: PeerAddress,
        { softwareVersion, vendorId, productId, requestorCanConsent }: OtaSoftwareUpdateProvider.QueryImageRequest,
    ): Promise<OtaUpdateAvailableDetails | undefined> {
        // We just use what we know from our last check here, so no on-demand DCL checks for now
        const availableUpdates = await this.internal.otaService.find({ vendorId, productId });

        const candidates = availableUpdates
            .filter(
                ({
                    vendorId: candidateVendorId,
                    productId: candidateProductId,
                    softwareVersion: candidateSoftwareVersion,
                    minApplicableSoftwareVersion = 0,
                    maxApplicableSoftwareVersion = softwareVersion,
                    mode,
                }) =>
                    vendorId === candidateVendorId &&
                    productId === candidateProductId &&
                    softwareVersion < candidateSoftwareVersion &&
                    softwareVersion >= minApplicableSoftwareVersion &&
                    softwareVersion <= maxApplicableSoftwareVersion &&
                    (this.state.allowTestOtaImages || mode !== "test"),
            )
            .sort((a, b) => b.softwareVersion - a.softwareVersion);

        if (candidates.length === 0) {
            return undefined;
        }

        const candidatesWithConsent: UpdateConsentEntry[] = candidates.map(candidate => {
            const consent = this.state.startupConsents
                .filter(consent => consent.vendorId === candidate.vendorId && consent.productId === candidate.productId)
                .filter(consent => consent.targetSoftwareVersion >= candidate.softwareVersion); // Consent for this or higher version applies

            return {
                ...candidate,
                consentPeers: consent.map(c => c.peerAddress),
            };
        });

        // We have a candidate list, now see about consent
        let candidate: UpdateConsentEntry | undefined;
        let consentRequired = false;
        if (requestorCanConsent) {
            // Ok the request can get consent himself, so we just use the first candidate version and determine if
            // consent is needed to be requested or if we already have it
            candidate = candidatesWithConsent[0];
            consentRequired = !candidate.consentPeers.some(
                ({ fabricIndex, nodeId }) => fabricIndex === peerAddress.fabricIndex && nodeId === peerAddress.nodeId,
            );
        } else {
            // Find the first candidate where we have consent already, if any
            candidate = candidatesWithConsent.find(({ consentPeers }) =>
                consentPeers.some(
                    ({ fabricIndex, nodeId }) =>
                        fabricIndex === peerAddress.fabricIndex && nodeId === peerAddress.nodeId,
                ),
            );
        }

        if (candidate) {
            const { softwareVersion, softwareVersionString, filename } = candidate;

            return {
                newSoftwareVersion: softwareVersion,
                newSoftwareVersionString: softwareVersionString,
                fileDesignator: new FileDesignator(`ota/${filename}`),
                // We do not provide any httpsUri here, as we expect the node to download from our DCL proxy via BDX
                consentRequired,
            };
        } else {
            logger.info(
                `No update candidate found for node ${peerAddress.nodeId} in fabric ${peerAddress.fabricIndex} for any update`,
            );
        }
    }

    /** Triggered by a Timer to call the update with different parameters */
    async #checkAvailableUpdates() {
        await this.queryUpdates();
    }

    /**
     * Checks all nodes, or optionally a defined one, for available updates from the DCL OTA Update Service.
     *
     * Returns a list of peers for which updates are available along with the collected update info.
     */
    async queryUpdates(options: { peerToCheck?: ClientNode; includeStoredUpdates?: boolean } = {}) {
        const { peerToCheck, includeStoredUpdates = false } = options;
        const rootNode = Node.forEndpoint(this.endpoint) as ServerNode;

        // Collect all client nodes and their versions, so we only need to check each version once
        const updateDetails = new Map<string, CollectedNodesUpdateInfo>();
        for (const peer of rootNode.peers) {
            if (peerToCheck !== undefined && peerToCheck !== peer) {
                continue;
            }

            const details = this.#preparePeerForUpdate(peer);
            if (details === undefined) {
                continue;
            }
            const { otaEndpoint, peerAddress, vendorId, productId, softwareVersion, softwareVersionString } = details;

            const key = `${vendorId}-${productId}-${softwareVersion}`;
            const versionData = updateDetails.get(key) ?? {
                vendorId,
                productId,
                softwareVersion,
                softwareVersionString,
                otaEndpoints: new Set<{ endpoint: Endpoint; peerAddress: PeerAddress }>(),
            };
            versionData.otaEndpoints.add({ endpoint: otaEndpoint, peerAddress });
            updateDetails.set(key, versionData);
        }
        if (updateDetails.size === 0) {
            logger.info(`No updatable nodes found`);
            return [];
        }

        const peersWithUpdates = new Array<{ peerAddress: PeerAddress; info: CollectedNodesUpdateInfo }>();
        for (const infos of updateDetails.values()) {
            const peers = await this.#checkProductForUpdates(infos, includeStoredUpdates);
            for (const peer of peers) {
                peersWithUpdates.push({ peerAddress: peer, info: infos });
            }
        }

        return peersWithUpdates;
    }

    /**
     * Check storage and DCL for updates for the given product/version, downloads it, and notify nodes if an update was
     * found
     */
    async #checkProductForUpdates(infos: CollectedNodesUpdateInfo, includeStoredUpdates: boolean) {
        const { vendorId, productId, softwareVersion, otaEndpoints } = infos;

        const updateDetails = await this.internal.otaService.checkForUpdate({
            vendorId,
            productId,
            currentSoftwareVersion: softwareVersion,
            includeStoredUpdates,
        });
        if (!updateDetails) {
            return [];
        }
        const fd = await this.internal.otaService.downloadUpdate(updateDetails);

        logger.info(
            "OTA update available for",
            Diagnostic.dict({
                vendorId,
                productId,
                softwareVersion,
                file: `ota/${fd.text}`,
                peers: [...otaEndpoints.values()].map(({ endpoint }) => Node.forEndpoint(endpoint).id),
            }),
        );

        // Request consent or notify peers about the update if we have consent
        for (const { endpoint, peerAddress } of otaEndpoints) {
            const hasConsent = this.state.startupConsents.some(
                consent =>
                    consent.vendorId === vendorId &&
                    consent.productId === productId &&
                    consent.targetSoftwareVersion === updateDetails.softwareVersion &&
                    consent.peerAddress.fabricIndex === peerAddress.fabricIndex &&
                    consent.peerAddress.nodeId === peerAddress.nodeId,
            );
            if (hasConsent) {
                // We already have a consent for this update, so just announce the provider
                this.#queueUpdate({
                    endpoint,
                    vendorId,
                    productId,
                    targetSoftwareVersion: updateDetails.softwareVersion,
                    peerAddress,
                });
            } else {
                // Inform the application that an update is available and we need consent
                const { vid, pid, softwareVersion, softwareVersionString, releaseNotesUrl, specificationVersion } =
                    updateDetails;
                this.requestConsentForUpdate(peerAddress, {
                    vendorId: vid,
                    productId: pid,
                    softwareVersion,
                    softwareVersionString,
                    releaseNotesUrl,
                    specificationVersion,
                });
            }
        }

        return [...otaEndpoints.values()].map(({ peerAddress }) => peerAddress);
    }

    /**
     * Determine if we can request an update for the given node and return node meta-data needed for the process.
     * The Node needs to be commissioned (have a peer address), being not disabled, and having an active subscription
     * (to not work with outdated data).
     * When a node is applicable for updates, it also subscribes to softwareVersion changes to be able to react
     */
    #preparePeerForUpdate(peer: ClientNode) {
        const otaData = this.internal.announcements?.peerApplicableForUpdate(peer);
        if (otaData === undefined) {
            // We need more information on the node to request an update
            return;
        }
        const { peerAddress, otaEndpoint } = otaData;

        const { vendorId, productId, softwareVersion, softwareVersionString } = peer.stateOf(BasicInformationClient);

        // Todo sort out test vendors?

        const that = this;
        function triggerVersionChange(newVersion: number) {
            that.#onSoftwareVersionChanged(peerAddress, newVersion);
        }

        // Node is applicable for update checks, register listener on softwareVersion to allow resetting update state
        this.internal.versionUpdateObservers.on(
            peer.eventsOf(BasicInformationClient)?.softwareVersion$Changed,
            this.callback(triggerVersionChange),
        );

        return { otaEndpoint, peerAddress, vendorId, productId, softwareVersion, softwareVersionString };
    }

    /** Handler for softwareVersion changes on a peer */
    #onSoftwareVersionChanged(peerAddress: PeerAddress, newVersion: number) {
        const entryIndex = this.internal.updateQueue.findIndex(
            e => e.peerAddress.fabricIndex === peerAddress.fabricIndex && e.peerAddress.nodeId === peerAddress.nodeId,
        );
        if (entryIndex === -1) {
            return;
        }
        const entry = this.internal.updateQueue[entryIndex];
        if (entry.lastProgressUpdateTime !== undefined) {
            logger.info(
                `Clearing in-progress update for node ${peerAddress.toString()} due to software version change. Last State was ${OtaSoftwareUpdateRequestor.UpdateState[entry.lastProgressStatus!]}`,
            );
            entry.lastProgressUpdateTime = OtaSoftwareUpdateRequestor.UpdateState.Unknown;
            entry.lastProgressStatus = undefined;
        }
        const expectedVersion = entry.targetSoftwareVersion;
        if (newVersion < expectedVersion) {
            logger.info(
                `Software version for node ${peerAddress.toString()} changed to ${newVersion}, but still below target version ${expectedVersion}, keeping in update queue`,
            );
            return;
        }
        logger.info(
            `Software version changed to ${newVersion} (expected ${expectedVersion}) for node ${peerAddress.toString()}, removing from update queue`,
        );
        if (newVersion >= entry.targetSoftwareVersion) {
            this.events.updateDone.emit(peerAddress);
        }
        this.internal.updateQueue.splice(entryIndex, 1);

        this.#triggerQueuedUpdate();
    }

    /**
     * Notify the application that consent is needed for the given update on the given peer
     */
    protected requestConsentForUpdate(peerAddress: PeerAddress, updateDetails: SoftwareUpdateInfo) {
        this.internal.knownUpdates.set(peerAddress.toString(), updateDetails);
        this.events.updateAvailable.emit(peerAddress, updateDetails);
    }

    /**
     * Add an update to the update queue and execute it
     */
    #queueUpdate(entry: UpdateQueueEntry) {
        logger.info(`Queuing update consent for node ${entry.peerAddress.toString()}`);
        this.internal.updateQueue.push(entry);

        this.#triggerQueuedUpdate();
    }

    /**
     * Triggers updates for queued entries in the update queue, ensuring proper prioritization and handling of stalled
     * updates. This method checks for ongoing updates, resets states for stalled updates, and processes the next entry
     * in the queue if no update is currently in progress.
     *
     * The queue is re-sorted to prioritize entries with an unknown status, and a periodic timer is activated to
     * monitor for stalled updates.
     */
    #triggerQueuedUpdate() {
        const now = Time.nowMs;
        const inProgressEntries = this.internal.updateQueue.filter(
            ({ lastProgressUpdateTime }) => lastProgressUpdateTime !== undefined,
        );
        let inProgressCount = inProgressEntries.length;
        if (inProgressCount === 0 && this.internal.updateQueueTimer?.isRunning) {
            // No update in progress, stop timer
            this.internal.updateQueueTimer.stop();
        } else if (inProgressCount > 0) {
            // Check if all last Status are at least 15 minutes old, reset them to unknown and no time
            for (const entry of inProgressEntries) {
                if (entry.lastProgressUpdateTime! + Minutes(15) < now) {
                    logger.info(
                        `Resetting stalled OTA update state for node ${entry.peerAddress.toString()} due to inactivity`,
                    );
                    entry.lastProgressUpdateTime = undefined;
                    entry.lastProgressStatus = OtaUpdateStatus.Unknown;
                    inProgressCount--;
                }
            }
        }
        if (inProgressCount > 0) {
            // An update is already in progress
            return;
        }
        // Re-sort queue to prioritize entries without an Unknown status. Means the lastProgressStatus of "undefined"
        // is sorted first, all others last
        this.internal.updateQueue = this.internal.updateQueue.sort((a, b) => {
            const aStatus = a.lastProgressStatus === OtaUpdateStatus.Unknown ? 1 : 0;
            const bStatus = b.lastProgressStatus === OtaUpdateStatus.Unknown ? 1 : 0;
            return aStatus - bStatus;
        });
        const nextEntry = this.internal.updateQueue[0];
        if (nextEntry) {
            this.#triggerUpdateOnNode(nextEntry).catch(error => {
                logger.error(`Error while triggering OTA update on node ${nextEntry.peerAddress.toString()}:`, error);
                // TODO Reset entry state?
            });
            if (!this.internal.updateQueueTimer?.isRunning) {
                // Start periodic timer to check for stalled updates
                this.internal.updateQueueTimer = Time.getPeriodicTimer(
                    "checkQueuedUpdates",
                    Minutes(5),
                    this.callback(this.#triggerQueuedUpdate),
                ).start();
            }
        }
    }

    /**
     * Triggers an update on the given node. This method announces ourselves as OTA Provider to the node with an
     * available update and then triggers the update on the node.
     * The node usually calls queryImage as a result of this when it processes the announcement.
     */
    async #triggerUpdateOnNode(entry: UpdateQueueEntry) {
        if (this.internal.announcements == undefined) {
            logger.info(`Not yet initialized with peers, can not trigger update on node`, entry.peerAddress);
            return;
        }

        const { endpoint, peerAddress } = entry;
        entry.lastProgressUpdateTime = Time.nowMs;

        try {
            logger.info(`Announcing OTA provider to node ${peerAddress.toString()}`);
            await this.internal.announcements.announceOtaProvider(
                endpoint,
                peerAddress,
                OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable,
            );
            const queueEntryIndex = this.internal.updateQueue.indexOf(entry);
            if (queueEntryIndex >= 0) {
                this.internal.updateQueue[queueEntryIndex].lastProgressUpdateTime = Date.now();
            } else {
                this.internal.updateQueue.push({
                    ...entry,
                    lastProgressUpdateTime: Date.now(),
                });
            }
        } catch (error) {
            logger.error(`Failed to announce OTA provider to node ${peerAddress.toString()}:`, error);
        }
    }

    /**
     * Forces an OTA update for a specific node identified by its peer address, vendor ID, product ID,
     * and target software version. This method will override any ongoing updates by explicitly adding an update
     * consent for the specified node and processing the update immediately if applicable.
     * This can be used when an exact timing of the update is needed. When the update can be executed in a delayed/queued
     * manner, please use `addUpdateConsent()`.
     */
    async forceUpdate(peerAddress: PeerAddress, vendorId: VendorId, productId: number, targetSoftwareVersion: number) {
        if (this.internal.updateQueue.some(({ lastProgressUpdateTime }) => lastProgressUpdateTime !== undefined)) {
            logger.warn(`Forcing update while another update might be in progress.`);
        }

        const added = await this.addUpdateConsent(peerAddress, vendorId, productId, targetSoftwareVersion);
        if (!added) {
            throw new OtaUpdateError(`Node at ${peerAddress.toString()} is not currently applicable for OTA updates`);
        }

        const entry = this.internal.updateQueue.find(
            e =>
                e.peerAddress.fabricIndex === peerAddress.fabricIndex &&
                e.peerAddress.nodeId === peerAddress.nodeId &&
                e.vendorId === vendorId &&
                e.productId === productId &&
                e.targetSoftwareVersion === targetSoftwareVersion,
        );
        if (!entry) {
            throw new InternalError(`Failed to find queued update after adding consent`); // Should not happen
        }
        if (this.internal.updateQueue.length === 1) {
            return; // Only entry, already being processed
        }

        await this.#triggerUpdateOnNode(entry);
    }

    /**
     * Adds or updates a consent for a given peer address, vendor ID, product ID, and target software version.
     * Filters out existing consents for the given peer address and replaces them with the new one.
     * If the node associated with the peer address is applicable for an update, it schedules the update to happen with
     * the next queue slot, so potentially delayed.
     * This can be used when the update can be executed in a delayed/queued manner and it does not matter exactly when.
     */
    async addUpdateConsent(
        peerAddress: PeerAddress,
        vendorId: VendorId,
        productId: number,
        targetSoftwareVersion: number,
    ) {
        // Filter out all existing consents for this peer, they are replaced by the new one
        const consents = this.state.startupConsents.filter(
            consent =>
                consent.peerAddress.fabricIndex !== peerAddress.fabricIndex &&
                consent.peerAddress.nodeId !== peerAddress.nodeId,
        );

        const node = await (Node.forEndpoint(this.endpoint) as ServerNode).peers.forAddress(peerAddress);
        const {
            otaEndpoint,
            vendorId: nodeVendorId,
            productId: nodeProductId,
        } = this.#preparePeerForUpdate(node) ?? {};
        if (otaEndpoint !== undefined && (nodeVendorId !== vendorId || nodeProductId !== productId)) {
            throw new ImplementationError(`Node at ${peerAddress.toString()} does not match given vendorId/productId`);
        }

        consents.push({
            vendorId,
            productId,
            targetSoftwareVersion,
            peerAddress,
        });
        this.state.startupConsents = consents;

        if (otaEndpoint === undefined) {
            logger.info(
                `Node ${peerAddress.toString()} has no OTA requestor and is currently not applicable for OTA updates, update delayed`,
            );
            return false;
        }

        this.#queueUpdate({ vendorId, productId, targetSoftwareVersion, peerAddress, endpoint: otaEndpoint });
        return true;
    }

    /**
     * Handles the status change of an OTA update for a given peer device.
     *
     * This method processes OTA update status notifications received from a specified device.
     * Based on the status, it updates the internal state of the update queue, logs relevant
     * messages, and triggers the necessary events.
     */
    onOtaStatusChange(peerAddress: PeerAddress, status: OtaUpdateStatus, toVersion?: number) {
        const entryIndex = this.internal.updateQueue.findIndex(
            e => e.peerAddress.fabricIndex === peerAddress.fabricIndex && e.peerAddress.nodeId === peerAddress.nodeId,
        );
        if (entryIndex < 0) {
            logger.warn(
                `Received OTA status update from unknown node ${peerAddress.toString()}, status=${OtaUpdateStatus[status]}`,
            );
            return;
        }

        const entry = this.internal.updateQueue[entryIndex];
        if (status === OtaUpdateStatus.Done) {
            logger.info(`OTA update completed for node`, peerAddress.toString());
            this.internal.updateQueue.splice(entryIndex, 1);
            this.events.updateDone.emit(peerAddress);
        } else {
            logger.info(
                `OTA update status for node ${peerAddress.toString()} changed to ${OtaUpdateStatus[status]}${
                    toVersion !== undefined ? ` for version ${toVersion}` : ""
                }`,
            );
            entry.lastProgressUpdateTime = Time.nowMs;
            entry.lastProgressStatus = status;
        }
    }

    override async [Symbol.asyncDispose]() {
        this.internal.checkForUpdateTimer?.stop();
        this.internal.updateQueueTimer?.stop();
        await this.internal.announcements?.close();
        this.internal.services?.close(DclOtaUpdateService);
        this.internal.versionUpdateObservers.close();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace SoftwareUpdateManager {
    export class State {
        /** Use this to pre-initialize consent to allow nodes to update automatically. The content will not be persisted! */
        startupConsents = new Array<UpdateConsent>();

        /** Set this to true to also allow updates from the Test DCL */
        allowTestOtaImages = false;

        /** Default Update check Interval */
        updateCheckInterval = Hours(24);

        /** Announce this controller as Update provider to all nodes */
        announceAsDefaultProvider = true;

        /** Interval to Announces this controller as Update provider. Must not be lower than 24h! */
        announcementInterval = Hours(24);
    }

    export class Internal {
        services?: SharedEnvironmentServices;

        otaService!: DclOtaUpdateService;

        checkForUpdateTimer!: Timer;

        updateQueue = new Array<UpdateQueueEntry>();

        updateQueueTimer?: Timer;

        announcements?: OtaAnnouncements;

        versionUpdateObservers = new ObserverGroup();

        knownUpdates = new Map<string, SoftwareUpdateInfo>();
    }

    export class Events extends EventEmitter {
        /** Emitted when an update is available for a Peer and there is no consent stored and contains update details */
        updateAvailable = Observable<[peer: PeerAddress, updateDetails: SoftwareUpdateInfo]>();

        /** Emitted when an update for a Peer is finished */
        updateDone = Observable<[peer: PeerAddress]>();
    }
}
