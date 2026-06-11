/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import {
    Bytes,
    ChannelType,
    Crypto,
    Duration,
    ImplementationError,
    isIPv6,
    Millis,
    Observable,
    Seconds,
} from "@matter/general";
import { AccessLevel, DataModelPath, fabricIdx, field, listOf, nodeId, nonvolatile, octstr } from "@matter/model";
import {
    AccessControl,
    assertRemoteActor,
    DeviceAdvertiser,
    ExchangeManager,
    Fabric,
    FabricManager,
    hasRemoteActor,
    IcdAdvertisement,
    IcdCheckInSender,
    IcdCounter,
    PeerAddress,
    PeerSet,
    SessionManager,
} from "@matter/protocol";
import { FabricIndex, NodeId, SECURE_CHANNEL_PROTOCOL_ID, Status, StatusResponseError } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { DoublingCheckInBackOff, IcdCheckInBackOff } from "./IcdCheckInBackOff.js";
import { activeSubscriptionSubjects, isMonitoredSubjectCovered } from "./IcdCheckInSuppression.js";
import { IcdManagementBehavior } from "./IcdManagementBehavior.js";
import { IcdModeState } from "./IcdMode.js";

// CIP, LITS, DSLS, and UAT are all in the base so `this.state.operatingMode`, `this.events.operatingMode$Changed`,
// `this.features.dynamicSitLitSupport`, and `this.features.userActiveModeTrigger` typecheck throughout the shared
// logic. The exported IcdManagementServer resets to CIP-only via `.with(CIP)`.
// Drop the length bound on the RegisterClient/UnregisterClient verificationKey so a malformed (e.g. over-length) key is
// not rejected by the interaction layer with ConstraintError before the handler runs. Per § 9.16.7.1/§ 9.16.7.3 the key
// is only checked for a Manage-privileged caller (an Administrator ignores it); #assertMayModify compares the bytes, so
// a wrong length simply fails to match. Mirrors the GroupsServer model relaxation.
const { commands: icdCommands } = IcdManagement.schema;
const registerClientCommand = icdCommands.require("RegisterClient");
const unregisterClientCommand = icdCommands.require("UnregisterClient");
const IcdManagementSchema = IcdManagement.schema.extend(
    undefined,
    registerClientCommand.extend(
        undefined,
        registerClientCommand.fields.extend("VerificationKey", { constraint: "none" }),
    ),
    unregisterClientCommand.extend(
        undefined,
        unregisterClientCommand.fields.extend("VerificationKey", { constraint: "none" }),
    ),
);

const IcdManagementLogicBase = IcdManagementBehavior.for(IcdManagement, IcdManagementSchema).with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
    IcdManagement.Feature.DynamicSitLitSupport,
    IcdManagement.Feature.UserActiveModeTrigger,
);

/**
 * Minimum ActiveModeThreshold a LIT ICD must use.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.15.1.6.2
 */
const MIN_LIT_ACTIVE_MODE_THRESHOLD = Seconds(5);

/**
 * The promised StayActiveRequest duration is at least `min(this, requested)` — i.e. this caps the guaranteed minimum.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.16.7.5.1.1
 */
const STAY_ACTIVE_PROMISE_FLOOR = Seconds(30);

/**
 * UserActiveModeTriggerHint bits that require a non-empty UserActiveModeTriggerInstruction. The `*LightsBlink` bits also
 * depend on the instruction but may leave it empty, so they are excluded.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.16.6.7
 */
const INSTRUCTION_REQUIRED_TRIGGER_HINTS = [
    "customInstruction",
    "actuateSensorSeconds",
    "actuateSensorTimes",
    "resetButtonSeconds",
    "resetButtonTimes",
    "setupButtonSeconds",
    "setupButtonTimes",
    "appDefinedButton",
] as const;

