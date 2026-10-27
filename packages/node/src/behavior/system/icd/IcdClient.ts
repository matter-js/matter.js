/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { IcdManagementClient } from "#behaviors/icd-management";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Node } from "#node/Node.js";
import {
    Abort,
    AbortedError,
    AsyncObservable,
    AsyncObservableValue,
    Bytes,
    ClosedError,
    createPromise,
    Crypto,
    Duration,
    ImplementationError,
    Logger,
    Millis,
    Observable,
    Observer,
    ObserverErrorHandler,
    Seconds,
    Time,
    Timestamp,
} from "@matter/general";
import { bool, field, nonvolatile, octstr, subjectId, systimeMs, uint32, uint8 } from "@matter/model";
import { FabricManager, IcdPeerSchedule, PeerAddress, type FabricIcd } from "@matter/protocol";
import { NodeId, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { holdUntilIcdPeerAwake } from "./holdUntilIcdPeerAwake.js";
import { IcdMultiAdminError } from "./IcdMultiAdminError.js";

const logger = Logger.get("IcdClient");

/**
 * Controller-side client for ICD (Intermittently Connected Device) Check-In support.
 *
 * Auto-installed on a {@link ClientNode} whose peer exposes the IcdManagement cluster. Registration — automatic for a
 * LIT-operating peer, or explicit via {@link register} — requires an established subscription so the decision runs on a
 * fresh operating mode rather than a stale cached one. The behavior tracks peer wakefulness to hold interactions for a
 * sleeping ICD.
 *
 * @see {@link MatterSpecification.v161.Core} § 9.15.2, § 9.16
 */
export class IcdClient extends Behavior {
    declare internal: IcdClient.Internal;
    declare readonly state: IcdClient.State;
    declare readonly events: IcdClient.Events;

    static override readonly early = true;
    static override readonly id = "icd";

    get isRegistered() {
        return this.state.key !== undefined;
    }

    /** Whether the peer is LIT-capable (LongIdleTimeSupport feature and specification version >= 1.4.0). */
    get peerSupportsLit() {
        return IcdClient.litSupported(this.endpoint);
    }

    /**
     * Whether the peer is currently awake. A non-LIT or not-yet-fed peer has nothing to await and reads true.
     */
    get awake() {
        return this.#wakefulness()?.awake.value ?? true;
    }

    /**
     * Wall-clock deadline by which the next Check-In from a registered LIT peer is expected, or undefined when none is
     * scheduled: no fed peer, not registered, not LIT, or a subscription is held (the peer then reports instead).
     */
    get nextExpectedCheckin(): Timestamp | undefined {
        const due = this.#wakefulness()?.nextCheckInDue;
        // The wakefulness runs on the monotonic clock; expose the deadline on the wall clock like other timestamps
        return due === undefined ? undefined : Timestamp(due - Time.nowUs + Time.nowMs);
    }

    get #peerIsLongIdleTimeOperating() {
        return (
            this.peerSupportsLit &&
            this.endpoint.maybeStateOf(IcdManagementClient)?.operatingMode === IcdManagement.OperatingMode.Lit
        );
    }

    override initialize() {
        // Abort in-flight work while the datasource is still open; it closes before asyncDispose runs
        this.reactTo(this.endpoint.lifecycle.destroying, this.#onDestroying);

        // Announced after commit, so a listener sees the stored registration and cannot undo it
        this.reactTo(this.events.key$Changed, this.#onKeyChanged, { offline: true });

        if (this.endpoint instanceof Node) {
            this.reactTo(this.endpoint.lifecycle.decommissioned, this.#onDecommissioned, { offline: true, lock: true });
        }

        // Restore off the OWNER online, not the peer: only then is the controller fabric loaded, and an ICD peer is
        // offline precisely when it sends Check-Ins.
        const owner = this.endpoint.owner;
        if (owner instanceof Node) {
            this.reactTo(owner.lifecycle.online, this.#restoreReceivePath);
            if (owner.lifecycle.isOnline) {
                this.#restoreReceivePath();
            }
        }

        // A DSLS peer can flip SIT⇄LIT at runtime; track it so a fed peer's requiresAwait stays correct.
        if (this.endpoint.behaviors.has(IcdManagementClient)) {
            this.maybeReactTo(
                this.endpoint.eventsOf(IcdManagementClient).operatingMode$Changed,
                this.#onOperatingModeChanged,
            );
        }

        // The subscription-established edge lands after the bootstrap read, so operatingMode is fresh when we decide.
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

    #onDestroying() {
        this.internal.lifetime.abort();
    }

    #onKeyChanged(key: Bytes | undefined, oldKey: Bytes | undefined) {
        if (oldKey === undefined) {
            this.events.registered.emit();
        } else if (key === undefined) {
            this.events.unregistered.emit();
        } else {
            this.events.keyRefreshed.emit();
        }
    }

    /**
     * The peer coming online is live proof it is awake, so note it as active in its wakefulness; a no-op for a non-LIT
     * or unfed peer.
     */
    #onPeerOnline() {
        this.#wakefulness()?.noteActive();
    }

    #onSubscriptionStatusChanged(isActive: boolean) {
        if (isActive) {
            this.#ensureLitRegistration();
        }
    }

    #onOperatingModeChanged() {
        const wakefulness = this.#wakefulness();
        if (wakefulness !== undefined) {
            const litOperating = this.#peerIsLongIdleTimeOperating;
            wakefulness.requiresAwait = litOperating;
            // A live flip into LIT is proof the peer is awake now.
            // Gate on online so a stale rehydration of operatingMode cannot arm the window from non-live data.
            if (litOperating && this.endpoint instanceof Node && this.endpoint.lifecycle.isOnline) {
                wakefulness.noteActive();
            }
        }
        this.#ensureLitRegistration();
    }

    /** Whether neither a registration is stored nor an operation runs. */
    get #idle() {
        return this.internal.operation === undefined && this.state.key === undefined;
    }

    /** Whether an operation of `kind` may start now: none runs, or `kind` may take over the one that does. */
    #mayStart(kind: IcdClient.Operation["kind"]) {
        const current = this.internal.operation;
        return current === undefined || TAKES_OVER[kind].includes(current.kind);
    }

    /**
     * Register as a Check-In client for a LIT peer. Mandatory for LIT peers, so it bypasses the multi-admin check.
     * Best-effort: a failure is logged and retried by the next trigger.
     */
    #ensureLitRegistration() {
        // Gate on capability, not the cached mode: a stale cached SIT must not skip the fresh read that would reveal LIT.
        // Require an established subscription so operatingMode is not stale (register() needs one anyway).
        if (
            this.internal.lifetime.aborted ||
            !this.peerSupportsLit ||
            !this.agent.get(NetworkClient).subscriptionActive ||
            !this.#mayStart("registering") ||
            this.endpoint.stateOf(IcdClient).key !== undefined
        ) {
            return;
        }
        if (this.internal.autoRegister !== undefined) {
            // Remember a trigger during an in-flight attempt so #autoRegister re-evaluates on a fresh snapshot.
            this.internal.autoRegisterPending = true;
            return;
        }
        const autoRegister = this.#autoRegister();
        this.internal.autoRegister = autoRegister;
        this.internal.operations.add(autoRegister);
    }

    async #autoRegister() {
        const { lifetime } = this.internal;
        try {
            // Defer so an in-flight transaction settles before we open the registration transaction.
            await Promise.resolve();
            await this.#act(
                "icd-auto-register",
                async icd => {
                    // Re-check inside the transaction: state, reachability, or operating mode may have changed since the
                    // trigger fired. An offline peer is a no-op (the next online edge retries), not an error.
                    if (
                        !icd.#idle ||
                        !(icd.endpoint instanceof Node) ||
                        !icd.endpoint.lifecycle.isOnline ||
                        !IcdClient.litSupported(icd.endpoint)
                    ) {
                        return;
                    }
                    // Fresh read: only register on LIT confirmed by the peer itself. A DSLS peer forced to SIT while it
                    // already serves other fabrics' Check-In clients behaves as a shared ICD, so register there too.
                    const { operatingMode } = await icd.endpoint.getStateOf(IcdManagementClient, ["operatingMode"], {
                        abort: lifetime.signal,
                    });
                    if (
                        operatingMode !== IcdManagement.OperatingMode.Lit &&
                        !(await icd.#dslsPeerHasRegistrations(lifetime))
                    ) {
                        return;
                    }
                    if (!icd.#idle) {
                        return;
                    }
                    await icd.register({ allowMultiAdmin: true });
                },
                lifetime,
            );
        } catch (error) {
            if (IcdClient.#isAbandoned(error)) {
                logger.debug(`ICD auto-registration for LIT peer ${this.#peerAddress} abandoned`);
            } else {
                logger.warn(`ICD auto-registration for LIT peer ${this.#peerAddress} failed`, error);
            }
        } finally {
            const { autoRegister } = this.internal;
            if (autoRegister !== undefined) {
                this.internal.operations.delete(autoRegister);
            }
            this.internal.autoRegister = undefined;
        }
        // A trigger arrived mid-run on a now-possibly-stale snapshot; re-run once.  The transaction has exited, so this
        // reads committed state only.
        if (this.internal.autoRegisterPending) {
            this.internal.autoRegisterPending = undefined;
            this.#ensureLitRegistration();
        }
    }

    /**
     * True when the peer supports DSLS and already has at least one registered Check-In client. Read non-fabric-scoped
     * because a co-admin's registration lives on its own fabric.
     */
    async #dslsPeerHasRegistrations(abort: Abort) {
        if (this.endpoint.maybeFeaturesOf(IcdManagementClient)?.dynamicSitLitSupport !== true) {
            return false;
        }
        const { registeredClients } = await this.endpoint.getStateOf(IcdManagementClient, ["registeredClients"], {
            fabricFilter: false,
            abort: abort.signal,
        });
        return (registeredClients?.length ?? 0) > 0;
    }

    /** The {@link FabricIcd} that last received the peer, with the peer's node ID; the entry exists while fed. */
    #fed() {
        const peer = this.internal.peer;
        if (peer === undefined) {
            return undefined;
        }
        const icd = this.env.get(FabricManager).maybeFor(peer.fabricIndex)?.icd;
        return icd === undefined ? undefined : { icd, nodeId: peer.nodeId };
    }

    /** The {@link IcdPeerWakefulness} for the currently fed peer, or undefined when no peer is fed. */
    #wakefulness() {
        const fed = this.#fed();
        return fed?.icd.wakefulnessFor(fed.nodeId);
    }

    /**
     * Start an operation of `kind` that runs `body`, abandoning the operation in flight if `kind` may take it over.
     * The operation is abandoned with the behavior; once it ends, no operation is in flight unless another one took
     * over.
     *
     * @throws {ImplementationError} if an operation runs that `kind` may not take over
     */
    #start(
        kind: IcdClient.Operation["kind"],
        body: (operation: IcdClient.Operation) => Promise<void>,
        options?: IcdClient.RegisterOptions,
    ): IcdClient.Operation {
        const current = this.internal.operation;
        if (current !== undefined) {
            if (!this.#mayStart(kind)) {
                throw new ImplementationError(`ICD client cannot start ${kind} while ${current.kind} is in progress.`);
            }
            current.abort.abort();
        }
        const abort = Abort.subtask(this.internal.lifetime);
        const started = createPromise<void>();
        const operation: IcdClient.Operation = { kind, abort, done: started.promise, options };
        this.internal.operation = operation;
        this.internal.operations.add(operation.done);
        this.#runBody(operation, body).then(started.resolver, started.rejecter);
        return operation;
    }

    /** Whether `operation` is still the one in flight and not abandoned. */
    #owns(operation: IcdClient.Operation) {
        return this.internal.operation === operation && !operation.abort.aborted;
    }

    async #runBody(operation: IcdClient.Operation, body: (operation: IcdClient.Operation) => Promise<void>) {
        try {
            await body(operation);
        } finally {
            this.internal.operations.delete(operation.done);
            operation.abort.close();
            if (this.internal.operation === operation) {
                this.internal.operation = undefined;
            }
        }
    }

    /**
     * The only way an operation changes stored state and the receive path after an await: only while `operation` still
     * owns the registration, under the ICD state lock, `write` stores and updates the receive path, then commits.
     * Returns whether the write was committed.  When the write or the commit fails, the receive path follows the
     * committed registration again.
     */
    async #commitIfOwned(operation: IcdClient.Operation, write: () => void) {
        if (!this.#owns(operation)) {
            return false;
        }
        await this.context.transaction.lock(this);
        if (!this.#owns(operation)) {
            return false;
        }
        try {
            write();
            await this.context.transaction.commit();
        } catch (error) {
            this.#followCommittedRegistration();
            throw error;
        }
        return true;
    }

    /**
     * Feed or drop the receive path according to the committed registration.  A Check-In accepted meanwhile under the
     * same key and baseline keeps its offset, so it cannot be accepted again.
     */
    #followCommittedRegistration() {
        const { key, pendingKey, counterStart, lastOffset } = this.endpoint.stateOf(IcdClient);
        if (key === undefined || lastOffset === undefined) {
            this.#dropReceivePath();
            return;
        }
        const { fabric, peerNodeId } = this.#fabricContext();
        const entry = fabric.icd.peerFor(peerNodeId);
        const sameBaseline =
            entry !== undefined && Bytes.areEqual(entry.key, key) && entry.counterStart === counterStart;
        this.#feedFabricIcd(
            fabric,
            peerNodeId,
            {
                key,
                pendingKey,
                counterStart,
                lastOffset: sameBaseline ? Math.max(entry.lastOffset, lastOffset) : lastOffset,
            },
            false,
        );
    }

    /**
     * Run `actor` in a transaction this behavior owns, so the registration facts it stores never depend on the
     * caller's transaction.  `abort` abandons the peer commands the actor invokes.
     */
    async #act<R>(purpose: string, actor: (icd: IcdClient) => Promise<R>, abort: Abort): Promise<R> {
        return await this.endpoint.act(purpose, agent => actor(agent.get(IcdClient)), { abort: abort.signal });
    }

    /**
     * Re-arm the Check-In receive path from persisted registration state. The {@link FabricIcd} peer entry is
     * runtime-only, so it is rebuilt on every controller online.
     */
    #restoreReceivePath() {
        if (this.state.key === undefined) {
            return;
        }
        const { fabric, peerNodeId } = this.#fabricContext();
        // Peer reachability is unknown after a controller restart, so do not note it as active.
        this.#feedFabricIcd(fabric, peerNodeId, this.state, false);
    }

    /**
     * Decommission already removed our fabric from the peer, so no peer {@link IcdManagement.unregisterClient} is
     * possible or needed — only local cleanup.
     */
    #onDecommissioned() {
        this.internal.operation?.abort.abort();
        if (this.state.key !== undefined) {
            this.#persistRegistration(undefined);
            this.#dropReceivePath();
        }
        // The peer left the fabric, also when it was unregistered before; a later peer with its node ID starts afresh
        const fed = this.#fed();
        if (fed !== undefined) {
            fed.icd.removePeer(fed.nodeId);
            this.internal.peer = undefined;
        }
    }

    /**
     * The only writer of the stored registration facts.  The caller holds the ICD state lock in a transaction this
     * behavior owns.
     */
    #persistRegistration(registration: Registration | undefined) {
        this.state.key = registration?.key;
        this.state.pendingKey = registration?.pendingKey;
        this.state.counterStart = registration?.counterStart;
        this.state.lastOffset = registration?.lastOffset;
        this.state.monitoredSubject = registration?.monitoredSubject;
        this.state.clientType = registration?.clientType;
        this.state.registered = registration !== undefined;
        if (registration === undefined) {
            this.state.lastCheckInReceivedAt = undefined;
            this.state.available = false;
        }
    }

    /** Stop routing the peer's Check-Ins here.  Keeps {@link Internal.peer} for decommission. */
    #dropReceivePath() {
        this.#unsubscribeAvailable();
        this.#unsubscribeCheckInMissed();
        const fed = this.#fed();
        fed?.icd.deletePeer(fed.nodeId);
    }

    #unsubscribeAvailable() {
        const { availableSource, availableListener } = this.internal;
        if (availableSource !== undefined && availableListener !== undefined) {
            availableSource.off(availableListener);
        }
        this.internal.availableSource = undefined;
    }

    #unsubscribeCheckInMissed() {
        const { checkInMissedSource, checkInMissedListener } = this.internal;
        if (checkInMissedSource !== undefined && checkInMissedListener !== undefined) {
            checkInMissedSource.off(checkInMissedListener);
        }
        this.internal.checkInMissedSource = undefined;
    }

    /**
     * Register this controller as a Check-In client on the peer.
     *
     * Installs a shared {@link IcdManagement.RegisterClientRequest.key} on the peer so it can send us encrypted
     * Check-In messages, records the rolling-counter baseline in {@link IcdClient.State}, and arms the controller-side
     * Check-In receive path on the fabric.  Runs and stores in a transaction of its own, so do not call it from a
     * transaction that holds the ICD client state.  A call while a registration with the same options (defaults
     * applied) is in flight joins it.  {@link Events.registered} follows after the registration is stored.
     *
     * @throws {ImplementationError} if a registration exists or is being torn down, one with other options is in
     *   flight, the peer is not online (registration reads from and writes to the peer), or its IcdManagement cluster
     *   lacks the Check-In Protocol feature.
     * @throws {IcdMultiAdminError} if the peer has more than one administrator from other vendors and
     *   `allowMultiAdmin` is not set — see {@link IcdMultiAdminError.assertSingleAdmin}.
     * @throws {AbortedError} if unregister(), forget(), decommission or shutdown abandons the registration.
     * @see {@link MatterSpecification.v161.Core} § 9.16.7.1
     */
    async register(options: IcdClient.RegisterOptions = {}) {
        const current = this.internal.operation;
        if (current?.kind === "registering") {
            if (!this.#sameRegisterOptions(current.options ?? {}, options)) {
                throw new ImplementationError("An ICD client registration with other options is in progress.");
            }
            return await current.done;
        }
        if (!this.#mayStart("registering")) {
            throw new ImplementationError(`ICD client cannot register while ${current?.kind} is in progress.`);
        }
        if (this.state.key !== undefined) {
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

        const operation = this.#start(
            "registering",
            operation => this.#act("icd-register", icd => icd.#registerOnPeer(operation, options), operation.abort),
            options,
        );
        await operation.done;
    }

    /** The options with their defaults applied, so equal requests compare equal however they are spelled. */
    #resolveOptions(options: IcdClient.RegisterOptions) {
        const {
            monitoredSubject = SubjectId(this.#fabricContext().ownNodeId),
            clientType = IcdManagement.ClientType.Permanent,
            allowMultiAdmin = false,
            ignoredVendors = IcdMultiAdminError.TRUSTED_ECOSYSTEM_VENDORS,
        } = options;
        return { monitoredSubject, clientType, allowMultiAdmin, ignoredVendors };
    }

    #sameRegisterOptions(a: IcdClient.RegisterOptions, b: IcdClient.RegisterOptions) {
        const left = this.#resolveOptions(a);
        const right = this.#resolveOptions(b);
        return (
            left.monitoredSubject === right.monitoredSubject &&
            left.clientType === right.clientType &&
            left.allowMultiAdmin === right.allowMultiAdmin &&
            left.ignoredVendors.length === right.ignoredVendors.length &&
            left.ignoredVendors.every(vendor => right.ignoredVendors.includes(vendor))
        );
    }

    async #registerOnPeer(operation: IcdClient.Operation, options: IcdClient.RegisterOptions) {
        const { fabric, ownNodeId, peerNodeId } = this.#fabricContext();
        const { monitoredSubject, clientType, allowMultiAdmin, ignoredVendors } = this.#resolveOptions(options);

        const fabrics = await this.#readPeerFabrics(operation.abort);
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

        const committed = await this.#commitIfOwned(operation, () => {
            const registration = { key, counterStart: icdCounter, lastOffset: 0, monitoredSubject, clientType };
            this.#persistRegistration(registration);
            // The peer just answered registration I/O, so it is reachable: seed the availability window.
            this.#feedFabricIcd(fabric, peerNodeId, registration, true);
        });
        if (!committed) {
            throw new AbortedError("ICD registration was abandoned");
        }
    }

    /**
     * Remove this controller's Check-In registration from the peer and tear down the local receive path.
     *
     * Abandons an in-flight key refresh or registration; the peer may already hold the registration, so it is removed
     * there too.  The local registration is cleared once the peer is awake, just before UnregisterClient goes out, so
     * a failed or abandoned exchange leaves at most a stale entry on the peer, which a later registration replaces.  A
     * no-op when not registered; while an unregister() runs, joins it.  Runs in a transaction of its own, so do not
     * call it from a transaction that holds the ICD client state.  {@link Events.unregistered} follows after the
     * local clear is stored.
     *
     * @throws {ImplementationError} while {@link forget} runs, which leaves the peer's registration in place.
     * @throws {AbortedError} if forget(), decommission or shutdown abandons it before the local registration is
     *   cleared; the registration then stays.
     * @throws {IcdPeerAsleepError} if a sleeping LIT peer does not wake in time; the registration stays.
     * @throws The peer's error if UnregisterClient fails after the local registration was cleared.
     * @see {@link MatterSpecification.v161.Core} § 9.16.7.3
     */
    async unregister(): Promise<void> {
        const current = this.internal.operation;
        if (current?.kind === "unregistering") {
            return await current.done;
        }
        if (this.#idle) {
            return;
        }

        const operation = this.#start("unregistering", operation =>
            this.#act("icd-unregister", icd => icd.#unregisterOnPeer(operation), operation.abort),
        );
        await operation.done;
    }

    async #unregisterOnPeer(operation: IcdClient.Operation) {
        const { ownNodeId } = this.#fabricContext();
        await this.#awaitPeerAwake(operation.abort);

        const cleared = await this.#clearLocal(operation);
        if (cleared === undefined) {
            throw new AbortedError("ICD unregistration was abandoned");
        }

        await this.#peerIcd().unregisterClient({ checkInNodeId: ownNodeId, verificationKey: cleared.key });
    }

    /**
     * Locally drop this controller's Check-In registration without contacting the peer.
     *
     * The escape hatch, always allowed: it abandons an in-flight registration, key refresh or an {@link unregister}
     * that has not cleared the local registration yet.  Dropping the fed peer suspends its wakefulness, so
     * interactions with a sleeping LIT peer no longer hold — a later subscribe can re-establish and re-register.  The
     * peer keeps a stale registration for us until it prunes it or a fresh {@link register} replaces it.  A no-op when
     * nothing is registered or being registered.  Runs in a transaction of its own, so do not call it from a
     * transaction that holds the ICD client state.
     *
     * @throws {AbortedError} if decommission or shutdown abandons it first; nothing was forgotten then.
     * @see {@link MatterSpecification.v161.Core} § 9.16.7.3
     */
    async forget(): Promise<void> {
        const current = this.internal.operation;
        if (current?.kind === "forgetting") {
            return await current.done;
        }
        // Nothing stored and no registration that may store it; after an unregister()'s local clear its UnregisterClient
        // may still be on the way
        if (this.state.key === undefined && current?.kind !== "registering") {
            return;
        }

        const operation = this.#start("forgetting", operation =>
            this.#act(
                "icd-forget",
                async icd => {
                    if ((await icd.#clearLocal(operation)) === undefined) {
                        throw new AbortedError("ICD forget was abandoned");
                    }
                    logger.info(
                        "ICD registration forgotten locally (no peer UnregisterClient); peer retains a stale registration",
                    );
                },
                operation.abort,
            ),
        );
        await operation.done;
    }

    /**
     * Clear the stored registration and the receive path.  Returns the cleared key, read under the lock, or undefined
     * when `operation` no longer owns the registration.
     */
    async #clearLocal(operation: IcdClient.Operation) {
        let key: Bytes | undefined;
        const committed = await this.#commitIfOwned(operation, () => {
            key = this.state.key;
            this.#persistRegistration(undefined);
            this.#dropReceivePath();
        });
        return committed ? { key } : undefined;
    }

    /**
     * Wait until a sleeping LIT peer wakes, as interactions with it do, so the local registration is cleared only when
     * the UnregisterClient can go out.
     */
    async #awaitPeerAwake(abort: Abort) {
        await holdUntilIcdPeerAwake(this.#wakefulness(), this.#fabricContext().peerAddress, { abort: abort.signal });
    }

    /**
     * Ask the peer to remain in Active mode for at least `duration` and return the duration it actually promised.
     *
     * @see {@link MatterSpecification.v161.Core} § 9.16.7.4
     */
    async stayActive(duration: Duration): Promise<Duration> {
        const { promisedActiveDuration } = await this.#peerIcd().stayActiveRequest({
            stayActiveDuration: Millis.of(duration),
        });
        const promised = Millis(promisedActiveDuration);
        this.#wakefulness()?.noteStayActive(promised);
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
        return { fabric, ownNodeId, peerNodeId, peerAddress };
    }

    async #readPeerFabrics(abort: Abort) {
        const { fabrics } = await this.endpoint.getStateOf(OperationalCredentialsClient, ["fabrics"], {
            fabricFilter: false,
            abort: abort.signal,
        });
        return fabrics ?? [];
    }

    #peerIcd() {
        return this.agent.get(IcdManagementClient);
    }

    /**
     * Peer address for log context; undefined before commissioning. Reads the sync state view, so safe off-transaction.
     * Interned via {@link PeerAddress} so a rehydrated plain-struct address renders `@fabric:node` rather than
     * `[object Object]`.
     */
    get #peerAddress() {
        return PeerAddress(this.endpoint.maybeStateOf(CommissioningClient)?.peerAddress);
    }

    #feedFabricIcd(
        fabric: ReturnType<FabricManager["for"]>,
        peerNodeId: NodeId,
        registration: Pick<Registration, "key" | "pendingKey" | "counterStart" | "lastOffset">,
        seed: boolean,
    ) {
        const { key, pendingKey, counterStart, lastOffset } = registration;
        if (key === undefined || counterStart === undefined || lastOffset === undefined) {
            throw new ImplementationError("ICD peer cannot be fed to the fabric before registration state is set.");
        }
        if (this.internal.checkInHandler === undefined) {
            this.internal.checkInHandler = this.callback(this.#onCheckIn, { offline: true, lock: true });
        }
        fabric.icd.addPeer({ peerNodeId, key, pendingKey, counterStart, lastOffset }, this.internal.checkInHandler);
        this.internal.peer = PeerAddress({ fabricIndex: fabric.fabricIndex, nodeId: peerNodeId });

        const wakefulness = fabric.icd.wakefulnessFor(peerNodeId);
        if (wakefulness === undefined) {
            return;
        }

        const icdState = this.endpoint.maybeStateOf(IcdManagementClient);
        const defaults = IcdPeerSchedule.DEFAULT_TIMINGS;
        wakefulness.setTimings({
            activeModeThreshold:
                icdState?.activeModeThreshold === undefined
                    ? defaults.activeModeThreshold
                    : Millis(icdState.activeModeThreshold),
            activeModeDuration:
                icdState?.activeModeDuration === undefined
                    ? defaults.activeModeDuration
                    : Millis(icdState.activeModeDuration),
            idleModeDuration:
                icdState?.idleModeDuration === undefined
                    ? defaults.idleModeDuration
                    : Seconds(icdState.idleModeDuration),
        });
        wakefulness.requiresAwait = this.#peerIsLongIdleTimeOperating;

        if (seed) {
            wakefulness.noteActive();
        }

        this.#unsubscribeAvailable();
        const listener = (this.internal.availableListener ??= this.callback(this.#onAvailableChanged, {
            offline: true,
            lock: true,
        }));
        wakefulness.available.on(listener);
        this.internal.availableSource = wakefulness.available;
        this.state.available = wakefulness.available.value === true;

        this.#unsubscribeCheckInMissed();
        const checkInMissedListener = (this.internal.checkInMissedListener ??= this.callback(this.#onCheckInMissed, {
            offline: true,
            lock: true,
        }));
        wakefulness.checkInMissed.on(checkInMissedListener);
        this.internal.checkInMissedSource = wakefulness.checkInMissed;
    }

    #onAvailableChanged(available: boolean) {
        this.state.available = available;
    }

    #onCheckInMissed() {
        this.events.checkInMissed.emit();
    }

    #onCheckIn(checkIn: FabricIcd.ReceivedCheckIn) {
        const { counter, activeModeThreshold } = checkIn;
        // A reaction queued before the registration was cleared belongs to a receive path that is gone
        if (this.state.key === undefined) {
            return;
        }
        const fed = this.#fed();
        const entry = fed?.icd.peerFor(fed.nodeId);

        // Persist the advanced offset, and a key this Check-In confirmed, so a restart cannot restore an older baseline
        // and accept this Check-In again; also while a teardown has not cleared the stored key yet
        if (entry !== undefined) {
            this.#persistPeerEntry(entry);
        }
        this.state.lastCheckInReceivedAt = Time.nowMs;

        // The baseline may have moved since the Check-In was decrypted, so FabricIcd answers for the current key
        if (this.#mayStart("refreshing") && fed !== undefined && fed.icd.refreshNeeded(fed.nodeId)) {
            this.#start("refreshing", operation => this.#refreshKey(operation));
        }

        // Last, so a listener that starts an unregister() or forget() takes over the refresh started above
        this.events.checkedIn.emit({ counter, activeModeThreshold });
    }

    /**
     * Store the fed peer's key and counter state from {@link FabricIcd}, which advances it as Check-Ins arrive.  The
     * caller holds the ICD state lock in a transaction this behavior owns.
     */
    #persistPeerEntry(entry: FabricIcd.Peer) {
        const { monitoredSubject, clientType } = this.state;
        this.#persistRegistration({
            key: entry.key,
            pendingKey: entry.pendingKey,
            counterStart: entry.counterStart,
            lastOffset: entry.lastOffset,
            monitoredSubject,
            clientType,
        });
    }

    /** Never rejects: the next Check-In under the old key retries. */
    async #refreshKey(operation: IcdClient.Operation) {
        try {
            await this.#act("icd-key-refresh", icd => icd.#offerKey(operation), operation.abort);
        } catch (error) {
            if (IcdClient.#isAbandoned(error)) {
                logger.debug(`ICD key refresh for peer ${this.#peerAddress} abandoned`);
            } else if (error instanceof ImplementationError) {
                // A corrupt registration fails the same way at every Check-In, so it needs attention
                logger.error(`ICD key refresh for peer ${this.#peerAddress} failed unexpectedly`, error);
            } else {
                logger.warn(`ICD key refresh for peer ${this.#peerAddress} failed; will retry on next check-in`, error);
            }
        }
    }

    /**
     * Re-key the registration in place before the rolling counter offset reaches 2³¹.
     *
     * The new key is stored as pending before the peer sees it, because the peer may take it without the response
     * reaching us, and may keep it even when it answers with an error status.  Until a response or a Check-In under the
     * new key confirms it, Check-Ins decrypt with either key, and a retry offers the same pending key again.
     *
     * @see {@link MatterSpecification.v161.Core} § 4.22.3.4.1, § 4.22.4.2, § 9.16.7.1
     */
    async #offerKey(operation: IcdClient.Operation) {
        const { fabric, ownNodeId, peerNodeId } = this.#fabricContext();
        let request: IcdManagement.RegisterClientRequest | undefined;
        const offered = await this.#commitIfOwned(operation, () => {
            const { monitoredSubject, clientType, key: verificationKey, pendingKey } = this.state;
            if (monitoredSubject === undefined || clientType === undefined || verificationKey === undefined) {
                throw new ImplementationError("ICD key refresh requires an existing registration.");
            }
            const entry = this.#entryOf(peerNodeId);
            // A Check-In under the pending key may have confirmed it while this refresh waited for the lock; that
            // Check-In's reaction stores it
            if (pendingKey !== undefined && entry.pendingKey === undefined && Bytes.areEqual(entry.key, pendingKey)) {
                return;
            }
            const key = pendingKey ?? this.env.get(Crypto).randomBytes(16);
            fabric.icd.setPendingKey(peerNodeId, key);
            this.#persistPeerEntry(entry);
            request = { checkInNodeId: ownNodeId, monitoredSubject, key, clientType, verificationKey };
        });
        if (!offered || request === undefined) {
            return;
        }
        const { key } = request;

        const { icdCounter } = await this.#peerIcd().registerClient(request);

        await this.#commitIfOwned(operation, () => {
            if (!fabric.icd.confirmKey(peerNodeId, key, icdCounter)) {
                logger.warn(`ICD peer ${this.#peerAddress} confirmed a key refresh for a key it no longer holds`);
            }
            this.#persistPeerEntry(this.#entryOf(peerNodeId));
        });
    }

    #entryOf(peerNodeId: NodeId) {
        const entry = this.#fed()?.icd.peerFor(peerNodeId);
        if (entry === undefined) {
            throw new ImplementationError("ICD key refresh requires the peer's Check-In receive path.");
        }
        return entry;
    }

    /** An abort, or the exchange closing under it because the node or the peer went away. */
    static #isAbandoned(error: unknown) {
        return error instanceof AbortedError || error instanceof ClosedError;
    }

    /** Wait for the registration work the destroying edge abandoned; what it stored so far stays. */
    override async [Symbol.asyncDispose]() {
        // Their callers receive the errors
        await Promise.allSettled(this.internal.operations);
        await super[Symbol.asyncDispose]?.();
    }
}

