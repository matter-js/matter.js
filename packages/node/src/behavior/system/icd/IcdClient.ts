/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { IcdManagementClient } from "#behaviors/icd-management";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { Node } from "#node/Node.js";
import {
    Bytes,
    Crypto,
    Duration,
    ImplementationError,
    Logger,
    Millis,
    Observable,
    Time,
    Timestamp,
} from "@matter/general";
import { bool, field, nonvolatile, octstr, subjectId, systimeMs, uint32, uint8 } from "@matter/model";
import { FabricManager, PeerAddress, type FabricIcd } from "@matter/protocol";
import { NodeId, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { IcdMultiAdminError } from "./IcdMultiAdminError.js";

const logger = Logger.get("IcdClient");

/**
 * Controller-side client for ICD (Intermittently Connected Device) Check-In support.
 *
 * Auto-installed on a {@link ClientNode} whose peer exposes the IcdManagement cluster; installation alone does not
 * register this controller as a Check-In client — registration is an explicit application action. Receiving Check-Ins
 * emits events and updates informational state only; this behavior does not resubscribe or track peer wakefulness.
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

    /** Whether the peer supports the Long Idle Time feature; undefined feature map (unknown) reads as false. */
    get peerSupportsLit() {
        return this.endpoint.maybeFeaturesOf(IcdManagementClient)?.longIdleTimeSupport === true;
    }

    /** A LIT peer publishes Check-Ins rather than staying subscribable, so callers must await one before contacting it. */
    get peerRequiresCheckIn() {
        return this.peerSupportsLit;
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
        this.#feedFabricIcd(fabric, peerNodeId);
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
        this.events.unregistered.emit();
    }

    #dropFedPeer() {
        const fedPeer = this.internal.fedPeer;
        if (fedPeer === undefined) {
            return;
        }
        this.env.get(FabricManager).maybeFor(fedPeer.fabricIndex)?.icd.deletePeer(fedPeer.nodeId);
        this.internal.fedPeer = undefined;
    }

    /**
     * Register this controller as a Check-In client on the peer.
     *
     * Installs a shared {@link IcdManagement.RegisterClientRequest.key} on the peer so it can send us encrypted
     * Check-In messages, records the rolling-counter baseline in {@link State}, and arms the controller-side Check-In
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

        this.#feedFabricIcd(fabric, peerNodeId);
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
     * Ask the peer to remain in Active mode for at least `duration` and return the duration it actually promised.
     *
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.4
     */
    async stayActive(duration: Duration): Promise<Duration> {
        const { promisedActiveDuration } = await this.#peerIcd().stayActiveRequest({
            stayActiveDuration: Millis.of(duration),
        });
        return Millis(promisedActiveDuration);
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

    #feedFabricIcd(fabric: ReturnType<FabricManager["for"]>, peerNodeId: NodeId) {
        const { key, counterStart, lastOffset } = this.state;
        if (key === undefined || counterStart === undefined || lastOffset === undefined) {
            throw new ImplementationError("ICD peer cannot be fed to the fabric before registration state is set.");
        }
        if (this.internal.checkInHandler === undefined) {
            this.internal.checkInHandler = this.callback(this.#onCheckIn, { offline: true, lock: true });
        }
        fabric.icd.addPeer({ peerNodeId, key, counterStart, lastOffset }, this.internal.checkInHandler);
        this.internal.fedPeer = PeerAddress({ fabricIndex: fabric.fabricIndex, nodeId: peerNodeId });
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
            logger.warn("ICD key refresh failed", error);
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

        fabric.icd.deletePeer(peerNodeId);
        this.#feedFabricIcd(fabric, peerNodeId);
        this.events.keyRefreshed.emit();
    }

    /**
     * Wait for an in-flight key refresh to finish on teardown — aborting between the peer re-key and our state write
     * would leave the controller and peer with mismatched keys.
     */
    override async [Symbol.asyncDispose]() {
        await this.internal.keyRefresh;
    }
}

export namespace IcdClient {
    export class Internal {
        /** Retained across re-registrations so the protocol RX path stays armed without creating a second closure. */
        checkInHandler?: FabricIcd.CheckInHandler;

        /** In-flight key refresh; tracked so a second refreshNeeded Check-In can't overlap it and teardown can await it. */
        keyRefresh?: Promise<void>;

        /** Address of the peer fed to {@link FabricIcd}; lets decommission drop it after peerAddress is already gone. */
        fedPeer?: PeerAddress;
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
    }

    export class Events extends BaseEvents {
        registered = Observable();
        unregistered = Observable();
        checkedIn = Observable<[checkIn: { counter: number; activeModeThreshold: number }]>();
        keyRefreshed = Observable();
    }
}