/**
 * Default device-side ICD Management server implementation. Enables the Check-In Protocol Support (CIP) feature and
 * validates spec constraints on the timing attributes at startup. Use {@link IcdManagementServer.with} to specialize
 * for additional features, or extend this class to override its behavior.
 *
 * ## Idle/active mode
 *
 * The server tracks the ICD idle/active mode (distinct from the SIT/LIT {@link IcdManagement.OperatingMode}). matter.js
 * nodes never truly sleep and stay reachable, so the mode is **fully externally driven** — the device never sleeps or
 * wakes on its own. It is meant for spec/cert completeness, for verifying a controller against a real ICD peer, and as
 * power hooks for a node that proxies real sleepy hardware. The device enters active mode at startup and on every
 * idle→active wake; it stays active until told to sleep.
 *
 * Events (subscribe via `events.<name>`):
 * - `activeModeEntered` — entered active mode (initial power-up or an idle→active wake). On a CIP device this is the
 *   idle→active transition at which Check-Ins are sent (§ 9.15.1). Hook hardware power-up here.
 * - `idleModeEntered` — entered idle mode. Hook hardware power-down here.
 * - `mayEnterIdleMode` — the active window (≥ `activeModeDuration`, extended by network activity and StayActive) has
 *   elapsed while quiet: the application may now put the device to sleep. Advisory only — no transition happens.
 *
 * Runtime methods:
 * - {@link requestActiveMode} — wake into active mode for a full active window.
 * - {@link enterIdleMode} — force idle now (unconditional); pairs with `mayEnterIdleMode`.
 * - {@link triggerUserActiveMode} — simulate the device-physical User Active Mode Trigger (UAT feature; wakes the
 *   device). UAT exposes no Matter command.
 * - {@link setOperatingMode} — switch SIT↔LIT at runtime (DSLS feature; orthogonal to idle/active mode).
 *
 * Inbound network activity also extends/wakes active mode automatically. Idle/active transitions only happen via these
 * methods, a StayActiveRequest, or inbound activity — never on an internal timer.
 *
 * **For tests / a cert harness:** drive transitions deterministically — call {@link enterIdleMode} to go quiet, then
 * {@link requestActiveMode}/{@link triggerUserActiveMode} (or send any request to the device) to force the idle→active
 * transition that triggers Check-In sending. Advance a mock time source to elapse the active window.
 *
 * ## Extension points
 *
 * Override {@link stayActive} to customize the StayActiveRequest response: return the duration actually promised.
 * The default drives the mode machine and honors the spec floor (`min(30s, requested)`); override for a custom policy.
 *
 * ## Long Idle Time (LITS)
 *
 * Enable LITS with `IcdManagementServer.with(IcdManagement.Feature.CheckInProtocolSupport,
 * IcdManagement.Feature.LongIdleTimeSupport)` — CIP is mandatory under LITS and `.with` replaces (does not augment)
 * the feature set, so both must be listed. The mandatory `operatingMode` attribute has no spec-defined default and
 * must be configured by the application (initialization throws otherwise); set it to
 * {@link IcdManagement.OperatingMode.Sit} unless the device starts in LIT. DSLS devices may additionally call
 * {@link setOperatingMode} to switch SIT↔LIT at runtime.
 *
 * ### Dynamic SIT/LIT (DSLS)
 *
 * When also enabled via `IcdManagement.Feature.DynamicSitLitSupport`, the application may call
 * {@link setOperatingMode} at runtime to switch between SIT and LIT even when registrations exist — for example
 * when a mains-powered device switches to battery.
 *
 * ## User Active Mode Trigger (UAT)
 *
 * Enable with `IcdManagement.Feature.UserActiveModeTrigger`. The application configures `userActiveModeTriggerHint`
 * (which physical action wakes the device) and, when the hint requires it, `userActiveModeTriggerInstruction`
 * (initialization throws if a hint bit that depends on the instruction is set without one). UAT defines no Matter
 * command — call {@link triggerUserActiveMode} to simulate the physical trigger.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.16
 */
export class IcdManagementBaseServer extends IcdManagementLogicBase {
    declare internal: IcdManagementBaseServer.Internal;
    declare readonly state: IcdManagementBaseServer.State;
    declare readonly events: IcdManagementBaseServer.Events;

