/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import type { ActionContext } from "#behavior/context/ActionContext.js";
import { DclBehavior } from "#behavior/system/dcl/DclBehavior.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { OtaAnnouncements } from "#behavior/system/software-update/OtaAnnouncements.js";
import { OTA_PROGRESS_TIMEOUT, OtaUpdateStatus } from "#behavior/system/software-update/OtaProgress.js";
import { OtaUpdateAttempt, OtaUpdateAttempts } from "#behavior/system/software-update/OtaUpdateAttempts.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { Endpoint } from "#endpoint/Endpoint.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    Abort,
    Bytes,
    causedBy,
    ClosedError,
    Diagnostic,
    Duration,
    EventEmitter,
    Hours,
    ImplementationError,
    InternalError,
    Logger,
    MatterError,
    Millis,
    Minutes,
    Observable,
    ObserverGroup,
    Seconds,
    Time,
    TimeoutError,
    Timer,
    Timestamp,
} from "@matter/general";
import type { NodeSession, Peer, Session } from "@matter/protocol";
import {
    BdxProtocol,
    ClientSubscriptions,
    DclOtaUpdateService,
    FabricAuthority,
    FileDesignator,
    hasRemoteActor,
    OtaUpdateError,
    OtaUpdateSource,
    PeerAddress,
    PeerAddressMap,
    PeerSet,
    RebootResubscribeArmer,
    SessionManager,
    StorageScope,
} from "@matter/protocol";
import { VendorId } from "@matter/types";
import { OtaSoftwareUpdateProvider } from "@matter/types/clusters/ota-software-update-provider";
import { OtaSoftwareUpdateRequestor } from "@matter/types/clusters/ota-software-update-requestor";

const logger = Logger.get("SoftwareUpdateManager");

/** Rejects transfer options a BDX session could not honour, before any state changes on their behalf. */
function assertTransferOptions({ maxBdxBlockSize, bdxAdditionalMrpDelay }: SoftwareUpdateManager.UpdateTarget) {
    if (maxBdxBlockSize !== undefined && (!Number.isInteger(maxBdxBlockSize) || maxBdxBlockSize <= 0)) {
        throw new ImplementationError(`maxBdxBlockSize must be a positive integer, got ${maxBdxBlockSize}`);
    }
    if (bdxAdditionalMrpDelay !== undefined && (!Number.isFinite(bdxAdditionalMrpDelay) || bdxAdditionalMrpDelay < 0)) {
        throw new ImplementationError(
            `bdxAdditionalMrpDelay must be a finite, non-negative duration, got ${bdxAdditionalMrpDelay}`,
        );
    }
}

/**
 * The consent the application gave for a peer, one per peer.  `failedAt` is set when the update to its version
 * failed after the consent was given.
 */
interface UpdateConsent extends SoftwareUpdateManager.UpdateTarget {
    peerAddress: PeerAddress;
    failedAt?: Timestamp;
}

/**
 * Where a queued update stands.
 *
 * | `state`      | Meaning                                              | Leaves the state when                       |
 * |--------------|------------------------------------------------------|---------------------------------------------|
 * | `queued`     | Waits for an announcement; `resetAt` when it was     | an announcement starts or an attempt is     |
 * |              | reset.  Not announced while its consent failed       | linked                                      |
 * | `announcing` | The announcement runs                                | it ends or is aborted, an attempt is        |
 * |              |                                                      | linked, the target moves, or the update     |
 * |              |                                                      | fails                                       |
 * | `announced`  | The node was announced and made no answered attempt  | an attempt is linked, the target moves, the |
 * |              | since `since`                                        | update fails or stalls, the node restarts   |
 * |              |                                                      | below the target, or a forced update resets |
 * | `progress`   | The node follows `attempt`, see {@link #linkAttempt} | the attempt ends, the update fails or       |
 * |              |                                                      | stalls, the node restarts below the target, |
 * |              |                                                      | or a forced update resets it                |
 *
 * Outside `progress`, the target of an entry is the version of the peer's consent.  An entry in `progress` keeps the
 * version of its attempt and takes the version of the consent when the attempt ends, see {@link #retarget}.
 *
 * Statuses of an attempt move the entry only while the entry is linked to it.  Facts about the node itself move the
 * entry in any state: its software version after a restart or resubscription, and a NotifyUpdateApplied with a version
 * at or above the target, from any attempt.
 *
 * An announcement aborts after {@link OTA_PROGRESS_TIMEOUT}.  `announced` and `progress` return to `queued` when the
 * node shows no activity for that long, plus the `applyDelay` of an applying attempt.
 */
type UpdatePhase =
    | { state: "queued"; resetAt?: Timestamp }
    | { state: "announcing" }
    | { state: "announced"; since: Timestamp }
    | { state: "progress"; attempt: OtaUpdateAttempt; bdxTransferredBytes?: number };

/**
 * How long a failed update keeps its consent and queue entry.  Meanwhile, the node may query and apply the update on
 * its own, as devices that need several attempts do, but it is not announced to the node again.
 */
const FAILED_UPDATE_RETENTION = Hours(24);

/**
 * The node was announced for the update or follows an attempt for it.  An `announcing` entry is not underway yet, so
 * its target may still be replaced.
 */
function isUnderway({ state }: UpdatePhase) {
    return state === "announced" || state === "progress";
}

interface UpdateQueueEntry {
    peerAddress: PeerAddress;
    endpoint: Endpoint;
    vendorId: VendorId;
    productId: number;
    targetSoftwareVersion: number;
    phase: UpdatePhase;

    /** Aborts the announcement still running for this entry, also after an attempt moved it past `announcing`. */
    announcement?: Abort;
}

/** The reactors the per-peer observers of {@link SoftwareUpdateManager.Internal.versionUpdateObservers} feed. */
interface PeerEventReactors {
    softwareVersionChanged(peerAddress: PeerAddress, softwareVersion: number): void;
    startUp(peerAddress: PeerAddress, softwareVersion: number, session?: Session): void;
    subscribed(peerAddress: PeerAddress): void;
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

    /** Source of the update returned, whether it is a local file, downloaded from test or production DCL */
    source: OtaUpdateSource;
}

export interface PendingUpdateInfo {
    peerAddress: PeerAddress;
    vendorId: VendorId;
    productId: number;
    targetSoftwareVersion: number;

    /**
     * - `"queued"` — waiting for an announcement: not announced yet, or reset for a retry, as after a failed
     *   announcement, a stall, a cancelled transfer or a version change below the target.
     * - `"in-progress"` — the OTA provider is being announced or has been announced to the node, and we are waiting
     *   for the update to complete.
     * - `"stalled"` — no status update and no BDX transfer activity within {@link OTA_PROGRESS_TIMEOUT}. The entry
     *   is reset and announced again, unless the update failed before; then it is no longer listed.
     */
    status: "queued" | "in-progress" | "stalled";
    lastProgressStatus?: OtaUpdateStatus;
    lastProgressUpdateTime?: Timestamp;

    /** Bytes transferred by the BDX session of an in-progress update, undefined for any other status. */
    bdxTransferredBytes?: number;

    /** Size of the transfer of an in-progress update, undefined for any other status or while it is unknown. */
    bdxDataLength?: number;
}

/**
 * The Software Update Manager is the instance to bridge between the central OTA store and DCL service and manage the
 * updates for all peers of a node. It gets installed on the endpoint where the OtaSoftwareUpdateProvider behavior is
 * installed. It uses the generic DclOtaUpdateService, which exists globally, to request and get new updates.
 *
 * The following state allows configuring the behavior:
 * * {@link allowTestOtaImages}: When set to true, we also query the Test DCL additionally to the production DCL for
 *     update and use this when a newer version is found. Default is false. Stored test-net and local images are only
 *     offered while it is true; production images are offered either way
 *
 * * {@link updateCheckInterval}: By default, we check the DCL for updates every 24h. This state value allows adjusting
 *     this.
 *
 * * {@link announceAsDefaultProvider}: Set to true to announce ourselves as the default update provider to all nodes in
 *     the fabric: first 10 to 15 minutes after the controller went online, then every {@link announcementInterval}.
 *     A newly commissioned node is not announced at once.  Default is false, so nodes are announced only for a queued
 *     update.
 *
 * * {@link delegateConsentToRequestor}: Set to true to let a node that can obtain user consent itself update to the
 *     newest stored image without a consent given to this manager. Default is false.
 */
export class SoftwareUpdateManager extends Behavior {
    static override readonly id = "softwareupdates";

    declare readonly state: SoftwareUpdateManager.State;
    declare internal: SoftwareUpdateManager.Internal;
    declare readonly events: SoftwareUpdateManager.Events;

    override async initialize() {
        const rootNode = Node.forEndpoint(this.endpoint) as ServerNode;
        rootNode.behaviors.require(DclBehavior);
        this.internal.otaService = rootNode.agentFor(this.context).get(DclBehavior).otaUpdateService;
        await this.internal.otaService.construction;
        this.internal.otaStorageScope = this.internal.otaService.storage.scope;

        this.reactTo(rootNode.lifecycle.online, this.#nodeOnline);
        this.reactTo(rootNode.lifecycle.goingOffline, this.#nodeGoingOffline);
        this.reactTo(this.env.get(PeerSet).deleted, this.#forgetPeer);
        if (rootNode.lifecycle.isOnline) {
            await this.#nodeOnline();
        }

        this.reactTo(this.events.announceAsDefaultProvider$Changed, this.#updateAnnouncementSettings);
        this.reactTo(this.events.announcementInterval$Changed, this.#updateAnnouncementSettings);
    }

    async #nodeOnline() {
        this.internal.suppressUpdates = false;
        if (this.internal.announcements !== undefined) {
            await this.internal.announcements.close();
            this.internal.announcements = undefined;
        }

        // For now let's just provide update functionality when we are the fabric owner
        // In theory we could also claim that for any other fabric but could conflict with the main controller of
        // the fabric that then also claims being "the one provider".
        const fabricAuthority = await this.env.load(FabricAuthority);
        const ownFabric = fabricAuthority.fabrics[0];
        if (!ownFabric) {
            // Can only happen if the SoftwareUpdateManager is used without any commissioned nodes
            logger.info(`No commissioned peers yet, cannot check for OTA updates. Wait for Fabric being added.`);
            this.reactTo(fabricAuthority.fabricAdded, this.#nodeOnline, { once: true });
            return;
        }
        this.internal.announcements = new OtaAnnouncements(this.endpoint, ownFabric);
        this.#updateAnnouncementSettings();

        // Randomly force the first update check 5-10 minutes after startup
        const delay = Millis(Seconds(Math.floor(Math.random() * 300)) + Minutes(5));
        logger.info(`Scheduling first OTA update check in ${Duration.format(delay)}`);
        this.internal.checkForUpdateTimer?.stop();
        this.internal.checkForUpdateTimer = this.reactorTimer(
            "initializeUpdateCheck",
            delay,
            this.#initializeUpdateCheck,
        ).start();
    }

    async #nodeGoingOffline() {
        this.internal.suppressUpdates = true;
        this.internal.checkForUpdateTimer?.stop();

        // Announcements run on their own timers and write to peers, so the suppression flag alone does not stop them.
        // #nodeOnline installs a fresh instance.
        await this.#stopAnnouncements();
        await this.internal.announcements?.close();
        this.internal.announcements = undefined;

        // Bound to the ClientSubscriptions the stopping runtime closes; the getter creates a new one for the next run
        this.internal.rebootResubscribeArmer?.[Symbol.dispose]();
        this.internal.rebootResubscribeArmer = undefined;
        this.#endAllAttempts();
    }

    /**
     * Drops all the manager holds about a peer whose protocol peer closed for good, as when its node was decommissioned
     * or deleted: the consent, the attempts, the queue entry, the update found for the peer, the observers of the node,
     * a fast resubscription and the BDX registration.  The queue entry leaves the queue without an event, and the queue
     * runs on for the other peers.  Does nothing while updates are suppressed, as when the node goes offline or closes.
     * Not promised: a peer deleted meanwhile keeps its consent; its queue entry leaves when the queue next runs.
     */
    async #forgetPeer({ address }: Peer) {
        if (this.internal.suppressUpdates) {
            return;
        }
        const peerAddress = PeerAddress(address);
        this.#mutate(() => {
            const { consents, attempts, knownUpdates, versionUpdateObservers } = this.internal;
            logger.debug(`Node ${peerAddress.toString()} is gone, dropping its OTA update state`);
            consents.delete(peerAddress);
            this.internal.pendingStartUpSuppress.delete(peerAddress);
            knownUpdates.delete(peerAddress);
            versionUpdateObservers.get(peerAddress)?.close();
            versionUpdateObservers.delete(peerAddress);
            this.internal.rebootResubscribeArmer?.disarm(peerAddress);
            for (const attempt of attempts.of(peerAddress)) {
                attempt.end();
            }
            this.#scheduleExpiry();
            this.#triggerQueuedUpdate();
        });
        if (this.env.has(BdxProtocol)) {
            await this.#cancelBdxTransfer(peerAddress);
        }
    }

    #updateAnnouncementSettings() {
        if (this.internal.announcements === undefined) {
            return;
        }
        if (this.state.announceAsDefaultProvider) {
            this.internal.announcements.interval = this.state.announcementInterval;
        } else {
            this.internal.announcements.interval = undefined;
        }
    }