/** The stored facts of a registration. */
type Registration = Pick<
    IcdClient.State,
    "key" | "pendingKey" | "counterStart" | "lastOffset" | "monitoredSubject" | "clientType"
>;

/**
 * Which operation may abandon which: unregister() and forget() take over a registration or a key refresh, forget()
 * also an unregister() that has not cleared yet.  A registration or refresh starts only when none runs.
 */
const TAKES_OVER: Record<IcdClient.Operation["kind"], IcdClient.Operation["kind"][]> = {
    registering: [],
    refreshing: [],
    unregistering: ["registering", "refreshing"],
    forgetting: ["registering", "refreshing", "unregistering"],
};

function logListenerError(event: string): ObserverErrorHandler {
    return (error, observer) =>
        logger.warn(`Error in ICD client ${event} listener ${observer.name || "(anon)"}`, error);
}

export namespace IcdClient {
    /** Minimum device Matter specification version (BasicInformation, encoded 0xMMmmpprr) for trustworthy LIT behavior. */
    export const MIN_LIT_SPECIFICATION_VERSION = 0x01040000; // 1.4.0

    /**
     * Whether a peer is LIT-capable: advertises LongIdleTimeSupport AND reports Matter specification version >= 1.4.0.
     * Devices below 1.4.0 (or not reporting a version) are treated as non-LIT regardless of the feature flag.
     */
    export function litSupported(endpoint: Endpoint): boolean {
        if (endpoint.maybeFeaturesOf(IcdManagementClient)?.longIdleTimeSupport !== true) {
            return false;
        }
        return (
            (endpoint.maybeStateOf(BasicInformationClient)?.specificationVersion ?? 0) >= MIN_LIT_SPECIFICATION_VERSION
        );
    }