    override initialize() {
        const idleModeDuration = Seconds(this.state.idleModeDuration);
        const activeModeDuration = Millis(this.state.activeModeDuration);
        const maximumCheckInBackoff = Seconds(this.state.maximumCheckInBackoff);

        // @see {@link MatterSpecification.v151.Core} § 9.16.6.1
        if (idleModeDuration < activeModeDuration) {
            throw new ImplementationError(
                `idleModeDuration (${Duration.format(idleModeDuration)}) must be >= activeModeDuration (${Duration.format(activeModeDuration)})`,
            );
        }
        // @see {@link MatterSpecification.v151.Core} § 9.16.6.10
        if (maximumCheckInBackoff < idleModeDuration) {
            throw new ImplementationError(
                `maximumCheckInBackoff (${Duration.format(maximumCheckInBackoff)}) must be >= idleModeDuration (${Duration.format(idleModeDuration)})`,
            );
        }

        // CIP is mandatory under LITS; `.with(LongIdleTimeSupport)` alone silently drops it, so fail loudly.
        if (this.features.longIdleTimeSupport && !this.features.checkInProtocolSupport) {
            throw new ImplementationError("LongIdleTimeSupport requires the CheckInProtocolSupport feature");
        }

        // @see {@link MatterSpecification.v151.Core} § 9.15.1.6.2
        if (this.features.longIdleTimeSupport && this.state.activeModeThreshold < MIN_LIT_ACTIVE_MODE_THRESHOLD) {
            throw new ImplementationError(
                `LIT ICD requires activeModeThreshold (${Duration.format(Millis(this.state.activeModeThreshold))}) >= ${Duration.format(MIN_LIT_ACTIVE_MODE_THRESHOLD)}`,
            );
        }

        // @see {@link MatterSpecification.v151.Core} § 9.16.6.7–9.16.6.8 — these trigger hints require a non-empty
        // instruction string telling the user how to trigger active mode. The generated conformance is "desc" (prose
        // table), so this coupling is not enforced by the framework and must be checked here.
        if (this.features.userActiveModeTrigger && !this.state.userActiveModeTriggerInstruction) {
            const hint = this.state.userActiveModeTriggerHint;
            const missing = INSTRUCTION_REQUIRED_TRIGGER_HINTS.find(bit => hint[bit]);
            if (missing !== undefined) {
                throw new ImplementationError(
                    `userActiveModeTriggerHint.${missing} requires a non-empty userActiveModeTriggerInstruction`,
                );
            }
        }

        // Seed before the network runtime brings up the DeviceAdvertiser and publishes the first operational
        // announcement, so the ICD DNS-SD TXT key is present from that first announce.
        this.#installIcdAdvertisement();

        this.reactTo((this.endpoint.lifecycle as NodeLifecycle).online, this.#online);
    }

    /**
     * Register the ICD advertisement provider and seed its cache. The provider returns the pushed cache rather than
     * reading state because it runs outside the behavior transaction.
     *
     * Read-only by design: it derives the mode from {@link #effectiveMode} and never writes `operatingMode`, so calling
     * it from initialize() does not satisfy the mandatory-attribute check that rejects an unconfigured LIT device.
     */
    #installIcdAdvertisement() {
        this.env.get(DeviceAdvertiser).setIcdAdvertisementProvider(() => this.internal.currentIcdAdvertisement);
        this.#refreshIcdAdvertisementCache();
    }

    #online() {
        const fabrics = this.env.get(FabricManager);

