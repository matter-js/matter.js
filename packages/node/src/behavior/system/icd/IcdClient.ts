/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { IcdManagementClient } from "#behaviors/icd-management";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { Node } from "#node/Node.js";
import {
    AsyncObservable,
    AsyncObservableValue,
    Bytes,
    Crypto,
    Duration,
    ImplementationError,
    Logger,
    Millis,
    Observable,
    Observer,
    Seconds,
    Time,
    Timestamp,
} from "@matter/general";
import { bool, field, nonvolatile, octstr, subjectId, systimeMs, uint32, uint8 } from "@matter/model";
import { FabricManager, PeerAddress, PeerSet, SUBSCRIPTION_PROCESSING_TIME, type FabricIcd } from "@matter/protocol";
import { NodeId, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { IcdMultiAdminError } from "./IcdMultiAdminError.js";
import { litSupported } from "./litSupported.js";

const logger = Logger.get("IcdClient");

/**
 * Controller-side client for ICD (Intermittently Connected Device) Check-In support.
 *
 * Auto-installed on a {@link ClientNode} whose peer exposes the IcdManagement cluster. Registration — automatic for a
 * LIT-operating peer, or explicit via {@link register} — requires an established subscription so the decision runs on a
 * fresh operating mode rather than a stale cached one. The behavior tracks peer wakefulness to hold interactions for a
 * sleeping ICD.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.15.1, § 9.16
 */
export class IcdClient extends Behavior {
    declare internal: IcdClient.Internal;
    declare readonly state: IcdClient.State;
    declare readonly events: IcdClient.Events;

    static override readonly early = true;
    static override readonly id = "icd";

    get isRegistered() {
        return this.state.registered;
    }

    /** Whether the peer is LIT-capable (LongIdleTimeSupport feature and specification version >= 1.4.0). */
    get peerSupportsLit() {
        return litSupported(this.endpoint);
    }

    /**
     * Whether the peer is currently awake (send-now). Mirrors the per-peer wakefulness; a non-LIT or not-yet-fed peer
     * has nothing to await and reads true. Read-only observability — hold/park still consume the signal in protocol.
     */
    get awake() {
        return this.#fedWakefulness()?.awake.value ?? true;
    }

    /**
     * Deadline by which the next Check-In from a registered LIT peer is expected, or undefined when no Check-In is
     * scheduled (no fed peer / not registered / not LIT). Derived from the fed peer's wakefulness availability window.
     */
    get nextExpectedCheckin(): Timestamp | undefined {
        return this.#fedWakefulness()?.availableUntil;
    }

    /** Whether the peer is currently operating in LIT mode (LIT-capable AND OperatingMode === Lit; a DSLS flip changes this at runtime). */
    get #peerIsLongIdleTimeOperating() {
        return (
            this.peerSupportsLit &&
            this.endpoint.maybeStateOf(IcdManagementClient)?.operatingMode === IcdManagement.OperatingMode.Lit
        );
    }

    /**
     * Wire lifecycle reactors. Runs `early` so they are registered before the owner first comes online.
     */
    override initialize() {
        if (this.endpoint instanceof Node) {
            this.reactTo(this.endpoint.lifecycle.decommissioned, this.#onDecommissioned);
        }

        // Restore keys off the OWNER (controller) being online, not the peer: only then is the controller fabric
        // loaded. The peer's own online state is irrelevant — an ICD peer is offline precisely when it sends Check-Ins.
        const owner = this.endpoint.owner;
        if (owner instanceof Node) {
            this.reactTo(owner.lifecycle.online, this.#restoreReceivePath);
            if (owner.lifecycle.isOnline) {
                this.#restoreReceivePath();
            }
        }

        // A DSLS peer can flip SIT⇄LIT at runtime; track it so a fed peer's requiresAwait stays correct. operatingMode
        // (and thus operatingMode$Changed) only exists on LIT-capable peers.
        if (this.endpoint.behaviors.has(IcdManagementClient)) {
            this.maybeReactTo(
                this.endpoint.eventsOf(IcdManagementClient).operatingMode$Changed,
                this.#onOperatingModeChanged,
            );
        }

        // The subscription-established edge lands after the bootstrap read, so operatingMode is fresh when we decide;
        // the immediate check covers an already-active subscription.
        if (this.endpoint instanceof Node) {
            this.reactTo(this.endpoint.lifecycle.online, this.#onPeerOnline);
            this.reactTo(
                this.endpoint.eventsOf(NetworkClient).subscriptionStatusChanged,
                this.#onSubscriptionStatusChanged,
            );
            if (this.agent.get(NetworkClient).subscriptionActive) {
                this.#ensureLitRegistration();
            }
        }
    }

    /**
     * The peer coming online — a device-initiated reconnect (e.g. after a reboot) or our own — is live proof it is
     * awake, so re-arm its wakefulness like a Check-In would; a no-op for a non-LIT or unfed peer. Fires on the online
     * edge, after the session is adopted, so it never races an in-flight reconnect (signaling at raw session
     * establishment did).
     */
    #onPeerOnline() {
        this.#fedWakefulness()?.noteSignal();
    }

    #onSubscriptionStatusChanged(isActive: boolean) {
        if (isActive) {
            this.#ensureLitRegistration();
        }
    }

    #onOperatingModeChanged() {
        const wakefulness = this.#fedWakefulness();
        if (wakefulness !== undefined) {
            const litOperating = this.#peerIsLongIdleTimeOperating;
            wakefulness.requiresAwait = litOperating;
            // operatingMode only mutates via live inbound peer data (read/report), so a flip into LIT means the peer is
            // awake right now: re-arm the active window the requiresAwait setter just force-slept, so the recreate
            // re-subscribes in-window instead of parking a full idle cycle. Gate on the peer being online so a stale
            // rehydration of operatingMode cannot arm the window from data that is not live.
            if (litOperating && this.endpoint instanceof Node && this.endpoint.lifecycle.isOnline) {
                wakefulness.noteSignal();
            }
        }
        this.#ensureLitRegistration();
    }

    /**
     * Register as a Check-In client when the peer operates in LIT mode and we are not registered. Mandatory for LIT
     * peers, so it bypasses the multi-admin blacklist. Deferred own transaction; best-effort (a failure, e.g. peer
     * offline, is logged and retried by the next trigger). The running SustainedSubscription reads the wakefulness live,
     * so it adapts to the registration with no re-subscribe.
     */
    #ensureLitRegistration() {
        // Gate on capability, not the cached mode: a stale cached SIT must not skip the fresh read that would reveal LIT.
        // Require an established subscription: register() needs one anyway, and this suppresses a doomed attempt (and its
        // warn) when operatingMode$Changed fires during the pre-subscription bootstrap read.
        if (
            !this.peerSupportsLit ||
            !this.agent.get(NetworkClient).subscriptionActive ||
            this.state.registered ||
            this.internal.autoRegister !== undefined
        ) {
            return;
        }
        this.internal.autoRegister = this.#autoRegister();
    }

    async #autoRegister() {
        try {
            // Defer so an in-flight transaction settles before we open the registration transaction (mirror #startKeyRefresh).
            await Promise.resolve();
            await this.endpoint.act("icd-auto-register", async agent => {
                const icd = agent.get(IcdClient);
                // Re-check inside the transaction: state, reachability, or operating mode may have changed since the
                // trigger fired. A peer that went offline in the meantime is a no-op (the next online edge retries),
                // not an error.
                if (
                    icd.state.registered ||
                    !(icd.endpoint instanceof Node) ||
                    !icd.endpoint.lifecycle.isOnline ||
                    !litSupported(icd.endpoint)
                ) {
                    return;
                }
                // Fresh read (mirrors #readPeerFabrics): the cached mode may be stale, so only register on LIT confirmed
                // by the peer itself.
                const { operatingMode } = await icd.endpoint.getStateOf(IcdManagementClient, ["operatingMode"]);
                if (operatingMode !== IcdManagement.OperatingMode.Lit) {
                    return;
                }
                await icd.register({ allowMultiAdmin: true });
            });
        } catch (error) {
            logger.warn("ICD auto-registration for LIT peer failed", error);
        } finally {
            this.internal.autoRegister = undefined;
        }
    }

    /** The {@link IcdPeerWakefulness} for the currently fed peer, or undefined when no peer is fed. */
    #fedWakefulness() {
        const fedPeer = this.internal.fedPeer;
        if (fedPeer === undefined) {
            return undefined;
        }
        return this.env.get(FabricManager).maybeFor(fedPeer.fabricIndex)?.icd.wakefulnessFor(fedPeer.nodeId);
    }

    /**
     * Re-arm the Check-In receive path from persisted registration state. The {@link FabricIcd} peer entry is
     * runtime-only, so it is rebuilt on every controller online (restart or reconnect).
     */
    #restoreReceivePath() {
        if (!this.state.registered || this.state.key === undefined) {
            return;
        }
        const { fabric, peerNodeId } = this.#fabricContext();
        // Peer reachability is unknown after a controller restart, so do not seed the availability window.
        this.#feedFabricIcd(fabric, peerNodeId, false);
    }

    /**
     * Decommission already removed our fabric from the peer (peerAddress is cleared), so no peer
     * {@link IcdManagement.unregisterClient} is possible or needed — only local cleanup.
     */
    #onDecommissioned() {
        if (this.state.registered) {
            this.#clearRegistration();
        }
    }

    /** Drop the FabricIcd peer entry, clear all registration state, and emit `unregistered`. */
    #clearRegistration() {
        this.#dropFedPeer();
        this.state.registered = false;
        this.state.key = undefined;
        this.state.counterStart = undefined;
        this.state.lastOffset = undefined;
        this.state.monitoredSubject = undefined;
        this.state.clientType = undefined;
        this.state.lastCheckInReceivedAt = undefined;
        this.state.available = false;
        this.events.unregistered.emit();
    }

    #dropFedPeer() {
        const fedPeer = this.internal.fedPeer;
        if (fedPeer === undefined) {
            return;
        }
        this.#unsubscribeAvailable();
        this.#unsubscribeCheckInMissed();
        this.env.get(FabricManager).maybeFor(fedPeer.fabricIndex)?.icd.deletePeer(fedPeer.nodeId);
        this.internal.fedPeer = undefined;
    }

    #unsubscribeAvailable() {
        const { availableSource, availableListener } = this.internal;
        if (availableSource !== undefined && availableListener !== undefined) {
            availableSource.off(availableListener);
        }
        this.internal.availableSource = undefined;
        this.internal.availableListener = undefined;
    }

    #unsubscribeCheckInMissed() {
        const { checkInMissedSource, checkInMissedListener } = this.internal;
        if (checkInMissedSource !== undefined && checkInMissedListener !== undefined) {
            checkInMissedSource.off(checkInMissedListener);
        }
        this.internal.checkInMissedSource = undefined;
        this.internal.checkInMissedListener = undefined;
    }

    /**
     * Register this controller as a Check-In client on the peer.
     *
     * Installs a shared {@link IcdManagement.RegisterClientRequest.key} on the peer so it can send us encrypted
     * Check-In messages, records the rolling-counter baseline in {@link IcdClient.State}, and arms the controller-side Check-In
     * receive path on the fabric.
     *
     * @throws {ImplementationError} if the peer is not online (registration reads from and writes to the peer), or its
     *   IcdManagement cluster lacks the Check-In Protocol feature.
     * @throws {IcdMultiAdminError} if the peer has more than one administrator from other vendors and
     *   `allowMultiAdmin` is not set — see {@link IcdMultiAdminError.assertSingleAdmin}.
     */
    async register(options?: {
        monitoredSubject?: SubjectId;
        clientType?: IcdManagement.ClientType;
        allowMultiAdmin?: boolean;
        ignoredVendors?: VendorId[];
    }) {
        if (this.state.registered) {
            throw new ImplementationError(
                "ICD client is already registered; unregister first or let key refresh re-key in place.",
            );
        }

        if (!this.agent.get(NetworkClient).subscriptionActive) {
            throw new ImplementationError(
                "ICD registration requires an active subscription so the peer operating mode is not stale.",
            );
        }

        if (!(this.endpoint instanceof Node) || !this.endpoint.lifecycle.isOnline) {
            throw new ImplementationError("ICD registration requires the peer node to be online.");
        }

        if (!this.endpoint.maybeFeaturesOf(IcdManagementClient)?.checkInProtocolSupport) {
            throw new ImplementationError(
                "ICD registration refused: peer does not support the Check-In Protocol (CIP).",
            );
        }

        const { fabric, ownNodeId, peerNodeId } = this.#fabricContext();

        const {
            monitoredSubject = SubjectId(ownNodeId),
            clientType = IcdManagement.ClientType.Permanent,
            allowMultiAdmin = false,
            ignoredVendors = IcdMultiAdminError.TRUSTED_ECOSYSTEM_VENDORS,
        } = options ?? {};

        const fabrics = await this.#readPeerFabrics();
        IcdMultiAdminError.assertSingleAdmin(
            fabrics.map(f => f.vendorId),
            ignoredVendors,
            allowMultiAdmin,
        );

        const key = this.env.get(Crypto).randomBytes(16);

        const { icdCounter } = await this.#peerIcd().registerClient({
            checkInNodeId: ownNodeId,
            monitoredSubject,
            key,
            clientType,
        });

        this.state.key = key;
        this.state.counterStart = icdCounter;
        this.state.lastOffset = 0;
        this.state.monitoredSubject = monitoredSubject;
        this.state.clientType = clientType;
        this.state.registered = true;

        // The peer just answered registration I/O, so it is reachable: seed the availability window.
        this.#feedFabricIcd(fabric, peerNodeId, true);
        this.events.registered.emit();
    }

    /**
     * Remove this controller's Check-In registration from the peer and tear down the local receive path.
     *
     * Best-effort on the peer: local state is cleared even if the peer {@link IcdManagement.unregisterClient} fails (it
     * may be unreachable). A no-op when not registered.
     */
    async unregister(): Promise<void> {
        if (!this.state.registered) {
            return;
        }

        // Clear registered up front so a late refreshNeeded Check-In cannot start a new re-key that races this
        // teardown; then settle any already in-flight re-key before we tear down the peer entry.
        this.state.registered = false;
        await this.internal.keyRefresh;

        const { ownNodeId } = this.#fabricContext();

        try {
            await this.#peerIcd().unregisterClient({ checkInNodeId: ownNodeId, verificationKey: this.state.key });
        } finally {
            this.#clearRegistration();
        }
    }

    /**
     * Locally drop this controller's Check-In registration without contacting the peer.
     *
     * Escape hatch for an unreachable registered LIT peer: {@link unregister} round-trips to the peer, so it parks on
     * the same wakefulness deadlock this clears. Dropping the fed peer removes its wakefulness, so subsequent
     * interactions no longer hold — a later subscribe can re-establish and re-register. The peer keeps a stale
     * registration for us until it prunes it (or a fresh {@link register} mints a new key). A no-op when not registered.
     */
    async forget(): Promise<void> {
        if (!this.state.registered) {
            return;
        }

        // Clear registered up front so a late refreshNeeded Check-In cannot start a new re-key; then settle any
        // in-flight re-key before teardown so it cannot resurrect the state we are about to clear.
        this.state.registered = false;
        await this.internal.keyRefresh;

        logger.info("ICD registration forgotten locally (no peer UnregisterClient); peer retains a stale registration");
        this.#clearRegistration();
    }

    /**
     * Ask the peer to remain in Active mode for at least `duration` and return the duration it actually promised.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.4
     */
    async stayActive(duration: Duration): Promise<Duration> {
        const { promisedActiveDuration } = await this.#peerIcd().stayActiveRequest({
            stayActiveDuration: Millis.of(duration),
        });
        const promised = Millis(promisedActiveDuration);
        this.#fedWakefulness()?.noteStayActive(promised);
        return promised;
    }

    #fabricContext() {
        const peerAddress = this.endpoint.stateOf(CommissioningClient).peerAddress;
        if (peerAddress === undefined) {
            throw new ImplementationError("ICD registration requires a commissioned peer.");
        }
        const { fabricIndex, nodeId: peerNodeId } = peerAddress;
        const fabric = this.env.get(FabricManager).for(fabricIndex);
        const ownNodeId = fabric.nodeId;
        return { fabric, ownNodeId, peerNodeId };
    }

    async #readPeerFabrics() {
        const { fabrics } = await this.endpoint.getStateOf(OperationalCredentialsClient, ["fabrics"], {
            fabricFilter: false,
        });
        return fabrics ?? [];
    }

    #peerIcd() {
        return this.agent.get(IcdManagementClient);
    }

    #feedFabricIcd(fabric: ReturnType<FabricManager["for"]>, peerNodeId: NodeId, seed: boolean) {
        const { key, counterStart, lastOffset } = this.state;
        if (key === undefined || counterStart === undefined || lastOffset === undefined) {
            throw new ImplementationError("ICD peer cannot be fed to the fabric before registration state is set.");
        }
        if (this.internal.checkInHandler === undefined) {
            this.internal.checkInHandler = this.callback(this.#onCheckIn, { offline: true, lock: true });
        }
        fabric.icd.addPeer({ peerNodeId, key, counterStart, lastOffset }, this.internal.checkInHandler);
        this.internal.fedPeer = PeerAddress({ fabricIndex: fabric.fabricIndex, nodeId: peerNodeId });

        const wakefulness = fabric.icd.wakefulnessFor(peerNodeId);
        if (wakefulness === undefined) {
            return;
        }

        const icdState = this.endpoint.maybeStateOf(IcdManagementClient);
        // Subscribed availability mirrors the subscription's own liveness timeout (PeerSubscription.timeout =
        // reportInterval + maxPeerResponseTime×2). Use the identical inputs — SUBSCRIPTION_PROCESSING_TIME, local leg
        // only — so the injected reportMargin equals that slack exactly and availability never lapses before the
        // subscription itself times out.
        const peer = this.env.get(PeerSet).get(this.internal.fedPeer);
        wakefulness.setTimings({
            activeModeThreshold:
                icdState?.activeModeThreshold === undefined ? undefined : Millis(icdState.activeModeThreshold),
            idleModeDuration: icdState?.idleModeDuration === undefined ? undefined : Seconds(icdState.idleModeDuration),
            reportMargin:
                peer === undefined
                    ? undefined
                    : Millis(peer.exchangeProvider.maximumPeerResponseTime(SUBSCRIPTION_PROCESSING_TIME) * 2),
        });
        wakefulness.requiresAwait = this.#peerIsLongIdleTimeOperating;

        if (seed) {
            wakefulness.noteSignal();
        }

        // addPeer recreates the wakefulness each feed (e.g. key refresh), so re-establish the availability mirror.
        this.#unsubscribeAvailable();
        const listener = this.callback(this.#onAvailableChanged, { offline: true, lock: true });
        wakefulness.available.on(listener);
        this.internal.availableSource = wakefulness.available;
        this.internal.availableListener = listener;
        this.state.available = wakefulness.available.value === true;

        this.#unsubscribeCheckInMissed();
        const checkInMissedListener = this.callback(this.#onCheckInMissed, { offline: true, lock: true });
        wakefulness.checkInMissed.on(checkInMissedListener);
        this.internal.checkInMissedSource = wakefulness.checkInMissed;
        this.internal.checkInMissedListener = checkInMissedListener;
    }

    #onAvailableChanged(available: boolean) {
        this.state.available = available;
    }

    #onCheckInMissed() {
        this.events.checkInMissed.emit();
    }

    #onCheckIn(checkIn: FabricIcd.ReceivedCheckIn) {
        const { offset, counter, activeModeThreshold, refreshNeeded } = checkIn;

        // fabric.icd advanced its own runtime offset before invoking us; persist it so a restart cannot restore a stale
        // lastOffset and reopen the replay window.
        this.state.lastOffset = offset;
        this.state.lastCheckInReceivedAt = Time.nowMs;
        this.events.checkedIn.emit({ counter, activeModeThreshold });

        // A tracked in-flight refresh (presence also guards against a second overlapping re-key) keeps the promise
        // awaitable at teardown instead of orphaned.
        if (refreshNeeded && this.state.registered && this.internal.keyRefresh === undefined) {
            this.internal.keyRefresh = this.#startKeyRefresh();
        }
    }

    async #startKeyRefresh(): Promise<void> {
        try {
            // Defer one microtask so the Check-In RX transaction settles before we open the refresh transaction; the
            // refresh does peer I/O and writes state, so it must run in its own transaction rather than escaping the
            // RX one.
            await Promise.resolve();
            await this.endpoint.act("icd-key-refresh", agent => agent.get(IcdClient).#refreshKey());
        } catch (error) {
            // The new key is persisted only after registerClient resolves, so a transient/unreachable failure leaves
            // the old key intact and the next Check-In retries. A programmer/state error (ImplementationError) is not
            // that benign case — it can leave the controller and peer keys out of sync, so surface it loudly.
            if (error instanceof ImplementationError) {
                logger.error("ICD key refresh failed unexpectedly; controller and peer keys may be out of sync", error);
            } else {
                logger.warn("ICD key refresh failed; will retry on next check-in", error);
            }
        } finally {
            this.internal.keyRefresh = undefined;
        }
    }

    /**
     * Re-key the registration in place before the rolling counter offset reaches 2³¹.
     *
     * @see {@link MatterSpecification.v151.Core} § 4.22.3.4.1
     */
    async #refreshKey() {
        const { fabric, ownNodeId, peerNodeId } = this.#fabricContext();
        const { monitoredSubject, clientType } = this.state;
        if (monitoredSubject === undefined || clientType === undefined) {
            throw new ImplementationError("ICD key refresh requires an existing registration.");
        }

        const verificationKey = this.state.key;
        const key = this.env.get(Crypto).randomBytes(16);
        const { icdCounter } = await this.#peerIcd().registerClient({
            checkInNodeId: ownNodeId,
            monitoredSubject,
            key,
            clientType,
            verificationKey,
        });

        this.state.key = key;
        this.state.counterStart = icdCounter;
        this.state.lastOffset = 0;

        // Re-key in place rather than delete+re-add: the wakefulness (and any subscription parked on it) must survive
        // the refresh. The triggering Check-In already re-armed the windows.
        fabric.icd.updatePeer(peerNodeId, { key, counterStart: icdCounter, lastOffset: 0 });
        this.events.keyRefreshed.emit();
    }

    /**
     * Wait for an in-flight key refresh to finish on teardown — aborting between the peer re-key and our state write
     * would leave the controller and peer with mismatched keys.
     */
    override async [Symbol.asyncDispose]() {
        await this.internal.autoRegister;
        await this.internal.keyRefresh;
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace IcdClient {
    export class Internal {
        /** Retained across re-registrations so the protocol RX path stays armed without creating a second closure. */
        checkInHandler?: FabricIcd.CheckInHandler;

        /** In-flight key refresh; tracked so a second refreshNeeded Check-In can't overlap it and teardown can await it. */
        keyRefresh?: Promise<void>;

        /** In-flight LIT auto-registration; tracked so overlapping triggers can't double-register and teardown can await it. */
        autoRegister?: Promise<void>;

        /** Address of the peer fed to {@link FabricIcd}; lets decommission drop it after peerAddress is already gone. */
        fedPeer?: PeerAddress;

        /** The fed peer's wakefulness `available` observable we currently mirror; recreated on every feed. */
        availableSource?: AsyncObservableValue<[boolean]>;

        /** Listener mirroring {@link availableSource} into {@link IcdClient.State.available}; removed on drop and before re-feed. */
        availableListener?: Observer<[boolean]>;

        /** The fed peer's wakefulness `checkInMissed` observable we currently mirror; recreated on every feed. */
        checkInMissedSource?: AsyncObservable<[]>;

        /** Listener mirroring {@link checkInMissedSource} into {@link IcdClient.Events.checkInMissed}; removed on drop and before re-feed. */
        checkInMissedListener?: Observer<[]>;
    }

    export class State {
        /**
         * Shared secret installed on the peer at registration, used to verify Check-In message ICD counters.
         */
        @field(octstr, nonvolatile)
        key?: Bytes;

        /**
         * ICD counter value the peer reported at registration; Check-In counters are validated relative to this.
         */
        @field(uint32, nonvolatile)
        counterStart?: number;

        /**
         * Offset of the most recently observed Check-In counter from {@link counterStart}.
         */
        @field(uint32, nonvolatile)
        lastOffset?: number;

        /**
         * Subject the peer monitors on our behalf (the node ID notified on Check-In).
         */
        @field(subjectId, nonvolatile)
        monitoredSubject?: SubjectId;

        /**
         * Client type registered with the peer (permanent or ephemeral).
         */
        @field(uint8, nonvolatile)
        clientType?: IcdManagement.ClientType;

        /**
         * Whether this controller is currently registered as a Check-In client on the peer.
         */
        @field(bool, nonvolatile)
        registered: boolean = false;

        /**
         * Time of the most recently received Check-In from the peer.
         */
        @field(systimeMs)
        lastCheckInReceivedAt?: Timestamp;

        /**
         * Whether the peer is reachable (within its expected Check-In window). Non-LIT peers are always available.
         */
        @field(bool)
        available: boolean = false;
    }

    export class Events extends BaseEvents {
        registered = Observable();
        unregistered = Observable();
        checkedIn = Observable<[checkIn: { counter: number; activeModeThreshold: number }]>();
        keyRefreshed = Observable();
        available$Changed = new Observable<[value: boolean, oldValue: boolean]>();

        /** Emits when a registered LIT peer misses its expected Check-In (its availability window lapsed). */
        checkInMissed = Observable();
    }
}