    /**
     * Registration, key refresh or teardown in flight.  Runtime only; whether a registration exists is the stored
     * {@link State.key}.  At most one runs.
     */
    export interface Operation {
        readonly kind: "registering" | "refreshing" | "unregistering" | "forgetting";

        /** Abandons the operation; a child of the behavior's lifetime. */
        readonly abort: Abort;

        /** Settles with the operation, so a second caller can join it. */
        done: Promise<void>;

        /** The options a registration was started with, so a second register() joins only with the same ones. */
        readonly options?: RegisterOptions;
    }

    /** Options of {@link IcdClient.register}. */
    export interface RegisterOptions {
        monitoredSubject?: SubjectId;
        clientType?: IcdManagement.ClientType;
        allowMultiAdmin?: boolean;
        ignoredVendors?: VendorId[];
    }

    export class Internal {
        /** The operation in flight, if any. */
        operation?: Operation;

        /** Aborted when the behavior goes away; every operation's abort is a child of it. */
        lifetime = new Abort();

        /** Operations and auto-registrations in flight, so dispose can wait for them. */
        operations = new Set<Promise<void>>();

        /** Retained across re-registrations so the protocol RX path stays armed without creating a second closure. */
        checkInHandler?: FabricIcd.CheckInHandler;

        /** In-flight LIT auto-registration; tracked so overlapping triggers can't double-register. */
        autoRegister?: Promise<void>;