        // One-time setup. online may re-fire across stop/start on the same instance; the counter and its persistence
        // reactor must be created once (and are torn down with the behavior on dispose).
        if (this.internal.icdCounter === undefined) {
            const counter = new IcdCounter(this.state.icdCounter);
            this.internal.icdCounter = counter;
            // Persist the boot-bump now; later increments persist via the reactor so writes stay transactional.
            // @see {@link MatterSpecification.v151.Core} § 4.6.3
            this.state.icdCounter = counter.value;
            this.reactTo(counter.changed, this.#persistCounter);
            this.reactTo(fabrics.events.deleted, this.#onFabricDeleted);

            if (this.features.longIdleTimeSupport) {
                this.reactTo(this.events.operatingMode$Changed, this.#onOperatingModeChanged, { offline: true });
                // A DSLS force is runtime-only, so after a restart reconcile operatingMode to the registration-driven
                // mode. Safe to write here (online reactor); initialize() must not, to preserve the mandatory check.
                this.#updateOperatingMode();
            }

            // Idle/active mode machine, externally driven. Created once; (re)started below on every online, paused on
            // goingOffline. The idle→active transition is the Check-In send point.
            // @see {@link MatterSpecification.v151.Core} § 9.15.1
            this.internal.modeState = new IcdModeState({
                activeModeDuration: Millis(this.state.activeModeDuration),
                activeModeThreshold: Millis(this.state.activeModeThreshold),
                onActiveEntered: () => this.events.activeModeEntered.emit(),
                onIdleEntered: () => this.events.idleModeEntered.emit(),
                onMayEnterIdle: () => this.events.mayEnterIdleMode.emit(),
            });
            this.reactTo((this.endpoint.lifecycle as NodeLifecycle).goingOffline, this.#onGoingOffline);

            this.internal.checkInBackOff = new DoublingCheckInBackOff(
                Seconds(this.state.idleModeDuration),
                Seconds(this.state.maximumCheckInBackoff),
            );
            this.internal.checkInSender ??= this.createCheckInSender();
            this.reactTo(this.events.activeModeEntered, this.#sendCheckIns);

            // Must use .on() directly: reactTo wraps each invocation in a NodeActivity whose close re-emits inactive,
            // causing infinite recursion.
            const inactive = this.env.get(NodeActivity).inactive;
            const observer = () => this.internal.modeState?.noteActivity();
            inactive.on(observer);
            this.internal.inactiveObserver = { inactive, observer };
        }

        // DeviceAdvertiser is closed and recreated on each stop/start cycle, so re-register and re-seed every online.
        this.#installIcdAdvertisement();

        // Rebuild the operational view on every online: fabric.icd is runtime-only and starts empty after a full
        // restart. Drop keys for fabrics that no longer exist so a stale key can never be replayed.
        const keyMap = new Map<string, IcdManagementBaseServer.IcdKeyEntry>();
        let prunedKeys = false;
        for (const entry of this.state.icdKeys) {
            if (fabrics.maybeFor(entry.fabricIndex) === undefined) {
                prunedKeys = true;
                continue;
            }
            keyMap.set(this.#keyFor(entry.fabricIndex, entry.checkInNodeId), entry);
        }
        this.internal.icdKeys = keyMap;
        if (prunedKeys) {
            this.#persistKeys();
        }

        // @see {@link MatterSpecification.v151.Core} § 9.16.6.4
        for (const client of this.state.registeredClients) {
            const key = keyMap.get(this.#keyFor(client.fabricIndex, client.checkInNodeId))?.key;
            const fabric = fabrics.maybeFor(client.fabricIndex);
            if (key === undefined || fabric === undefined) {
                continue;
            }
            fabric.icd.setRegistration({
                checkInNodeId: client.checkInNodeId,
                monitoredSubject: client.monitoredSubject,
                key,
                clientType: client.clientType,
            });
        }

        this.internal.modeState?.start();
    }

    #onGoingOffline() {
        this.internal.modeState?.stop();
    }

    /**
     * Builds the Check-In sender. Override in tests to record sends. Resolution uses the peer's cached operational
     * address (tagged from its last session, refreshed by mDNS); the send opens a one-shot unsecured Secure Channel
     * session and transmits unreliably.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.15.1
     */
    protected createCheckInSender(): IcdCheckInSender {
        const peers = this.env.get(PeerSet);
        const sessions = this.env.get(SessionManager);
        const exchanges = this.env.get(ExchangeManager);
        return new IcdCheckInSender({
            crypto: this.env.get(Crypto),
            resolveAddress: async ({ fabricIndex, peerNodeId }) => {
                const peer = peers.addKnownPeer({ address: PeerAddress({ fabricIndex, nodeId: peerNodeId }) });
                return peer.descriptor.operationalAddress;
            },
            sendUnsecured: async (address, messageType, payload) => {
                const channelType = address.type === "tcp" ? ChannelType.TCP : ChannelType.UDP;
                const lookupAddress =
                    channelType === ChannelType.UDP ? (isIPv6(address.ip) ? "::" : "0.0.0.0") : undefined;
                const iface = exchanges.interfaceFor(channelType, lookupAddress);
                if (iface === undefined) {
                    return false;
                }
                const channel = await iface.openChannel(address, {});
                let owned = false;
                try {
                    await using session = sessions.createUnsecuredSession({ channel, isInitiator: true });
                    owned = true;
                    await using exchange = exchanges.initiateExchangeForSession(session, SECURE_CHANNEL_PROTOCOL_ID);
                    await exchange.send(messageType, payload, {
                        requiresAck: false,
                        disableMrpLogic: true,
                        suppressPeerLoss: true,
                    });
                    return true;
                } finally {
                    if (!owned) {
                        await channel.close();
                    }
                }
            },
        });
    }

    /**
     * Send a Check-In to every Permanent registration not currently covered by an active matching subscription, gated
     * by the per-client back-off. Runs on each idle→active wake. The ICD counter advances once per send pass.
     *
     * The transmitted counter is the post-increment value: clients track the registration counter as offset 0 and
     * reject offsets <= the last seen, so the first Check-In must carry an offset >= 1.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.15.1, § 9.16.5.3.2
     */
    async #sendCheckIns() {
        const sender = this.internal.checkInSender;
        const backOff = this.internal.checkInBackOff;
        const counter = this.internal.icdCounter;
        // Guard against overlapping passes: the pass awaits per-client sends while mutating back-off state, so a wake
        // that re-fires mid-pass must not start a second concurrent pass over the same state.
        if (sender === undefined || backOff === undefined || counter === undefined || this.internal.sendingCheckIns) {
            return;
        }
        this.internal.sendingCheckIns = true;
        try {
            const sessions = this.env.get(SessionManager);
            const activeModeThreshold = this.state.activeModeThreshold;
            // One counter value shared by every Check-In in this pass across all fabrics (ICDCounter is device-global);
            // advanced once when the first send is due so the available range is not depleted per client.
            let sendCounter: number | undefined;
            for (const fabric of this.env.get(FabricManager).fabrics) {
                const subjects = activeSubscriptionSubjects(sessions, fabric.fabricIndex);
                for (const reg of fabric.icd.registrations) {
                    if (reg.clientType !== IcdManagement.ClientType.Permanent) {
                        continue;
                    }
                    const key = this.#keyFor(fabric.fabricIndex, reg.checkInNodeId);
                    if (isMonitoredSubjectCovered(reg.monitoredSubject, subjects)) {
                        backOff.recordAnswered(key);
                        continue;
                    }
                    if (!backOff.shouldSend(key)) {
                        continue;
                    }
                    backOff.recordSent(key);
                    if (sendCounter === undefined) {
                        sendCounter = counter.increment();
                    }
                    await sender.send({
                        fabricIndex: fabric.fabricIndex,
                        peerNodeId: reg.checkInNodeId,
                        key: reg.key,
                        counter: sendCounter,
                        activeModeThreshold,
                    });
                }
            }
        } finally {
            this.internal.sendingCheckIns = false;
        }
    }

    override async [Symbol.asyncDispose]() {
        const { inactive, observer } = this.internal.inactiveObserver ?? {};
        if (inactive && observer) {
            inactive.off(observer);
        }
        this.internal.modeState?.[Symbol.dispose]();
        await super[Symbol.asyncDispose]?.();
    }

    /**
     * Effective ICD operating mode: LIT when LITS is enabled and at least one client is registered, otherwise SIT.
     * DSLS devices may override with a forced mode set via {@link setOperatingMode}.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.15.1.5–9.15.1.6
     */
    get #effectiveMode(): IcdManagement.OperatingMode {
        if (!this.features.longIdleTimeSupport) {
            return IcdManagement.OperatingMode.Sit;
        }
        if (this.features.dynamicSitLitSupport && this.internal.forcedOperatingMode !== undefined) {
            return this.internal.forcedOperatingMode;
        }
        return this.state.registeredClients.length > 0
            ? IcdManagement.OperatingMode.Lit
            : IcdManagement.OperatingMode.Sit;
    }

    /**
     * Rebuild and cache the ICD advertisement in {@link IcdManagementBaseServer.Internal.currentIcdAdvertisement}.
     *
     * The cached value is read by the DeviceAdvertiser provider outside the behavior's transaction context, so we push
     * rather than letting the provider pull from state.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.15.1.6
     */
    #refreshIcdAdvertisementCache() {
        const mode = this.#effectiveMode;
        const { idleInterval, activeInterval } = this.env.get(SessionManager).sessionParameters;
        const advertisement: IcdAdvertisement = {
            icd: mode,
            activeInterval,
            activeThreshold: Millis(this.state.activeModeThreshold),
        };
        // @see {@link MatterSpecification.v151.Core} § 9.15.1.6.2 — LIT SHOULD NOT advertise SII
        if (mode === IcdManagement.OperatingMode.Sit) {
            advertisement.idleInterval = idleInterval;
        }
        this.internal.currentIcdAdvertisement = advertisement;
    }

    /**
     * Update the `operatingMode` attribute to the effective mode (LITS only, no-op otherwise).
     *
     * Must be called inside a reactor or command context so the state write is transactional.
     */
    #updateOperatingMode() {
        if (!this.features.longIdleTimeSupport) {
            return;
        }
        const effective = this.#effectiveMode;
        if (this.state.operatingMode !== effective) {
            this.state.operatingMode = effective;
        }
        this.#refreshIcdAdvertisementCache();
    }

    /**
     * Re-advertise all fabrics when the operating mode transitions between SIT and LIT.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.15.1.6
     */
    async #onOperatingModeChanged() {
        const advertiser = this.env.get(DeviceAdvertiser);
        for (const fabric of this.env.get(FabricManager).fabrics) {
            await advertiser.refreshOperationalAdvertisement(fabric);
        }
    }