    /**
     * Trigger the first check for updates some time after the node went online, and register a periodic interval
     * afterward.
     */
    async #initializeUpdateCheck() {
        try {
            await this.checkForUpdates();
        } catch (error) {
            logger.notice(`Error during initial OTA update check:`, error);
        }

        this.internal.checkForUpdateTimer.stop();
        this.internal.checkForUpdateTimer = this.periodicReactorTimer(
            "checkAvailableUpdates",
            this.state.updateCheckInterval,
            this.checkForUpdates,
        ).start();
    }

    get storage() {
        return this.internal.otaService.storage;
    }

    get #rebootResubscribeArmer() {
        if (this.internal.rebootResubscribeArmer === undefined) {
            this.internal.rebootResubscribeArmer = new RebootResubscribeArmer(
                this.env.get(SessionManager),
                this.env.get(ClientSubscriptions),
            );
        }
        return this.internal.rebootResubscribeArmer;
    }

    /**
     * Returns a snapshot of the current update queue for introspection.  A failed update is not listed; the
     * `updateFailed` event reported it.  It is listed again while the node retries it on its own.
     */
    get queuedUpdates(): PendingUpdateInfo[] {
        const now = Time.nowMs;
        return this.internal.updateQueue.flatMap(entry => {
            const { phase } = entry;
            if (this.#isFailed(entry)) {
                return [];
            }
            const bdxSession = this.#bdxSessionFor(entry.peerAddress);
            let status: PendingUpdateInfo["status"];
            if (phase.state === "queued") {
                status = "queued";
            } else if (this.#isStalled(entry, now) && !this.#isTransferring(entry, bdxSession?.transferredBytes)) {
                status = "stalled";
            } else {
                status = "in-progress";
            }
            let lastProgressStatus: OtaUpdateStatus | undefined;
            let lastProgressUpdateTime: Timestamp | undefined;
            if (phase.state === "progress") {
                lastProgressStatus = phase.attempt.status;
                lastProgressUpdateTime = phase.attempt.lastActivity;
            } else if (phase.state === "announced") {
                lastProgressUpdateTime = phase.since;
            } else if (phase.state === "queued" && phase.resetAt !== undefined) {
                lastProgressStatus = OtaUpdateStatus.Unknown;
            }
            return {
                peerAddress: entry.peerAddress,
                vendorId: entry.vendorId,
                productId: entry.productId,
                targetSoftwareVersion: entry.targetSoftwareVersion,
                status,
                lastProgressStatus,
                lastProgressUpdateTime,
                bdxTransferredBytes: status === "in-progress" ? bdxSession?.transferredBytes : undefined,
                bdxDataLength: status === "in-progress" ? bdxSession?.dataLength : undefined,
            };
        });
    }

    #bdxSessionFor(peerAddress: PeerAddress) {
        const { otaStorageScope } = this.internal;
        if (otaStorageScope === undefined || !this.env.has(BdxProtocol)) {
            return undefined;
        }
        return this.env.get(BdxProtocol).sessionFor(peerAddress, otaStorageScope);
    }

    /**
     * A retry of a failed download opens a fresh BDX session whose counter restarts below the one we recorded, so any
     * change of the counter counts as liveness, not only growth.
     */
    #isTransferring({ phase }: UpdateQueueEntry, transferredBytes?: number) {
        const recordedBytes = phase.state === "progress" ? phase.bdxTransferredBytes : undefined;
        return transferredBytes !== undefined && transferredBytes !== (recordedBytes ?? 0);
    }

    /**
     * A download produces no OTA status transitions for as long as it runs, so a large image on a slow link looks
     * stalled to a timestamp that only status changes refresh.
     */
    #refreshBdxProgress(entry: UpdateQueueEntry) {
        const { phase } = entry;
        const transferredBytes = this.#bdxSessionFor(entry.peerAddress)?.transferredBytes;
        if (phase.state !== "progress" || !this.#isTransferring(entry, transferredBytes)) {
            return false;
        }
        phase.bdxTransferredBytes = transferredBytes;
        phase.attempt.touch();
        return true;
    }

    /** An announced or progressing update counts as stalled when the node shows no activity for its timeout. */
    #isStalled({ phase }: UpdateQueueEntry, now: Timestamp) {
        if (phase.state === "announced") {
            return phase.since + OTA_PROGRESS_TIMEOUT < now;
        }
        if (phase.state === "progress") {
            return phase.attempt.isStale(now);
        }
        return false;
    }

    /** Unlinks the entry from its attempt and lets it wait for the next one, see {@link #retarget}. */
    #resetEntryProgress(entry: UpdateQueueEntry) {
        this.#abortAnnouncement(entry);
        entry.phase = { state: "queued", resetAt: Time.nowMs };
        this.#retarget(entry);
    }

    /**
     * Lets an entry that follows no attempt take the version of the peer's consent.  An entry whose version changes
     * waits as `queued` again, as the node was announced for another version.  Without a consent, the entry leaves the
     * queue with `updateFailed`.
     */
    #retarget(entry: UpdateQueueEntry) {
        if (entry.phase.state === "progress") {
            return;
        }
        const { peerAddress } = entry;
        const consent = this.internal.consents.get(peerAddress);
        if (consent === undefined) {
            this.#dequeue(entry, "updateFailed");
            return;
        }
        const { vendorId, productId, targetSoftwareVersion } = consent;
        Object.assign(entry, { vendorId, productId });
        if (targetSoftwareVersion !== entry.targetSoftwareVersion) {
            logger.info(
                `Update of node ${peerAddress.toString()} moves from version ${entry.targetSoftwareVersion} to the consented version ${targetSoftwareVersion}`,
            );
            entry.targetSoftwareVersion = targetSoftwareVersion;
            this.#abortAnnouncement(entry);
            entry.phase = { state: "queued" };
        }
    }

    /**
     * The entry waits as failed: the update to the version of the peer's consent failed since the consent was given.
     * It is not announced and not listed in {@link queuedUpdates}; an entry that follows an attempt is never failed.
     */
    #isFailed({ peerAddress, phase }: UpdateQueueEntry) {
        return phase.state !== "progress" && this.internal.consents.get(peerAddress)?.failedAt !== undefined;
    }

    /** The version of the peer's consent for the product, also while the update to it counts as failed. */
    #targetOf(peerAddress: PeerAddress, { vendorId, productId }: { vendorId: VendorId; productId: number }) {
        const consent = this.internal.consents.get(peerAddress);
        if (consent?.vendorId === vendorId && consent.productId === productId) {
            return consent.targetSoftwareVersion;
        }
    }

    /**
     * Removes the entry from the queue, with its announcement and its startUp suppression, and queues `event` for the
     * peer, if given.  It is the only way an entry leaves the queue.
     */
    #dequeue(entry: UpdateQueueEntry, event?: "updateDone" | "updateFailed") {
        const { peerAddress } = entry;
        this.#abortAnnouncement(entry);
        this.internal.pendingStartUpSuppress.delete(peerAddress);
        this.internal.updateQueue = this.internal.updateQueue.filter(other => other !== entry);
        if (event !== undefined) {
            this.#queueEvent(() => this.events[event].emit(peerAddress));
        }
    }

    /**
     * Runs a change of the manager state that may queue events.  Every change that can reach {@link #queueEvent} runs
     * through this.  Events are queued and emitted when the outermost change returns, so a listener sees the final
     * state.  A listener that changes the state again gets the events of its own change when that change returns.
     * The change must be synchronous; its type refuses a callback that returns a promise.
     *
     * An error of the change propagates unchanged; the events it queued before are still emitted.  The emits run one
     * after the other, and an error that escapes one emit is logged, so it fails neither the change nor the other
     * events.  This does not isolate the listeners of one event from each other: `Observable` stops an emit at the
     * first listener that throws.
     */
    #mutate<T>(change: () => T & (T extends PromiseLike<unknown> ? never : unknown)): T {
        const { internal } = this;
        internal.mutationDepth++;
        try {
            return change();
        } finally {
            internal.mutationDepth--;
            if (internal.mutationDepth === 0) {
                this.#emitQueuedEvents();
            }
        }
    }

    /** Queues an event of the running change, see {@link #mutate}. */
    #queueEvent(emit: () => void) {
        if (this.internal.mutationDepth === 0) {
            throw new InternalError("An OTA update event was queued outside of a state change");
        }
        this.internal.outbox.push(emit);
    }

    #emitQueuedEvents() {
        for (const emit of this.internal.outbox.splice(0)) {
            try {
                emit();
            } catch (error) {
                logger.warn(`An OTA update event listener failed:`, error);
            }
        }
    }

    #retryUpdate(entry: UpdateQueueEntry) {
        this.#resetEntryProgress(entry);
        this.#triggerQueuedUpdate();
    }

    /** Ends a running announcement early; its result is ignored anyway, see {@link #runAnnouncement}. */
    #abortAnnouncement(entry: UpdateQueueEntry) {
        entry.announcement?.abort();
    }

    #entryFor(peerAddress: PeerAddress) {
        return this.internal.updateQueue.find(entry => PeerAddress.is(entry.peerAddress, peerAddress));
    }

    /** The node of the peer address, while the node has the address. */
    #peerOf(peerAddress: PeerAddress) {
        return (Node.forEndpoint(this.endpoint) as ServerNode).peers.get(peerAddress);
    }

    /** The node's cached Basic Information. */
    #basicInformationOf(peerAddress: PeerAddress) {
        return this.#peerOf(peerAddress)?.maybeStateOf(BasicInformationClient);
    }

    /** The software version the node reports in its cached Basic Information. */
    #softwareVersionOf(peerAddress: PeerAddress) {
        return this.#basicInformationOf(peerAddress)?.softwareVersion;
    }

    /** The peer's cached Basic Information when it matches the details the peer sent, else `undefined`. */
    #matchingBasicInformation(
        peerAddress: PeerAddress,
        details: { softwareVersion: number; vendorId: VendorId; productId: number },
    ) {
        const { softwareVersion, vendorId, productId } = details;

        const basicInfo = this.#basicInformationOf(peerAddress);
        if (
            basicInfo?.softwareVersion === softwareVersion &&
            basicInfo?.vendorId === vendorId &&
            basicInfo?.productId === productId
        ) {
            return basicInfo;
        }
    }

    /**
     * Whether the peer may obtain the user consent for an update itself: only when its QueryImage says it can
     * (`RequestorCanConsent`), with {@link State.delegateConsentToRequestor} on, and never for a node with
     * `LocalConfigDisabled` set.  Without cached Basic Information of the node, it returns false.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.20.3.4.1
     */
    mayDelegateConsentTo(
        peerAddress: PeerAddress,
        { requestorCanConsent }: Pick<OtaSoftwareUpdateProvider.QueryImageRequest, "requestorCanConsent">,
    ) {
        if (requestorCanConsent !== true || !this.state.delegateConsentToRequestor) {
            return false;
        }
        const basicInfo = this.#basicInformationOf(peerAddress);
        return basicInfo !== undefined && basicInfo.localConfigDisabled !== true;
    }

    /**
     * Stored test-net and local images are offered, and the test DCL is asked, only with
     * {@link State.allowTestOtaImages}.
     */
    get #includeNonProductionImages() {
        return this.state.allowTestOtaImages;
    }

    /**
     * Used to determine if an update is existing in our storage for a peer with a certain software version.
     *
     * It uses the already checked details and does not check again on-demand, but validates the peer data.  The
     * candidates are the stored images above the node's version; local and test-net images only with
     * {@link State.allowTestOtaImages}.
     *
     * | Peer                                                     | Offer                                           |
     * |----------------------------------------------------------|-------------------------------------------------|
     * | has a consent whose version is a candidate, also for 24  | that version, without `consentRequired`         |
     * | hours after its update failed                            |                                                 |
     * | else, {@link mayDelegateConsentTo} allows it             | the newest candidate, with `consentRequired`    |
     * | any other                                                | nothing                                         |
     *
     * @see {@link MatterSpecification.v161.Core} § 11.20.3.4.1
     */
    async updateExistsFor(
        peerAddress: PeerAddress,
        { softwareVersion, vendorId, productId, requestorCanConsent }: OtaSoftwareUpdateProvider.QueryImageRequest,
    ): Promise<OtaUpdateAvailableDetails | undefined> {
        if (this.#matchingBasicInformation(peerAddress, { softwareVersion, vendorId, productId }) === undefined) {
            logger.info(
                `Peer details for node ${peerAddress.toString()} do not match values the update was requested for, ignoring`,
            );
            return undefined;
        }

        // We just use what we know from our last check here, so no on-demand DCL checks for now
        const candidates = await this.internal.otaService.findApplicable({
            vendorId,
            productId,
            currentSoftwareVersion: softwareVersion,
            includeNonProductionImages: this.#includeNonProductionImages,
        });

        const node = `node ${peerAddress.nodeId} in fabric ${peerAddress.fabricIndex} at software version ${softwareVersion}`;
        if (candidates.length === 0) {
            logger.debug(`No stored update applies to ${node}`);
            return undefined;
        }

        const consentedVersion = this.#targetOf(peerAddress, { vendorId, productId });
        const consented = candidates.find(({ softwareVersion }) => softwareVersion === consentedVersion);
        const delegated = this.mayDelegateConsentTo(peerAddress, { requestorCanConsent }) ? candidates[0] : undefined;
        const candidate = consented ?? delegated;
        if (candidate === undefined) {
            logger.debug(`No stored update with a consent applies to ${node}`);
            return undefined;
        }

        const { softwareVersion: newSoftwareVersion, softwareVersionString, filename } = candidate;
        return {
            newSoftwareVersion,
            newSoftwareVersionString: softwareVersionString,
            fileDesignator: new FileDesignator(`ota/${filename}`),
            // We do not provide any httpsUri here, as we expect the node to download from our DCL proxy via BDX
            consentRequired: consented === undefined,
        };
    }

    /**
     * Check all commissioned peers for available updates and purge stored updates that are no longer needed.
     *
     * Runs automatically on a periodic timer but may also be invoked directly to force an immediate check.
     */
    async checkForUpdates() {
        await this.queryUpdates({ includeStoredUpdates: true });
        await this.#cleanupObsoleteUpdates();
    }

    /**
     * Clean up stored OTA files that no node in the system needs anymore.
     * A stored version is obsolete when ALL nodes with that vendor/product ID are already at or above that version,
     * or when its mode is no longer permitted by the current settings (e.g. test-mode files after
     * {@link allowTestOtaImages} is turned off). Only cleans "prod" and "test" mode files;
     * "local" files are user-managed.
     */
    async #cleanupObsoleteUpdates() {
        const rootNode = Node.forEndpoint(this.endpoint) as ServerNode;

        // Collect minimum software version per vendor/product across all nodes
        const nodeVersions = new Map<string, number>();
        for (const peer of rootNode.peers) {
            const basicInfo = peer.maybeStateOf(BasicInformationClient);
            if (basicInfo === undefined) {
                continue;
            }
            const { vendorId, productId, softwareVersion } = basicInfo;
            const key = `${vendorId}-${productId}`;
            const existing = nodeVersions.get(key);
            if (existing === undefined || softwareVersion < existing) {
                nodeVersions.set(key, softwareVersion);
            }
        }

        // Nothing can be cleaned up when there are no peers and test-mode files are still permitted —
        // skip the storage scan entirely.
        const purgeDisallowedTestFiles = !this.state.allowTestOtaImages;
        if (nodeVersions.size === 0 && !purgeDisallowedTestFiles) {
            return;
        }

        // Narrow the scan when only the test-purge path is active (no peers to evaluate obsolescence against).
        const storedUpdates = await this.internal.otaService.find(nodeVersions.size === 0 ? { mode: "test" } : {});
        for (const update of storedUpdates) {
            if (update.mode === "local") {
                continue; // Never auto-delete user-added files
            }

            // Purge test-mode files when test OTA usage is off — they cannot be offered and would
            // otherwise pile up (e.g. after a user disables "Enable test-net DCL usage").
            if (update.mode === "test" && purgeDisallowedTestFiles) {
                try {
                    await this.internal.otaService.delete({ filename: update.filename });
                    logger.info(`Cleaned up test-mode OTA file ${update.filename} (allowTestOtaImages is disabled)`);
                } catch (error) {
                    logger.warn(`Failed to clean up OTA file ${update.filename}:`, error);
                }
                continue;
            }

            if (nodeVersions.size === 0) {
                continue;
            }
            const key = `${update.vendorId}-${update.productId}`;
            const minNodeVersion = nodeVersions.get(key);
            if (minNodeVersion === undefined) {
                continue; // No known nodes for this vid/pid, keep the file
            }

            // If all nodes are at or above this stored version, it's obsolete
            if (update.softwareVersion <= minNodeVersion) {
                try {
                    await this.internal.otaService.delete({ filename: update.filename });
                    logger.info(
                        `Cleaned up obsolete OTA file ${update.filename} (all nodes at version >= ${minNodeVersion})`,
                    );
                } catch (error) {
                    logger.warn(`Failed to clean up OTA file ${update.filename}:`, error);
                }
            }
        }
    }

    /**
     * Checks all nodes, or optionally a defined one, for available updates from the DCL OTA Update Service.
     *
     * Returns a list of peers for which updates are available along with the collected update info.
     *
     * If `includeStoredUpdates` is set to true, stored OTA images are considered as update candidates alongside the
     * DCL; local and test-net images only with {@link State.allowTestOtaImages}.  The DCL is always queried regardless,
     * unless the OTA service is offline; across all candidates the highest applicable and allowed version wins.
     */
    async queryUpdates(options: { peerToCheck?: ClientNode; includeStoredUpdates?: boolean } = {}) {
        const { peerToCheck, includeStoredUpdates = false } = options;
        const rootNode = Node.forEndpoint(this.endpoint) as ServerNode;

        // Collect all client nodes and their versions, so we only need to check each version once
        const updateDetails = new Map<string, CollectedNodesUpdateInfo>();
        for (const peer of rootNode.peers) {
            if (this.internal.suppressUpdates) {
                return [];
            }
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

        const peersWithUpdates = new Array<{ peerAddress: PeerAddress; info: SoftwareUpdateInfo }>();
        for (const infos of updateDetails.values()) {
            if (this.internal.suppressUpdates) {
                return [];
            }
            try {
                const peers = await this.#checkProductForUpdates(infos, includeStoredUpdates);
                for (const peer of peers) {
                    const info = this.internal.knownUpdates.get(peer);
                    if (info === undefined) {
                        continue;
                    }
                    peersWithUpdates.push({ peerAddress: peer, info });
                }
            } catch (error) {
                // We ignore any errors that occur, but log them
                logger.warn(
                    `Error while checking for updates for product ${infos.vendorId}-${infos.productId}:`,
                    error,
                );
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
            isProduction: this.#includeNonProductionImages ? undefined : true,
        });
        if (!updateDetails || this.internal.suppressUpdates) {
            return [];
        }
        const fd = await this.internal.otaService.downloadUpdate(updateDetails);

        logger.info(
            "OTA update available for",
            Diagnostic.dict({
                vendorId,
                productId,
                softwareVersion,
                file: fd.text,
                peers: [...otaEndpoints.values()].map(({ peerAddress }) => peerAddress.toString()),
            }),
        );

        // Request consent or notify peers about the update if we have consent
        const updatable = new Array<PeerAddress>();
        for (const { endpoint, peerAddress } of otaEndpoints) {
            if (this.#peerOf(peerAddress) === undefined) {
                logger.debug(`Node ${peerAddress.toString()} was removed during the update check, skipping it`);
                continue;
            }
            const { vid, pid, softwareVersion, softwareVersionString, releaseNotesUrl, specificationVersion, source } =
                updateDetails;
            const details: SoftwareUpdateInfo = {
                vendorId: vid,
                productId: pid,
                softwareVersion,
                softwareVersionString,
                releaseNotesUrl,
                specificationVersion,
                source,
            };
            this.internal.knownUpdates.set(peerAddress, details);
            updatable.push(peerAddress);

            if (this.internal.suppressUpdates) {
                break;
            }
            this.#mutate(() => {
                const target = this.#targetOf(peerAddress, { vendorId, productId });
                if (target !== undefined) {
                    this.#queueUpdate({ endpoint, vendorId, productId, peerAddress });
                }
                if (target === undefined || target < updateDetails.softwareVersion) {
                    this.requestConsentForUpdate(peerAddress, details);
                }
            });
        }

        return updatable;
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

        let observers = this.internal.versionUpdateObservers.get(peerAddress);
        if (observers === undefined) {
            observers = new ObserverGroup();
            this.internal.versionUpdateObservers.set(peerAddress, observers);
        }

        // Node is applicable for update checks, register listener on softwareVersion to allow resetting update state
        const reactors = this.#peerEventReactors;
        const versionEvent = peer.eventsOf(BasicInformationClient).softwareVersion$Changed;
        if (!observers.observes(versionEvent)) {
            observers.on(versionEvent, newVersion => reactors.softwareVersionChanged(peerAddress, newVersion));
        }

        // Listen to startUp event to detect reboots after applying — if the device reboots with the old version
        // softwareVersion$Changed won't fire (same value), so we feed the version through the same handler
        const startUpEvent = peer.eventsOf(BasicInformationClient).startUp;
        if (!observers.observes(startUpEvent)) {
            observers.on(startUpEvent, ({ softwareVersion }, context?: ActionContext) =>
                reactors.startUp(peerAddress, softwareVersion, hasRemoteActor(context) ? context.session : undefined),
            );
        }

        // A device that applies without restarting sends neither a version change nor startUp; the controller's
        // resubscription then reports the version it still runs
        const subscriptionEvent = peer.eventsOf(NetworkClient).subscriptionStatusChanged;
        if (!observers.observes(subscriptionEvent)) {
            observers.on(subscriptionEvent, isActive => {
                if (isActive) {
                    reactors.subscribed(peerAddress);
                }
            });
        }

        return { otaEndpoint, peerAddress, vendorId, productId, softwareVersion, softwareVersionString };
    }

    /**
     * The reactors for the events of all peers, created once, so observing a peer adds no reactor that outlives it.
     */
    get #peerEventReactors(): PeerEventReactors {
        let reactors = this.internal.peerEventReactors;
        if (reactors === undefined) {
            reactors = this.internal.peerEventReactors = {
                softwareVersionChanged: this.callback(function (
                    this: SoftwareUpdateManager,
                    peerAddress: PeerAddress,
                    softwareVersion: number,
                ) {
                    this.#mutate(() => this.#onSoftwareVersionChanged(peerAddress, softwareVersion));
                }),
                startUp: this.callback(function (
                    this: SoftwareUpdateManager,
                    peerAddress: PeerAddress,
                    softwareVersion: number,
                    session?: Session,
                ) {
                    this.#mutate(() => this.#onSoftwareVersionChanged(peerAddress, softwareVersion, true, session));
                }),
                subscribed: this.callback(function (this: SoftwareUpdateManager, peerAddress: PeerAddress) {
                    this.#mutate(() => this.#onSubscribedAfterApply(peerAddress));
                }),
            };
        }
        return reactors;
    }

    /**
     * Handler for softwareVersion changes on a peer.
     *
     * Also called from the startUp event with `isStartUp = true`. When a device reboots after applying an update,
     * softwareVersion$Changed fires if the version actually changed (success). But if the device reboots with the
     * same version (failed apply), softwareVersion$Changed does NOT fire — so startUp feeds the version through
     * this same handler to detect the failure.  Of the restarts, only one while the linked attempt is `Applying` fails
     * the update; one before, as in `WaitForApply`, resets it.  The update also fails when the node resubscribes
     * below the target after its apply, see {@link #onSubscribedAfterApply}, when it queries again below the version
     * it applied, see {@link admitQuery}, or when its query finds no image, see {@link dropUndeliverableUpdate}.
     */
    #onSoftwareVersionChanged(
        peerAddress: PeerAddress,
        newVersion: number,
        isStartUp = false,
        currentSession?: Session,
    ) {
        if (isStartUp) {
            const suppressedSessionId = this.internal.pendingStartUpSuppress.get(peerAddress);
            if (suppressedSessionId !== undefined) {
                this.internal.pendingStartUpSuppress.delete(peerAddress);
                // Use session from event context when available (avoids extra lookup); fall back to
                // SessionManager for local/test contexts where there is no remote actor.
                const sessionId = currentSession?.id ?? this.env.get(SessionManager).maybeSessionFor(peerAddress)?.id;
                if (sessionId === suppressedSessionId) {
                    // startUp is from the reboot we already handled via queryImage — suppress it
                    return;
                }
                // Different session — process normally
            }
        }

        const entry = this.#entryFor(peerAddress);
        if (entry === undefined) {
            return;
        }
        const { phase } = entry;
        const previousProgressStatus = phase.state === "progress" ? phase.attempt.status : undefined;
        const expectedVersion = entry.targetSoftwareVersion;
        if (newVersion < expectedVersion && isStartUp && previousProgressStatus === OtaUpdateStatus.Applying) {
            // Device rebooted during apply with old version — the update failed
            logger.warn(
                `Device ${peerAddress.toString()} rebooted after applying update but reports softwareVersion ${newVersion} (expected >= ${expectedVersion}), update failed to apply`,
            );
            this.#failUpdate(entry);
            return;
        }
        if (newVersion >= expectedVersion) {
            logger.info(
                `Software version changed to ${newVersion} (expected ${expectedVersion}) for node ${peerAddress.toString()}, removing from update queue`,
            );
            this.#completeUpdate(entry, newVersion);
            return;
        }
        logger.info(
            `Software version for node ${peerAddress.toString()} changed to ${newVersion}, but still below target version ${expectedVersion}`,
        );
        // An `announcing` entry was already restarted, as by the other event of the same reboot
        if (isUnderway(phase)) {
            logger.info(
                `Clearing in-progress update for node ${peerAddress.toString()} due to software version change. Last State was ${previousProgressStatus === undefined ? phase.state : OtaUpdateStatus[previousProgressStatus]}`,
            );
            this.#resetEntryProgress(entry);
        }
        this.#triggerQueuedUpdate();
    }

    /**
     * Handler for a peer's subscription becoming active.
     *
     * An update in `Applying` whose peer reports a version below the target over a subscription established after the
     * device's restart deadline did not apply, so it is handled like a reboot into the old version.  The deadline is
     * {@link RebootResubscribeArmer.returnTimeout}, after which the fast resubscription forces that resubscription.
     */
    #onSubscribedAfterApply(peerAddress: PeerAddress) {
        const entry = this.#entryFor(peerAddress);
        const softwareVersion = this.#softwareVersionOf(peerAddress);
        if (entry === undefined || softwareVersion === undefined) {
            return;
        }
        const { phase, targetSoftwareVersion } = entry;
        if (
            phase.state !== "progress" ||
            phase.attempt.status !== OtaUpdateStatus.Applying ||
            Time.nowMs < phase.attempt.lastActivity + RebootResubscribeArmer.returnTimeout(phase.attempt.applyDelay) ||
            softwareVersion >= targetSoftwareVersion
        ) {
            return;
        }

        logger.warn(
            `Device ${peerAddress.toString()} resubscribed after applying update but reports softwareVersion ${softwareVersion} (expected >= ${targetSoftwareVersion}), update failed to apply`,
        );
        this.#failUpdate(entry);
    }

    /**
     * Removes the entry as done, with the consent when its version is at or below the version the node now runs, ends
     * the node's attempts up to that version, and queues the consent's version when it is higher.
     */
    #completeUpdate(entry: UpdateQueueEntry, completedVersion: number) {
        const { peerAddress } = entry;
        const { consents, attempts, knownUpdates } = this.internal;
        knownUpdates.delete(peerAddress);
        this.#dequeue(entry, "updateDone");
        const consent = consents.get(peerAddress);
        if (consent !== undefined && consent.targetSoftwareVersion <= completedVersion) {
            consents.delete(peerAddress);
            this.#scheduleExpiry();
        }
        for (const attempt of attempts.of(peerAddress)) {
            if (attempt.version !== undefined && attempt.version <= completedVersion) {
                this.#endAttempt(attempt);
            }
        }
        this.#queueUpdate(entry);
    }

    /**
     * Marks the update as failed and runs the queue on.  The first failure since the consent was given sets its
     * `failedAt` and emits `updateFailed`; later failures of that update are not reported again.  Without a consent for
     * the failed version, as after it was replaced or removed, `updateFailed` is emitted and the entry takes the
     * consent's version, or leaves the queue without one.
     */
    #failUpdate(entry: UpdateQueueEntry) {
        const { peerAddress, targetSoftwareVersion, phase } = entry;
        this.#abortAnnouncement(entry);
        this.internal.pendingStartUpSuppress.delete(peerAddress);
        if (phase.state === "progress") {
            if (phase.attempt.status === OtaUpdateStatus.Applying) {
                phase.attempt.setStatus(OtaUpdateStatus.Cancelled);
            }
            phase.attempt.end();
        }
        entry.phase = { state: "queued" };

        const consent = this.internal.consents.get(peerAddress);
        if (consent === undefined) {
            this.#dequeue(entry, "updateFailed");
        } else {
            if (consent.targetSoftwareVersion !== targetSoftwareVersion || consent.failedAt === undefined) {
                this.#queueEvent(() => this.events.updateFailed.emit(peerAddress));
            }
            if (consent.targetSoftwareVersion === targetSoftwareVersion && consent.failedAt === undefined) {
                consent.failedAt = Time.nowMs;
                this.#scheduleExpiry();
            }
            this.#retarget(entry);
        }
        this.#triggerQueuedUpdate();
    }

    /** Starts the timer for the next failed consent to expire, or stops it when no consent failed. */
    #scheduleExpiry() {
        this.internal.expiryTimer?.stop();
        let next: Timestamp | undefined;
        for (const { failedAt } of this.internal.consents.values()) {
            if (failedAt !== undefined && (next === undefined || failedAt < next)) {
                next = failedAt;
            }
        }
        if (next === undefined) {
            return;
        }
        const delay = Millis(Math.max(0, next + FAILED_UPDATE_RETENTION - Time.nowMs));
        this.internal.expiryTimer = this.reactorTimer("expireFailedUpdates", delay, this.#expireFailedUpdates).start();
    }

    /**
     * Removes the consents whose update failed {@link FAILED_UPDATE_RETENTION} ago.  Their entries leave the queue
     * without an event, as `updateFailed` reported the failure.  An attempt keeps the apply right its offer gave.
     */
    #expireFailedUpdates() {
        this.#mutate(() => {
            const now = Time.nowMs;
            const { consents } = this.internal;
            for (const [peerAddress, { failedAt }] of [...consents.entries()]) {
                if (failedAt === undefined || failedAt + FAILED_UPDATE_RETENTION > now) {
                    continue;
                }
                logger.info(`Dropped the expired failed update of node ${peerAddress.toString()} with its consent`);
                consents.delete(peerAddress);
                const entry = this.#entryFor(peerAddress);
                if (entry !== undefined) {
                    this.#dequeue(entry);
                }
            }
            this.#scheduleExpiry();
            this.#triggerQueuedUpdate();
        });
    }

    /**
     * Ends the attempt.  A queued update linked to it waits for the node's next attempt, as the node left this one: it
     * is reset, see {@link #resetEntryProgress}, and the answered offer of the node's new query links it again.
     */
    #endAttempt(attempt: OtaUpdateAttempt) {
        const entry = this.internal.suppressUpdates ? undefined : this.#linkedEntry(attempt);
        attempt.end();
        if (entry !== undefined) {
            logger.info(`${attempt.toString()} ended, resetting its update for the next attempt`);
            this.#resetEntryProgress(entry);
        }
    }

    /**
     * Ends all attempts, as the node goes offline.  A queued update that followed one keeps waiting for the node: the
     * node's next answered attempt links it again, see {@link #linkAttempt}, or it is reset when it stalls.
     */
    #endAllAttempts() {
        for (const attempt of this.internal.attempts.all()) {
            attempt.end();
        }
    }

    /**
     * Disables the peer for the OTA scope of BDX and cancels its open BDX session.  A MatterError is logged, as nothing
     * is left to do about it.
     */
    async #cancelBdxTransfer(peerAddress: PeerAddress) {
        try {
            await this.env.get(BdxProtocol).disablePeerForScope(peerAddress, this.storage, true);
        } catch (error) {
            MatterError.accept(error);
            logger.info(`Could not cancel the BDX transfer of node ${peerAddress.toString()}:`, error);
        }
    }

    /**
     * Notify the application that consent is needed for the given update on the given peer: emits `updateAvailable`.
     * The update check calls this while it changes the manager state; the event is then emitted once that change is
     * complete.  Called outside a change of the manager state, the event is emitted before this returns.
     */
    protected requestConsentForUpdate(peerAddress: PeerAddress, updateDetails: SoftwareUpdateInfo) {
        this.#mutate(() => this.#queueEvent(() => this.events.updateAvailable.emit(peerAddress, updateDetails)));
    }

    /**
     * Queues an update of the peer to the version of its consent, or lets its entry take that version, see
     * {@link #retarget}, and runs the queue, which does not announce a failed update.  Returns the peer's entry, if
     * any.
     */
    #queueUpdate({
        peerAddress,
        endpoint,
        vendorId,
        productId,
    }: Pick<UpdateQueueEntry, "peerAddress" | "endpoint" | "vendorId" | "productId">) {
        const entry = this.#entryFor(peerAddress);
        if (entry !== undefined) {
            entry.endpoint = endpoint;
            this.#retarget(entry);
        } else {
            const target = this.#targetOf(peerAddress, { vendorId, productId });
            if (target !== undefined) {
                logger.info(`Queuing update consent for node ${peerAddress.toString()}`);
                this.internal.updateQueue.push({
                    peerAddress,
                    endpoint,
                    vendorId,
                    productId,
                    targetSoftwareVersion: target,
                    phase: { state: "queued" },
                });
            }
        }

        this.#triggerQueuedUpdate();
        return this.#entryFor(peerAddress);
    }

    /**
     * Runs the update queue: resets stalled entries, and announces the first queued entry when no other entry is
     * active.  Entries reset for a retry go after fresh ones, the longest-waiting first, so one node that never
     * answers does not hold back the others.  While an entry waits or is active, a periodic timer runs the queue again
     * every 5 minutes; it is how an entry whose announcement failed is announced again, and how a stall is found.  A
     * failed entry is never announced and needs no timer.
     */
    #triggerQueuedUpdate() {
        if (this.internal.suppressUpdates) {
            return;
        }
        const now = Time.nowMs;
        let activeCount = 0;
        for (const entry of this.internal.updateQueue) {
            if (this.#dequeueIfGone(entry) || entry.phase.state === "queued") {
                continue;
            }
            if (!this.#refreshBdxProgress(entry) && this.#isStalled(entry, now)) {
                logger.info(
                    `Resetting stalled OTA update state for node ${entry.peerAddress.toString()} due to inactivity`,
                );
                this.#resetEntryProgress(entry);
                continue;
            }
            activeCount++;
        }
        if (activeCount > 0) {
            if (!this.internal.updateQueueTimer?.isRunning) {
                this.#restartQueueTimer();
            }
            return;
        }

        this.internal.updateQueueTimer?.stop();
        const resetAt = ({ phase }: UpdateQueueEntry) =>
            phase.state === "queued" && phase.resetAt !== undefined ? phase.resetAt : 0;
        this.internal.updateQueue.sort((a, b) => resetAt(a) - resetAt(b));
        const nextEntry = this.internal.updateQueue.find(
            entry => entry.phase.state === "queued" && !this.#isFailed(entry),
        );
        if (nextEntry === undefined) {
            return;
        }
        this.#startAnnouncement(nextEntry);
        this.#restartQueueTimer();
    }

    /**
     * Removes the entry without an event when no node has its peer address any more, as when the node was removed
     * while updates were suppressed.
     */
    #dequeueIfGone(entry: UpdateQueueEntry) {
        if (this.#peerOf(entry.peerAddress) !== undefined) {
            return false;
        }
        logger.debug(`Node ${entry.peerAddress.toString()} is gone, dropping its queued OTA update`);
        this.#dequeue(entry);
        return true;
    }

    #restartQueueTimer() {
        this.internal.updateQueueTimer?.stop();
        this.internal.updateQueueTimer = this.periodicReactorTimer(
            "checkQueuedUpdates",
            Minutes(5),
            this.#runQueue,
        ).start();
    }

    #runQueue() {
        this.#mutate(() => this.#triggerQueuedUpdate());
    }

    /**
     * Starts announcing this provider to the node of a queued entry, which usually answers with a QueryImage.  It
     * starts nothing while updates are suppressed, before the node is online with a fabric, while a BDX transfer for
     * the node runs, or when the entry is not `queued`; the entry of a node that is gone leaves the queue, see
     * {@link #dequeueIfGone}.  The announcement runs on its own and is awaited by
     * {@link #stopAnnouncements}.
     */
    #startAnnouncement(entry: UpdateQueueEntry) {
        const { announcements, runningAnnouncements } = this.internal;
        if (this.internal.suppressUpdates || entry.phase.state !== "queued" || this.#dequeueIfGone(entry)) {
            return;
        }
        if (announcements === undefined) {
            logger.info(`Not yet initialized with peers, can not trigger update on node`, entry.peerAddress);
            return;
        }
        if (this.#bdxSessionFor(entry.peerAddress) !== undefined) {
            logger.info(`BDX transfer still active for node ${entry.peerAddress.toString()}, skipping announcement`);
            return;
        }

        const phase: UpdatePhase = { state: "announcing" };
        const abort = new Abort({ timeout: OTA_PROGRESS_TIMEOUT });
        entry.phase = phase;
        entry.announcement = abort;
        runningAnnouncements.set(
            abort,
            this.#runAnnouncement(announcements, entry, phase, abort).finally(() => runningAnnouncements.delete(abort)),
        );
    }

    /**
     * Announces and then moves the entry on: to `announced`, or back to `queued` when the announcement failed or was
     * aborted.  Once the entry left `phase`, the result is ignored, because an attempt or reset already decided how the
     * update goes on; on a removed entry it changes nothing.  Never rejects.
     */
    async #runAnnouncement(announcements: OtaAnnouncements, entry: UpdateQueueEntry, phase: UpdatePhase, abort: Abort) {
        const announced = await this.#announce(announcements, entry, abort);
        abort.close();
        if (entry.announcement === abort) {
            entry.announcement = undefined;
        }
        if (entry.phase === phase) {
            entry.phase = announced
                ? { state: "announced", since: Time.nowMs }
                : { state: "queued", resetAt: Time.nowMs };
        }
    }

    async #announce(announcements: OtaAnnouncements, { endpoint, peerAddress }: UpdateQueueEntry, abort: Abort) {
        logger.info(`Announcing OTA provider to node ${peerAddress.toString()}`);
        try {
            await abort.attempt(
                announcements.announceOtaProvider(
                    endpoint,
                    OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable,
                    abort.signal,
                ),
            );
            return true;
        } catch (error) {
            if (abort.aborted) {
                if (abort.reason instanceof TimeoutError) {
                    logger.info(
                        `OTA provider announcement to node ${peerAddress.toString()} got no answer within ${Duration.format(OTA_PROGRESS_TIMEOUT)}`,
                    );
                }
            } else if (!(error instanceof MatterError)) {
                logger.warn(`Unexpected error announcing the OTA provider to node ${peerAddress.toString()}:`, error);
            } else if (causedBy(error, ClosedError)) {
                logger.debug(`Node ${peerAddress.toString()} closed the connection during the OTA announcement`);
            } else {
                logger.info(`Failed to announce the OTA provider to node ${peerAddress.toString()}:`, error);
            }
            return false;
        }
    }

    /** Aborts the running announcements and waits for them to end, so none outlives the node going offline. */
    async #stopAnnouncements() {
        const { runningAnnouncements } = this.internal;
        for (const abort of runningAnnouncements.keys()) {
            abort();
        }
        await Promise.all(runningAnnouncements.values());
    }

    /**
     * Forces an OTA update for a specific node identified by its peer address, vendor ID, product ID, and target
     * software version.  It replaces the node's consent as {@link addUpdateConsent} does and announces the update to
     * the node right away, also while updates of other nodes are in progress.
     *
     * | Node                                                        | Result                                         |
     * |-------------------------------------------------------------|------------------------------------------------|
     * | no node has the peer address, or it is not applicable for   | {@link OtaUpdateError}; nothing changes        |
     * | updates                                                     |                                                |
     * | vendor or product ID of an applicable node do not match     | {@link ImplementationError}; nothing changes   |
     * | runs the target or a higher version                         | {@link OtaUpdateError}; nothing changes        |
     * | a BDX transfer runs for the target                          | the consent is replaced; the transfer          |
     * |                                                             | continues and no announcement starts           |
     * | a BDX transfer runs for another or an unknown version       | {@link OtaUpdateError}; nothing changes        |
     * | any other                                                   | the consent is replaced; an update the node    |
     * |                                                             | was announced for or follows is reset; the     |
     * |                                                             | announcement starts unless one runs            |
     *
     * Not promised: that an announcement started; use {@link queuedUpdates} and the events for that.  Once the node
     * takes the update, the outcome is reported via the `updateDone` and `updateFailed` events.  A BDX registration of
     * the node is not cancelled; the next transfer replaces it.
     *
     * This can be used when an exact timing of the update is needed.  When the update can be executed in a
     * delayed/queued manner, please use `addUpdateConsent()`.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.20.7.6.1
     */
    async forceUpdate(peerAddress: PeerAddress, target: SoftwareUpdateManager.UpdateTarget): Promise<void> {
        const { targetSoftwareVersion } = target;
        assertTransferOptions(target);
        peerAddress = PeerAddress(peerAddress);
        const otaEndpoint = this.#otaEndpointFor(peerAddress, target);
        if (otaEndpoint === undefined) {
            throw new OtaUpdateError(`Node at ${peerAddress.toString()} is not currently applicable for OTA updates`);
        }

        const runningVersion = this.#softwareVersionOf(peerAddress);
        if (runningVersion !== undefined && runningVersion >= targetSoftwareVersion) {
            throw new OtaUpdateError(
                `Node at ${peerAddress.toString()} runs version ${runningVersion}, not below the target ${targetSoftwareVersion}`,
            );
        }
        const transfers = this.#bdxSessionFor(peerAddress) !== undefined;
        if (transfers) {
            const transferredVersion = this.internal.attempts
                .offered(peerAddress)
                .find(({ answered }) => answered)?.version;
            if (transferredVersion !== targetSoftwareVersion) {
                throw new OtaUpdateError(
                    `Node at ${peerAddress.toString()} transfers ${transferredVersion === undefined ? "an update of unknown version" : `version ${transferredVersion}`} right now, cannot force version ${targetSoftwareVersion}`,
                );
            }
            logger.info(`Node ${peerAddress.toString()} already transfers version ${targetSoftwareVersion}`);
        }

        this.#mutate(() => {
            const existingEntry = this.#entryFor(peerAddress);
            if (!transfers && existingEntry !== undefined && isUnderway(existingEntry.phase)) {
                logger.info(
                    `Resetting the update of node ${peerAddress.toString()} before forcing version ${targetSoftwareVersion}`,
                );
                this.#abortAnnouncement(existingEntry);
                existingEntry.phase = { state: "queued", resetAt: Time.nowMs };
            }
            const entry = this.#storeConsent(peerAddress, target, otaEndpoint);
            if (entry !== undefined) {
                this.#startAnnouncement(entry);
            }
        });
    }

    /**
     * How BDX should carry this peer's update: the options given with its consent, else the general defaults in
     * {@link State}.  An absent value leaves the decision to the peer and its medium.
     */
    bdxTransferOptionsFor(peerAddress: PeerAddress) {
        const consent = this.internal.consents.get(PeerAddress(peerAddress));
        return {
            maxBlockSize: consent?.maxBdxBlockSize ?? this.state.maxBdxBlockSize,
            additionalMrpDelay: consent?.bdxAdditionalMrpDelay ?? this.state.bdxAdditionalMrpDelay,
        };
    }

    /**
     * Gives the consent to update the peer's node to the target version.  A peer has one consent.
     *
     * | Case                                       | Result                                                        |
     * |--------------------------------------------|---------------------------------------------------------------|
     * | no node has the peer address               | {@link OtaUpdateError}; nothing changes                       |
     * | vendor or product ID of an applicable node | {@link ImplementationError}; nothing changes                  |
     * | do not match                               |                                                               |
     * | the node runs the target or a higher       | `false`; nothing is stored                                    |
     * | version                                    |                                                               |
     * | the node is not applicable for updates     | the consent is stored; `false`                                |
     * | any other                                  | replaces the peer's consent, also a failed one; a queued      |
     * |                                            | update the node does not follow yet takes the version; `true` |
     * |                                            | when the node is applicable for updates and has a queued      |
     * |                                            | update afterwards                                             |
     *
     * The update is announced with the next queue slot, so potentially delayed.  A consent given while the node follows
     * an update to another version takes effect when that update ends.
     *
     * Not promised: keeping an earlier consent next to the new one, an order among consents, or a memory of removed
     * consents.  The consents are not persisted.
     *
     * This can be used when the update can be executed in a delayed/queued manner and it does not matter exactly when.
     */
    async addUpdateConsent(peerAddress: PeerAddress, target: SoftwareUpdateManager.UpdateTarget): Promise<boolean> {
        assertTransferOptions(target);
        peerAddress = PeerAddress(peerAddress);
        const otaEndpoint = this.#otaEndpointFor(peerAddress, target);
        return this.#mutate(() => this.#storeConsent(peerAddress, target, otaEndpoint)) !== undefined;
    }

    /**
     * The OTA requestor endpoint of the node when it is applicable for updates.  Throws {@link OtaUpdateError} when no
     * node has the peer address, as for a node removed after the caller looked it up, and
     * {@link ImplementationError} when an applicable node does not match the vendor or product ID.
     */
    #otaEndpointFor(peerAddress: PeerAddress, { vendorId, productId }: SoftwareUpdateManager.UpdateTarget) {
        const node = this.#peerOf(peerAddress);
        if (node === undefined) {
            throw new OtaUpdateError(`No node has the peer address ${peerAddress.toString()}`);
        }
        const {
            otaEndpoint,
            vendorId: nodeVendorId,
            productId: nodeProductId,
        } = this.#preparePeerForUpdate(node) ?? {};
        if (otaEndpoint !== undefined && (nodeVendorId !== vendorId || nodeProductId !== productId)) {
            throw new ImplementationError(`Node at ${peerAddress.toString()} does not match given vendorId/productId`);
        }
        return otaEndpoint;
    }

    /**
     * Replaces the peer's consent, lets its queue entry take the version, and queues the update when `otaEndpoint` is
     * given.  A consent for a version at or below the one the node runs is not stored.  Returns the peer's queue entry,
     * or `undefined` when nothing was queued.
     */
    #storeConsent(peerAddress: PeerAddress, target: SoftwareUpdateManager.UpdateTarget, otaEndpoint?: Endpoint) {
        const { vendorId, productId, targetSoftwareVersion, maxBdxBlockSize, bdxAdditionalMrpDelay } = target;
        const runningVersion = this.#softwareVersionOf(peerAddress);
        if (runningVersion !== undefined && targetSoftwareVersion <= runningVersion) {
            logger.info(
                `Node ${peerAddress.toString()} already runs version ${runningVersion}, not storing a consent for version ${targetSoftwareVersion}`,
            );
            return undefined;
        }
        this.internal.consents.set(peerAddress, {
            peerAddress,
            vendorId,
            productId,
            targetSoftwareVersion,
            maxBdxBlockSize,
            bdxAdditionalMrpDelay,
        });
        this.#scheduleExpiry();
        const entry = this.#entryFor(peerAddress);
        if (entry !== undefined) {
            this.#retarget(entry);
        }

        if (otaEndpoint === undefined) {
            logger.info(
                `Node ${peerAddress.toString()} is currently not applicable for OTA updates, a later update check queues its update`,
            );
            return undefined;
        }
        return this.#queueUpdate({ vendorId, productId, peerAddress, endpoint: otaEndpoint });
    }

    /**
     * Checks if consent exists for the given peer address and optionally for a specific target software version.  A
     * failed update keeps its consent for 24 hours.
     */
    hasConsent(peerAddress: PeerAddress, targetSoftwareVersion?: number) {
        const consent = this.internal.consents.get(PeerAddress(peerAddress));
        return (
            consent !== undefined &&
            (targetSoftwareVersion === undefined || consent.targetSoftwareVersion === targetSoftwareVersion)
        );
    }

    /**
     * Removes the peer's consent for `targetSoftwareVersion`, or for any version without it.  While the attempt of an
     * update token runs, the token no longer allows the apply of a removed version, see {@link applyUpdate}.  It ends the
     * peer's queries that made no offer yet, whether or not a consent was stored, so the provider answers them
     * `NotAvailable`.
     *
     * | Case                                         | Result                                                       |
     * |----------------------------------------------|--------------------------------------------------------------|
     * | `targetSoftwareVersion` names another        | the consent stays; only the update tokens of that version    |
     * | version than the consent                     | and a queued update to it are affected                       |
     * | no version, or the version of the consent    | the consent is removed                                       |
     * | the queued update to a removed version is    | continues: the apply can no longer be stopped; the entry     |
     * | applying                                     | stays until the node reports the outcome                     |
     * | the queued update to a removed version was   | leaves the queue with `updateFailed`; its BDX transfer is    |
     * | announced or is followed by the node         | cancelled                                                    |
     * | the queued update to a removed version is    | leaves the queue with `updateFailed`; its announcement is    |
     * | queued or announcing                         | aborted                                                      |
     *
     * `updateFailed` is not emitted again for an update whose failure it reported, see {@link Events.updateFailed}.
     *
     * Without `targetSoftwareVersion`, a BDX transfer of the node is cancelled in every case except an applying update.
     * When a consent is left after an update was cancelled with its transfer, the update to its version is queued
     * again.
     *
     * Not promised: anything after the call.  A later QueryImage is decided by the rules of that moment: a node that
     * obtains consent itself is offered an update again when {@link State.delegateConsentToRequestor} is on.  An apply
     * under an update token this provider does not know, also the token of an attempt that ended, is allowed as before,
     * see {@link applyUpdate}.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.20.3.6.1
     */
    async removeConsent(peerAddress: PeerAddress, targetSoftwareVersion?: number): Promise<void> {
        peerAddress = PeerAddress(peerAddress);
        const removal = this.#mutate((): { cancelTransfer: boolean; cancelledEntry?: UpdateQueueEntry } => {
            const { consents, attempts } = this.internal;
            const consent = consents.get(peerAddress);
            if (
                consent !== undefined &&
                (targetSoftwareVersion === undefined || consent.targetSoftwareVersion === targetSoftwareVersion)
            ) {
                consents.delete(peerAddress);
                this.#scheduleExpiry();
            } else {
                logger.info(
                    `No consent to remove found for node ${peerAddress.toString()}${targetSoftwareVersion !== undefined ? ` for version ${targetSoftwareVersion}` : ""}`,
                );
            }
            for (const attempt of attempts.of(peerAddress)) {
                if (attempt.token === undefined) {
                    attempt.end();
                } else if (targetSoftwareVersion === undefined || attempt.version === targetSoftwareVersion) {
                    attempt.disallowApply();
                }
            }

            const removesAll = targetSoftwareVersion === undefined;
            const entry = this.#entryFor(peerAddress);
            if (entry === undefined || (!removesAll && targetSoftwareVersion !== entry.targetSoftwareVersion)) {
                return { cancelTransfer: removesAll };
            }
            const { phase } = entry;
            if (phase.state === "progress" && phase.attempt.status === OtaUpdateStatus.Applying) {
                logger.info(
                    `Update of node ${peerAddress.toString()} is already applying, it can no longer be cancelled`,
                );
                return { cancelTransfer: false };
            }
            logger.info(`Cancelled OTA update for node ${peerAddress.toString()}`);
            this.internal.rebootResubscribeArmer?.disarm(peerAddress);
            const reportedFailed =
                consent?.targetSoftwareVersion === entry.targetSoftwareVersion && consent.failedAt !== undefined;
            this.#dequeue(entry, reportedFailed ? undefined : "updateFailed");
            this.#triggerQueuedUpdate();
            const underway = isUnderway(phase);
            return { cancelTransfer: removesAll || underway, cancelledEntry: underway ? entry : undefined };
        });
        if (!removal.cancelTransfer) {
            return;
        }
        await this.#cancelBdxTransfer(peerAddress);
        const { cancelledEntry } = removal;
        if (cancelledEntry !== undefined) {
            this.#mutate(() => this.#queueUpdate(cancelledEntry));
        }
    }

    /**
     * Suppresses the next startUp event of the peer on the session, as {@link admitQuery} found a QueryImage the
     * restart of the node sent, so the startUp event that follows is not taken for a failed apply.
     */
    #suppressNextStartUp(peerAddress: PeerAddress, sessionId: number) {
        this.internal.pendingStartUpSuppress.set(peerAddress, sessionId);
    }

    /**
     * Starts the attempt of a QueryImage that just arrived.  The OTA provider holds the attempt for the query and ends
     * the query with {@link endQuery}.
     *
     * @internal
     */
    beginQuery(peerAddress: PeerAddress): OtaUpdateAttempt {
        return this.internal.attempts.begin(PeerAddress(peerAddress));
    }

    /**
     * Records the offer the OTA provider makes for the query.  Every offer allows the node to apply its version until
     * the consent for it is removed, see {@link applyUpdate}, so the provider makes it only when the apply is wanted:
     * the peer has a consent for the version, the node obtains consent itself, the provider obtained the consent, or
     * the `checkUpdateAvailable()` override returned `consentRequired: false`, which is its own consent.
     * The provider calls this after its last await, so the decision holds for the answer it sends.  Returns false when
     * the attempt ended meanwhile, as when {@link removeConsent} removed the consent while the query ran; the provider
     * answers `NotAvailable` then.
     *
     * @internal
     */
    offerUpdate(attempt: OtaUpdateAttempt, updateToken: Bytes, version: number) {
        if (attempt.ended) {
            logger.info(`${attempt.toString()} ended before it could offer version ${version}`);
            return false;
        }
        attempt.makeOffer(updateToken, version);
        return true;
    }

    /**
     * Records that the provider answered the query with its offer.  This ends the node's previous attempt with an
     * offer, see {@link #endAttempt}, and links the attempt to the peer's queued update when it offers the update's
     * target, see {@link #linkAttempt}.
     *
     * @internal
     */
    offerAnswered(attempt: OtaUpdateAttempt) {
        if (attempt.ended) {
            return;
        }
        this.#mutate(() => {
            this.#answerAttempt(attempt);
            if (!this.internal.suppressUpdates) {
                this.#linkAttempt(attempt);
            }
        });
    }

    /**
     * Ends the query: its attempt ends too, unless the provider answered the query with its offer.
     *
     * @internal
     */
    endQuery(attempt: OtaUpdateAttempt) {
        if (!attempt.answered) {
            this.#mutate(() => this.#endAttempt(attempt));
        }
    }

    /**
     * The peer's running attempt with an offer under `updateToken`.
     *
     * @internal
     */
    attemptFor(peerAddress: PeerAddress, updateToken: Bytes): OtaUpdateAttempt | undefined {
        return this.internal.attempts.find(PeerAddress(peerAddress), updateToken);
    }

    /**
     * Decides whether a QueryImage that arrived on `session` may get an offer while the peer has an attempt with an
     * offer, and ends that attempt when the node left it:
     *
     * | Running attempt of the peer                       | Result                                                 |
     * |---------------------------------------------------|--------------------------------------------------------|
     * | stale, see {@link OtaUpdateAttempt.isStale}       | ends; the query is admitted                            |
     * | `Applying`, linked to the queued update, no       | the update failed to apply; the attempt ends; the      |
     * | transfer, the query reports a version below the   | query is admitted                                      |
     * | target of the queued update                       |                                                        |
     * | any other without a BDX transfer                  | ends; the query is admitted                            |
     * | transfer last active before `session`, as after a | the transfer is cancelled, the attempt ends, and the   |
     * | restart of the node                               | startUp of that restart is suppressed; admitted        |
     * | transfer running, or it could not be cancelled    | not admitted; the provider answers Busy                |
     *
     * @internal
     */
    async admitQuery(peerAddress: PeerAddress, session: NodeSession, reportedSoftwareVersion: number) {
        peerAddress = PeerAddress(peerAddress);
        const admission = this.#mutate((): { admitted: boolean } | { restarted: OtaUpdateAttempt } => {
            const now = Time.nowMs;
            for (const attempt of this.internal.attempts.offered(peerAddress)) {
                if (attempt.isStale(now)) {
                    logger.info(
                        `Removing stale ${attempt.toString()} (age: ${Duration.format(Timestamp.delta(attempt.lastActivity, now))})`,
                    );
                    this.#endAttempt(attempt);
                }
            }
            const [running] = this.internal.attempts.offered(peerAddress);
            if (running === undefined) {
                return { admitted: true };
            }

            const transferSession = this.#bdxSessionFor(peerAddress)?.session;
            if (transferSession === undefined) {
                const entry = this.#linkedEntry(running);
                if (
                    entry !== undefined &&
                    running.status === OtaUpdateStatus.Applying &&
                    reportedSoftwareVersion < entry.targetSoftwareVersion
                ) {
                    logger.warn(
                        `Node ${peerAddress.toString()} queried again with softwareVersion ${reportedSoftwareVersion} after applying version ${entry.targetSoftwareVersion}, update failed to apply`,
                    );
                    this.#failUpdate(entry);
                }
                this.#endAttempt(running);
                return { admitted: true };
            }
            if (transferSession.id === session.id || transferSession.activeTimestamp >= session.activeTimestamp) {
                logger.info(`${running.toString()} already in progress (${OtaUpdateStatus[running.status]})`);
                return { admitted: false };
            }
            return { restarted: running };
        });
        if ("admitted" in admission) {
            return admission.admitted;
        }

        const { restarted } = admission;
        try {
            await this.env.get(BdxProtocol).disablePeerForScope(peerAddress, this.storage, true);
        } catch (error) {
            MatterError.accept(error);
            logger.warn(
                `Could not cancel the BDX transfer of ${restarted.toString()} after the node restarted:`,
                error,
            );
            return false;
        }
        this.#mutate(() => {
            this.#endAttempt(restarted);
            // The peer may have lost its queued update while the transfer was cancelled
            if (this.#entryFor(peerAddress) !== undefined) {
                this.#suppressNextStartUp(peerAddress, session.id);
            }
        });
        return true;
    }

    /**
     * The version an ApplyUpdateRequest of the peer under `updateToken` asks to apply: `newVersion`, or for version 0
     * the version this provider offered under the token.  This is a rule of this provider, not of the specification:
     * an offered version is above the one the requestor runs, so version 0 names no image.  Under a token without an
     * offer, version 0 names no version and this returns `undefined`.
     *
     * @internal
     */
    appliedVersionOf(peerAddress: PeerAddress, updateToken: Bytes, newVersion: number) {
        return newVersion !== 0
            ? newVersion
            : this.internal.attempts.find(PeerAddress(peerAddress), updateToken)?.version;
    }

    /**
     * Decides an ApplyUpdateRequest for the version {@link appliedVersionOf} names and records the outcome: `Applying`
     * with the `applyDelay` the provider sends, which the device waits out before it applies and restarts, or
     * `Cancelled`.  Returns whether the apply is allowed (`Proceed`); else the provider answers `Discontinue`.
     *
     * | Update token                                   | Result                                                    |
     * |------------------------------------------------|-----------------------------------------------------------|
     * | known, the request names another version than  | refused                                                   |
     * | the one offered under it                       |                                                           |
     * | known, its attempt is already `Applying`       | allowed, as a resent ApplyUpdateRequest                   |
     * | known                                          | allowed unless a consent for its version was removed      |
     * |                                                | since the offer, see {@link removeConsent}                |
     * | unknown, with a version above 0                | allowed; becomes a new answered attempt                   |
     * | unknown, with version 0                        | refused, as it names no image                             |
     *
     * A token is known while its attempt runs.  An attempt ends, for example, when the node follows a newer token or its
     * update failed; a stalled attempt ends only at the node's next query, see {@link admitQuery}.  Not promised: a refusal under a token whose attempt ended.  An apply under it is an apply under
     * an unknown token, so a re-apply under the token of a failed attempt gets `Proceed` for a version above 0, as the
     * specification asks for an unknown token.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.20.3.6.1
     * @see {@link MatterSpecification.v161.Core} § 11.20.3.6.2
     * @internal
     */
    applyUpdate(peerAddress: PeerAddress, updateToken: Bytes, newVersion: number, applyDelay: Duration) {
        peerAddress = PeerAddress(peerAddress);
        const version = this.appliedVersionOf(peerAddress, updateToken, newVersion);
        if (version === undefined) {
            logger.info(
                `Node ${peerAddress.toString()} may not apply version 0 under the update token ${Bytes.toHex(updateToken)}, which offered no version`,
            );
            return false;
        }
        return this.#mutate(() => {
            let attempt = this.internal.attempts.find(peerAddress, updateToken);
            if (attempt === undefined) {
                attempt = this.internal.attempts.begin(peerAddress);
                attempt.makeOffer(updateToken, version);
                this.#answerAttempt(attempt);
            } else if (!this.#applyAllowed(attempt, version)) {
                this.#reportAttemptStatus(attempt, OtaUpdateStatus.Cancelled);
                return false;
            }
            this.#reportAttemptStatus(attempt, OtaUpdateStatus.Applying, applyDelay);
            return true;
        });
    }

    /** The rows of {@link applyUpdate} for a known update token. */
    #applyAllowed(attempt: OtaUpdateAttempt, version: number) {
        if (attempt.version !== version) {
            logger.info(`${attempt.toString()} may not apply version ${version}`);
            return false;
        }
        if (attempt.status === OtaUpdateStatus.Applying || attempt.applyAllowed) {
            return true;
        }
        logger.info(`${attempt.toString()} has no consent to apply`);
        return false;
    }

    /**
     * Records the NotifyUpdateApplied of the peer, which ends the attempt of `updateToken`.  The peer's queued update
     * is done when the reported version is at or above its target, from any attempt.  A lower version of the linked
     * attempt keeps the update queued for a retry; a lower version of any other attempt changes nothing, and the
     * version the node reports after its restart decides, see {@link #onSoftwareVersionChanged}.
     *
     * @internal
     */
    updateApplied(peerAddress: PeerAddress, updateToken: Bytes, softwareVersion: number) {
        this.#mutate(() => this.#updateApplied(PeerAddress(peerAddress), updateToken, softwareVersion));
    }

    #updateApplied(peerAddress: PeerAddress, updateToken: Bytes, softwareVersion: number) {
        const attempt = this.internal.attempts.find(peerAddress, updateToken);
        let linkedEntry: UpdateQueueEntry | undefined;
        if (attempt !== undefined) {
            logger.info(`${attempt.toString()} is now ${OtaUpdateStatus[OtaUpdateStatus.Done]}`);
            if (!this.internal.suppressUpdates) {
                linkedEntry = this.#linkAttempt(attempt);
            }
            attempt.setStatus(OtaUpdateStatus.Done);
            attempt.end();
        }
        if (this.internal.suppressUpdates) {
            return;
        }
        const entry = this.#entryFor(peerAddress);
        if (entry === undefined) {
            logger.debug(
                `OTA update of node ${peerAddress.toString()} to version ${softwareVersion} applied, not queued`,
            );
            return;
        }
        if (softwareVersion >= entry.targetSoftwareVersion) {
            logger.info(`OTA update completed for node`, peerAddress.toString());
            this.#completeUpdate(entry, softwareVersion);
        } else if (linkedEntry === entry) {
            logger.info(
                `OTA update of node ${peerAddress.toString()} completed with version ${softwareVersion}, below its target ${entry.targetSoftwareVersion}, keeping it queued`,
            );
            this.#retryUpdate(entry);
        } else {
            logger.debug(
                `Ignoring OTA status Done of node ${peerAddress.toString()} for version ${softwareVersion}, below the target of its update`,
            );
        }
    }

    /**
     * Records a status of the attempt, other than `Done`, see {@link updateApplied}.  The status moves the
     * peer's queued update only while the update is linked to the attempt, see {@link #linkAttempt}; `Cancelled` never
     * links it.  `Cancelled` resets the update for a retry, `Applying` reports `updateApplying` and starts a fast
     * resubscription for the restart.
     *
     * @internal
     */
    reportAttemptStatus(attempt: OtaUpdateAttempt, status: OtaUpdateStatus, applyDelay?: Duration) {
        if (attempt.ended) {
            return;
        }
        this.#mutate(() => this.#reportAttemptStatus(attempt, status, applyDelay));
    }

    #reportAttemptStatus(attempt: OtaUpdateAttempt, status: OtaUpdateStatus, applyDelay?: Duration) {
        const wasApplying = attempt.status === OtaUpdateStatus.Applying;
        logger.info(
            `${attempt.toString()} is now ${OtaUpdateStatus[status]} (formerly ${OtaUpdateStatus[attempt.status]})`,
        );
        attempt.setStatus(status, applyDelay);
        // An Applying after dispose would start the disposed fast resubscription again, whose observers are closed
        if (this.internal.suppressUpdates) {
            return;
        }
        const entry = status === OtaUpdateStatus.Cancelled ? this.#linkedEntry(attempt) : this.#linkAttempt(attempt);
        if (entry === undefined) {
            return;
        }

        const { peerAddress } = attempt;
        if (status === OtaUpdateStatus.Cancelled) {
            logger.info(`OTA update cancelled for node ${peerAddress.toString()}, resetting for retry`);
            this.internal.rebootResubscribeArmer?.disarm(peerAddress);
            this.#retryUpdate(entry);
        } else if (status === OtaUpdateStatus.Applying) {
            // The device restarts after an allowed apply; the fast resubscription starts now, so a device that keeps
            // no subscription is read again within the grace window instead of after the subscription timeout.
            // NotifyUpdateApplied must not stop it: the subscription may still be stale then.
            this.#rebootResubscribeArmer.arm(peerAddress, applyDelay);
            if (!wasApplying) {
                this.#queueEvent(() => this.events.updateApplying.emit(peerAddress));
            }
        }
    }

    /** Marks the attempt answered and ends the node's attempts it replaces. */
    #answerAttempt(attempt: OtaUpdateAttempt) {
        for (const replaced of this.internal.attempts.answer(attempt)) {
            this.#endAttempt(replaced);
        }
    }

    /** The peer's queue entry while it is linked to the attempt. */
    #linkedEntry(attempt: OtaUpdateAttempt) {
        const entry = this.#entryFor(attempt.peerAddress);
        if (entry?.phase.state === "progress" && entry.phase.attempt === attempt) {
            return entry;
        }
    }

    /**
     * Links the peer's queue entry to the attempt, which moves it to `progress`, and returns the linked entry.  Only an
     * answered attempt that offers the entry's target is linked.  So an offer the provider did not answer the query
     * with, or a lower version the node obtained consent for itself, never moves it.  An entry follows one running
     * attempt at a time: ending an attempt resets its entry, see {@link #endAttempt}, except while the node goes
     * offline, see {@link #endAllAttempts}; a newly linked attempt then replaces the ended one.
     */
    #linkAttempt(attempt: OtaUpdateAttempt) {
        const entry = this.#entryFor(attempt.peerAddress);
        if (entry === undefined || !attempt.answered || attempt.version !== entry.targetSoftwareVersion) {
            return undefined;
        }
        const { phase } = entry;
        if (phase.state === "progress" && phase.attempt === attempt) {
            return entry;
        }
        const wasFailed = this.#isFailed(entry);
        entry.phase = { state: "progress", attempt };
        if (wasFailed) {
            this.#triggerQueuedUpdate();
        }
        return entry;
    }

    /**
     * Fails the peer's queued update when it cannot be delivered, because the peer's QueryImage found no image for it.
     * The default `checkUpdateAvailable()` of OtaSoftwareUpdateProviderServer calls this when {@link updateExistsFor}
     * offers nothing.
     *
     * The update fails like an apply that did not take, reported via the `updateFailed` event, only when the peer is
     * being or was announced for it, reported no status since (querying, consent, download, apply, done), and still
     * runs a version below the update's target, both by its QueryImage and by the cached Basic Information. A peer that
     * already runs the target, as after a slow restart into it, keeps its entry, so the update ends as done.
     */
    dropUndeliverableUpdate(peerAddress: PeerAddress, reportedSoftwareVersion: number) {
        this.#mutate(() => this.#dropUndeliverableUpdate(PeerAddress(peerAddress), reportedSoftwareVersion));
    }

    #dropUndeliverableUpdate(peerAddress: PeerAddress, reportedSoftwareVersion: number) {
        const entry = this.#entryFor(peerAddress);
        if (entry === undefined) {
            return;
        }
        const { targetSoftwareVersion, phase } = entry;
        const waitsForQuery = phase.state === "announcing" || phase.state === "announced";
        const cachedSoftwareVersion = this.#softwareVersionOf(peerAddress);
        if (
            !waitsForQuery ||
            reportedSoftwareVersion >= targetSoftwareVersion ||
            cachedSoftwareVersion !== reportedSoftwareVersion
        ) {
            return;
        }

        logger.info(
            `No image for the update to version ${targetSoftwareVersion} of node ${peerAddress.toString()}, the update failed`,
        );
        this.#failUpdate(entry);
    }

    override async [Symbol.asyncDispose]() {
        this.internal.suppressUpdates = true;
        await this.#stopAnnouncements();
        await this.internal.announcements?.close();
        for (const observers of this.internal.versionUpdateObservers.values()) {
            observers.close();
        }
        this.internal.versionUpdateObservers.clear();
        this.internal.rebootResubscribeArmer?.[Symbol.dispose]();
        this.#endAllAttempts();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace SoftwareUpdateManager {
    export class State {
        /** Set this to true to also allow updates from the Test DCL, and to offer stored test-net and local images */
        allowTestOtaImages = false;

        /** Default Update check Interval */
        updateCheckInterval = Hours(24);

        /**
         * Announce this controller as Update provider to all nodes: first 10 to 15 minutes after the controller went
         * online, then every {@link announcementInterval}.
         */
        announceAsDefaultProvider = false;

        /** Interval to Announces this controller as Update provider. Must not be lower than 24h, `Instant` disables. */
        announcementInterval = Hours(24);

        /**
         * Offer a requestor that can obtain user consent itself (`RequestorCanConsent`) the newest applicable stored
         * image without a consent given to this manager, with `UserConsentNeeded`, and accept its apply.  Off by
         * default, so no node is offered an image without a consent from the application.  An apply under an update
         * token this provider does not know is allowed without a consent either way, see
         * `SoftwareUpdateManager.applyUpdate()`.
         * An update delegated this way has no queue entry unless the node also has a consent, so it is usually not
         * reported via `updateDone` or `updateFailed`.
         *
         * A node with `LocalConfigDisabled` set is never asked to obtain consent itself.
         *
         * @see {@link MatterSpecification.v161.Core} § 11.20.3.4.1
         */
        delegateConsentToRequestor = false;

        /**
         * Caps the BDX block size offered for OTA transfers.  Unset accepts whatever the peer requests, which is the
         * transport maximum.
         *
         * A smaller block multiplies round trips, and each of those is bounded by the peer's BDX response budget, so
         * lower this only for a peer that cannot handle full-size blocks.
         */
        maxBdxBlockSize?: number = undefined;

        /**
         * Additive MRP retransmission margin for OTA transfers, overriding the margin the peer's medium implies.
         *
         * A BDX retransmission interval is capped so the whole schedule fits the peer's response budget, so values
         * above roughly 7s are inert.
         */
        bdxAdditionalMrpDelay?: Duration = undefined;
    }

    /** Identifies the update a consent applies to, and how to transfer it. */
    export interface UpdateTarget {
        vendorId: VendorId;
        productId: number;
        targetSoftwareVersion: number;

        /**
         * Caps the BDX block size for this transfer, overriding {@link State.maxBdxBlockSize}.  Unset falls back to
         * that default.
         */
        maxBdxBlockSize?: number;

        /**
         * Additive MRP retransmission margin for this transfer, overriding {@link State.bdxAdditionalMrpDelay} and the
         * margin the peer's medium implies.  Unset falls back to that default.
         */
        bdxAdditionalMrpDelay?: Duration;
    }

    export class Internal {
        /**
         * The consent of each peer.  Write them through the manager API: `addUpdateConsent()`, `removeConsent()` and
         * `forceUpdate()`, which also update the queue and the expiry of failed updates.  Read them with
         * `hasConsent()`.  The content is not persisted.
         *
         * @internal
         */
        readonly consents = new PeerAddressMap<UpdateConsent>();

        /**
         * Events of the change running through `#mutate`, emitted when the outermost change returns.
         *
         * @internal
         */
        outbox = new Array<() => void>();

        /**
         * How many changes run through `#mutate` inside each other.
         *
         * @internal
         */
        mutationDepth = 0;

        /** The reactors the observers of {@link versionUpdateObservers} feed; created with the first observer. */
        peerEventReactors?: PeerEventReactors;

        otaService!: DclOtaUpdateService;

        /** Scope of the OTA storage, captured so a lookup cannot depend on the service still being constructed. */
        otaStorageScope?: StorageScope;

        checkForUpdateTimer!: Timer;

        updateQueue = new Array<UpdateQueueEntry>();

        updateQueueTimer?: Timer;

        announcements?: OtaAnnouncements;

        /** Announcements still running, also those whose entry moved on; aborted on going offline and on dispose. */
        runningAnnouncements = new Map<Abort, Promise<void>>();

        /** The observers of the software version, startUp and subscription status of each node. */
        versionUpdateObservers = new PeerAddressMap<ObserverGroup>();

        knownUpdates = new PeerAddressMap<SoftwareUpdateInfo>();

        /**
         * Peer → session ID on which the reboot-triggering queryImage was received.
         *
         * Intentionally ephemeral (not persisted): the suppress window is sub-second — between the
         * queryImage response and the subsequent startUp event that follows on the same session.
         * Entries are consumed immediately when the matching startUp fires in #onSoftwareVersionChanged,
         * or cleaned up when the update is removed from the queue.
         */
        pendingStartUpSuppress = new PeerAddressMap<number>();

        rebootResubscribeArmer?: RebootResubscribeArmer;

        /** Raised whenever the node is not online, so update work cannot start before the first online transition. */
        suppressUpdates = true;

        /** The QueryImage flows of the nodes, which the OTA provider reports. */
        attempts = new OtaUpdateAttempts();

        /** Runs when the next failed consent expires. */
        expiryTimer?: Timer;
    }

    export class Events extends EventEmitter {
        /**
         * Emitted when the update check finds a version newer than the consent of the Peer, or when the Peer has no
         * consent for that vendor and product, with its details
         */
        updateAvailable = Observable<[peer: PeerAddress, updateDetails: SoftwareUpdateInfo]>();

        /**
         * Emitted when this provider allowed a Peer to apply the version its queued update follows, when the attempt
         * linked to the update becomes `Applying`.  It fires again for the same update token when the Peer applies
         * again after a failure.  An allowed apply of another version, as of an offer the Peer obtained consent for
         * itself, emits nothing, so an {@link updateDone} may follow without an `updateApplying` for that version.
         *
         * This is the last thing a Peer needs from its provider: the download is complete, the
         * `ApplyUpdateRequest` is answered, and what follows — applying and reporting back — is the
         * Peer's own. {@link updateDone} is further off, because it waits for the `NotifyUpdateApplied`
         * a device sends after it has restarted.
         */
        updateApplying = Observable<[peer: PeerAddress]>();

        /** Emitted when an update for a Peer is finished */
        updateDone = Observable<[peer: PeerAddress]>();

        /**
         * Emitted when a queued update fails, is cancelled with `removeConsent()`, or ends without a consent left.  A
         * failed update is reported once per consent: it keeps its consent for 24 hours, so the Peer may still retry it
         * on its own, and when that retry succeeds, {@link updateDone} follows.  The queued update of a Peer removed
         * from the node, or whose failed consent expired, ends without an event.
         */
        updateFailed = Observable<[peer: PeerAddress]>();

        announceAsDefaultProvider$Changed = Observable<[announceAsDefaultProvider: boolean]>();

        announcementInterval$Changed = Observable<[announcementInterval: Duration]>();
    }
}