        /** Set when a trigger arrives while {@link autoRegister} is in flight, so it re-evaluates on completion. */
        autoRegisterPending?: boolean;

        /**
         * The peer last fed to {@link FabricIcd}.  Kept after teardown, when FabricIcd no longer routes its Check-Ins, so
         * decommission can drop its wakefulness after `peerAddress` is gone.
         */
        peer?: PeerAddress;

        /** The fed peer's wakefulness `available` observable we currently mirror. */
        availableSource?: AsyncObservableValue<[boolean]>;

        /** Listener mirroring {@link availableSource} into {@link IcdClient.State.available}; created once and moved on re-feed. */
        availableListener?: Observer<[boolean]>;

        /** The fed peer's wakefulness `checkInMissed` observable we currently mirror. */
        checkInMissedSource?: AsyncObservable<[]>;

        /** Listener mirroring {@link checkInMissedSource} into {@link IcdClient.Events.checkInMissed}; created once and moved on re-feed. */
        checkInMissedListener?: Observer<[]>;
    }

    export class State {
        /**
         * Shared secret installed on the peer at registration, used to verify Check-In message ICD counters.
         */
        @field(octstr, nonvolatile)
        key?: Bytes;

        /**
         * Key offered to the peer by a key refresh that neither a response nor a Check-In under it has confirmed yet.
         */
        @field(octstr, nonvolatile)
        pendingKey?: Bytes;