    async #onFabricDeleted(fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;

        // registeredClients is fabric-scoped and auto-pruned by the framework during the deleting phase; we only
        // need to clean the non-scoped internal key store here. The reactor supplies a transaction for the state write.
        for (const key of [...this.internal.icdKeys.keys()]) {
            if (key.startsWith(`${fabricIndex}:`)) {
                this.internal.icdKeys.delete(key);
                this.internal.checkInBackOff?.forget(key);
            }
        }
        this.#persistKeys();

        // The fabric object still exists at this point; clear its operational registrations.
        fabric.icd.clearRegistrations();

        this.#updateOperatingMode();
    }

    #persistCounter(value: number) {
        this.state.icdCounter = value;
    }

    /**
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.1
     */
    override async registerClient(
        request: IcdManagement.RegisterClientRequest,
    ): Promise<IcdManagement.RegisterClientResponse> {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;

        const clients = this.state.registeredClients;
        const fabricClients = clients.filter(c => c.fabricIndex === fabricIndex);
        const existing = fabricClients.find(c => c.checkInNodeId === request.checkInNodeId);

        if (existing === undefined) {
            // @see {@link MatterSpecification.v151.Core} § 9.16.7.1 step 1
            if (fabricClients.length >= this.state.clientsSupportedPerFabric) {
                throw new StatusResponseError("ICD client slots exhausted for fabric", Status.ResourceExhausted);
            }
        } else {
            // @see {@link MatterSpecification.v151.Core} § 9.16.7.1 steps 2-3
            this.#assertMayModify(fabricIndex, request.checkInNodeId, request.verificationKey);
        }

        const entry: IcdManagement.MonitoringRegistration = {
            checkInNodeId: request.checkInNodeId,
            monitoredSubject: request.monitoredSubject,
            clientType: request.clientType,
            fabricIndex,
        };

        if (existing === undefined) {
            clients.push(entry);
        } else {
            clients[clients.indexOf(existing)] = entry;
        }

        this.internal.icdKeys.set(this.#keyFor(fabricIndex, request.checkInNodeId), {
            fabricIndex,
            checkInNodeId: request.checkInNodeId,
            key: request.key,
        });
        this.#persistKeys();

        fabric.icd.setRegistration({
            checkInNodeId: request.checkInNodeId,
            monitoredSubject: request.monitoredSubject,
            key: request.key,
            clientType: request.clientType,
        });

        this.#updateOperatingMode();

        return { icdCounter: this.internal.icdCounter!.value };
    }

    /**
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.4
     */
    override stayActiveRequest(request: IcdManagement.StayActiveRequest): IcdManagement.StayActiveResponse {
        return { promisedActiveDuration: this.stayActive(Millis(request.stayActiveDuration)) };
    }

    /**
     * Extend the device's active window by the requested duration and return the duration actually promised: the real
     * remaining active duration, never less than the spec floor of `min(30s, requested)`. Override for a custom policy.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.5.1.1
     */
    protected stayActive(requestedDuration: Duration): Duration {
        const floor = Duration.min(STAY_ACTIVE_PROMISE_FLOOR, requestedDuration);
        const modeState = this.internal.modeState;
        if (modeState === undefined) {
            return floor;
        }
        return Duration.max(modeState.requestActive(requestedDuration), floor);
    }

    /**
     * Wake the device into Active mode for a full active window (the idle→active transition; on a CIP device this is
     * where a CIP ICD sends Check-Ins). No-op before the node is online.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.15.1
     */
    requestActiveMode() {
        this.internal.modeState?.requestActive(Millis(this.state.activeModeDuration));
    }

    /**
     * Simulate the device-physical User Active Mode Trigger (button press, power cycle, etc.): wakes the device into
     * Active mode. UAT exposes no Matter command — this is a device-side action.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.16.6.7
     */
    triggerUserActiveMode() {
        this.internal.checkInBackOff?.resetAll();
        this.requestActiveMode();
    }

    /**
     * Put the device into Idle mode (e.g. when the application/test decides to "sleep"). Forces idle unconditionally.
     * No-op before the node is online.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.15.1
     */
    enterIdleMode() {
        this.internal.modeState?.enterIdle();
    }

    /**
     * Set the ICD operating mode at runtime.
     *
     * Requires the Long Idle Time feature. Without Dynamic SIT/LIT Support the mode is registration-driven and the
     * requested mode must match the current registration state; with DSLS the mode may be forced either way (e.g. a
     * mains-powered device dropping to battery).
     *
     * @see {@link MatterSpecification.v151.Core} § 9.15.1.6.4
     */
    setOperatingMode(mode: IcdManagement.OperatingMode) {
        if (!this.features.longIdleTimeSupport) {
            throw new ImplementationError("setOperatingMode requires the LongIdleTimeSupport feature");
        }
        if (!this.features.dynamicSitLitSupport) {
            const registrationDriven =
                this.state.registeredClients.length > 0
                    ? IcdManagement.OperatingMode.Lit
                    : IcdManagement.OperatingMode.Sit;
            if (mode !== registrationDriven) {
                throw new ImplementationError(
                    "Without DynamicSitLitSupport the operating mode follows registration state and cannot be forced",
                );
            }
        } else {
            this.internal.forcedOperatingMode = mode;
        }
        this.#updateOperatingMode();
    }

    /**
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.3
     */
    override async unregisterClient(request: IcdManagement.UnregisterClientRequest): Promise<void> {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;

        const existing = this.state.registeredClients.find(
            c => c.fabricIndex === fabricIndex && c.checkInNodeId === request.checkInNodeId,
        );
        if (existing === undefined) {
            throw new StatusResponseError("No such ICD client registration", Status.NotFound);
        }

        // @see {@link MatterSpecification.v151.Core} § 9.16.7.3 step 2
        this.#assertMayModify(fabricIndex, request.checkInNodeId, request.verificationKey);

        this.state.registeredClients = this.state.registeredClients.filter(
            c => !(c.fabricIndex === fabricIndex && c.checkInNodeId === request.checkInNodeId),
        );
        const key = this.#keyFor(fabricIndex, request.checkInNodeId);
        this.internal.icdKeys.delete(key);
        this.#persistKeys();
        fabric.icd.deleteRegistration(request.checkInNodeId);
        this.internal.checkInBackOff?.forget(key);

        this.#updateOperatingMode();
    }

    /**
     * Returns true when the invoking session has Administer privilege on this cluster.
     *
     * Administer skips the verificationKey check on register update and unregister; Manage must provide it.
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.1 step 2
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.3 step 2
     */
    #isAdministrator(): boolean {
        const context = this.context;
        if (!hasRemoteActor(context)) {
            return false;
        }
        const location: AccessControl.Location = {
            path: DataModelPath.none,
            endpoint: this.endpoint.number,
            cluster: this.cluster.id,
        };
        return context.authorityAt(AccessLevel.Administer, location) === AccessControl.Authority.Granted;
    }

    /**
     * Enforces the verificationKey rule shared by register-update and unregister: an Administrator may modify any
     * entry, while a Manage-privileged caller must supply a verificationKey matching the stored ICDToken.
     */
    #assertMayModify(fabricIndex: FabricIndex, checkInNodeId: NodeId, verificationKey?: Bytes) {
        if (this.#isAdministrator()) {
            return;
        }
        const stored = this.internal.icdKeys.get(this.#keyFor(fabricIndex, checkInNodeId));
        if (verificationKey === undefined || stored === undefined || !Bytes.areEqual(verificationKey, stored.key)) {
            throw new StatusResponseError("VerificationKey mismatch", Status.Failure);
        }
    }

    #keyFor(fabricIndex: FabricIndex, checkInNodeId: NodeId): string {
        return `${fabricIndex}:${checkInNodeId}`;
    }

    #persistKeys() {
        this.state.icdKeys = [...this.internal.icdKeys.values()];
    }
}

export namespace IcdManagementBaseServer {
    /** Persisted key entry. */
    export class IcdKeyEntry {
        @field(fabricIdx)
        fabricIndex!: FabricIndex;

        @field(nodeId)
        checkInNodeId!: NodeId;

        @field(octstr)
        key!: Bytes;
    }

    export class State extends IcdManagementLogicBase.State {
        /** Persisted ICDToken keys, mirroring the per-registration key not stored in the RegisteredClients attribute. */
        @field(listOf(IcdKeyEntry), nonvolatile)
        icdKeys: IcdKeyEntry[] = [];
    }

    export class Internal {
        icdCounter?: IcdCounter;
        icdKeys: Map<string, IcdKeyEntry> = new Map();
        /** Cached advertisement data read by the DeviceAdvertiser provider outside a behavior transaction. */
        currentIcdAdvertisement?: IcdAdvertisement;
        /** Runtime-only; not persisted, so a restart reverts to the registration-driven mode. {@link IcdManagementBaseServer.setOperatingMode} */
        forcedOperatingMode?: IcdManagement.OperatingMode;
        /** Idle/active mode machine; created once on first online, (re)started on each subsequent online. */
        modeState?: IcdModeState;
        /** Direct NodeActivity.inactive subscription, stored for cleanup (reactTo would recurse). */
        inactiveObserver?: { inactive: NodeActivity["inactive"]; observer: () => void };
        /** Per-client Check-In back-off; runtime-only, created on first online. */
        checkInBackOff?: IcdCheckInBackOff;
        /** Check-In sender; built via createCheckInSender(), overridable in tests. */
        checkInSender?: IcdCheckInSender;
        /** True while a Check-In send pass is in flight, to prevent overlapping passes on rapid re-wakes. */
        sendingCheckIns?: boolean;
    }

    export class Events extends IcdManagementLogicBase.Events {
        /** Idle→Active transition (also fires on initial power-up); hook hardware power-up / Check-In send. */
        activeModeEntered = Observable();
        /** Active→Idle transition; hook hardware power-down. */
        idleModeEntered = Observable();
        /** Active window elapsed and quiet: the app may now put the device to sleep via enterIdleMode. */
        mayEnterIdleMode = Observable();
    }

    export declare const ExtensionInterface: {
        stayActive(requestedDuration: Duration): Duration;
        requestActiveMode(): void;
        enterIdleMode(): void;
        triggerUserActiveMode(): void;
    };
}

/**
 * The default {@link IcdManagementBehavior} server implementation, with the Check-In Protocol Support feature.
 *
 * The active feature set is reset to CIP-only here even though the logic base includes LITS. This matches the
 * OnOff/SmokeCoAlarm pattern: the base composes all features for type safety, the exported class narrows to the
 * deployed set. To also enable LITS use
 * `IcdManagementServer.with(IcdManagement.Feature.CheckInProtocolSupport, IcdManagement.Feature.LongIdleTimeSupport)`.
 */
export class IcdManagementServer extends IcdManagementBaseServer.with(IcdManagement.Feature.CheckInProtocolSupport) {}