        /**
         * Starting value of the peer's ICD counter for {@link key}; Check-In counters are validated relative to this.
         *
         * The ICDCounter of the peer's RegisterClient response.  When a Check-In under a refreshed key confirms it first,
         * the last counter accepted under the previous key, a lower bound of the peer's counter when it took the key; a
         * response that follows replaces it.
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
         * Whether this controller is currently registered as a Check-In client on the peer: true exactly while a
         * {@link key} is stored.
         *
         * @deprecated Use {@link IcdClient.isRegistered} or test {@link key}.
         */
        @field(bool, nonvolatile)
        registered: boolean = false;

        /**
         * Time of the most recently received Check-In from the peer.
         */
        @field(systimeMs)
        lastCheckInReceivedAt?: Timestamp;

        /**
         * Whether the registered peer is reachable: a subscription to it is held, or its next Check-In is not yet
         * overdue. Non-LIT peers are always available.
         */
        @field(bool)
        available: boolean = false;
    }

    /**
     * A listener's error is logged, so it neither keeps the other listeners from the event nor, for {@link checkedIn},
     * rolls back the Check-In state stored with it.
     */
    export class Events extends BaseEvents {
        /** Emits after a registration is stored. */
        registered = Observable(logListenerError("registered"));

        /** Emits after the cleared registration is stored, by unregister(), forget() or decommission. */
        unregistered = Observable(logListenerError("unregistered"));

        /** Emits for each accepted Check-In, inside the transaction that stores its counter. */
        checkedIn = Observable<[checkIn: { counter: number; activeModeThreshold: number }]>(
            logListenerError("checkedIn"),
        );

        /**
         * Emits once per key refresh, after the new key is stored as confirmed (by the RegisterClient response or by
         * the first Check-In under it).
         */
        keyRefreshed = Observable(logListenerError("keyRefreshed"));

        /** Emits after commit whenever {@link State.key} changes; {@link registered}, {@link unregistered} and {@link keyRefreshed} follow from it. */
        key$Changed = new Observable<[value: Bytes | undefined, oldValue: Bytes | undefined]>();

        available$Changed = new Observable<[value: boolean, oldValue: boolean]>();

        /**
         * Emits after commit whenever {@link State.counterStart} changes: set by a registration, replaced when a key
         * refresh is confirmed and again when a response follows a Check-In that confirmed it, cleared when the
         * registration is.
         */
        counterStart$Changed = new Observable<[value: number | undefined, oldValue: number | undefined]>();

        /** Emits when a registered LIT peer misses its expected Check-In (its availability window lapsed). */
        checkInMissed = Observable();
    }
}
