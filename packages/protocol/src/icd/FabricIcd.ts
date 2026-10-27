/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Crypto } from "@matter/general";
import { Bytes, ImplementationError, Logger, Millis, Observable, UnexpectedDataError } from "@matter/general";
import { type SubjectId, NodeId } from "@matter/types";
import type { IcdManagement } from "@matter/types/clusters/icd-management";
import { CheckInMessage } from "./CheckInMessage.js";
import { IcdPeerWakefulness } from "./IcdPeerWakefulness.js";

const logger = Logger.get("FabricIcd");

/**
 * Runtime per-fabric ICD state, available as {@link Fabric#icd}.
 *
 * Populated by owning behaviors at init; persistence stays with those behaviors.
 *
 * @see {@link MatterSpecification.v161.Core} § 9.16.6.4 (device-role registrations)
 * @see {@link MatterSpecification.v161.Core} § 4.22.4.2 (controller-role trial decryption)
 */
export class FabricIcd {
    readonly #crypto: Crypto;
    readonly #registrations = new Map<NodeId, FabricIcd.Registration>();
    readonly #peers = new Map<NodeId, { peer: FabricIcd.Peer; handler: FabricIcd.CheckInHandler }>();
    readonly #wakefulness = new Map<NodeId, IcdPeerWakefulness>();
    readonly #peerFed = Observable<[NodeId]>();

    constructor(crypto: Crypto) {
        this.#crypto = crypto;
    }

    /**
     * Emits the peer node ID when a peer's registration starts ({@link addPeer} of an unregistered peer), i.e.
     * {@link wakefulnessFor} starts returning its {@link IcdPeerWakefulness}.  A sustained subscription running without
     * a wakefulness races this signal to observe the peer's mode from then on.
     */
    get peerFed() {
        return this.#peerFed;
    }

    /** All registered check-in clients for this fabric. */
    get registrations(): FabricIcd.Registration[] {
        return [...this.#registrations.values()];
    }

    /** Adds or replaces a registration, keyed by checkInNodeId. */
    setRegistration(registration: FabricIcd.Registration): void {
        this.#registrations.set(registration.checkInNodeId, registration);
    }

    deleteRegistration(checkInNodeId: NodeId): void {
        this.#registrations.delete(checkInNodeId);
    }

    clearRegistrations(): void {
        this.#registrations.clear();
    }

    /**
     * Register a peer's Check-In key and handler.  The peer keeps one {@link IcdPeerWakefulness} for its lifetime on
     * this fabric, so a repeated registration updates the key and handler and resumes the wakefulness with its history.
     */
    addPeer(peer: FabricIcd.Peer, handler: FabricIcd.CheckInHandler): void {
        const wasRegistered = this.#peers.has(peer.peerNodeId);
        this.#peers.set(peer.peerNodeId, { peer, handler });
        let wakefulness = this.#wakefulness.get(peer.peerNodeId);
        if (wakefulness === undefined) {
            wakefulness = new IcdPeerWakefulness();
            this.#wakefulness.set(peer.peerNodeId, wakefulness);
        }
        if (!wasRegistered) {
            wakefulness.resume();
            this.#peerFed.emit(peer.peerNodeId);
        }
    }

    /**
     * Set the key a key refresh offers the peer.  Until the refresh is confirmed, Check-Ins decrypt with the current
     * key or this one, because the peer may have accepted it without the confirmation reaching us.
     *
     * @see {@link MatterSpecification.v161.Core} § 4.22.3.4, § 9.16.7.1
     */
    setPendingKey(peerNodeId: NodeId, pendingKey: Bytes): void {
        this.#entryFor(peerNodeId).peer.pendingKey = pendingKey;
    }

    /**
     * Whether the last Check-In accepted under the peer's current key requires a key refresh.  Asked when the refresh
     * would start, so a key confirmed in the meantime answers false.
     *
     * @see {@link MatterSpecification.v161.Core} § 4.22.3.4.1
     */
    refreshNeeded(peerNodeId: NodeId): boolean {
        const peer = this.#peers.get(peerNodeId)?.peer;
        return peer !== undefined && CheckInMessage.refreshNeededAt(peer.lastOffset);
    }

    /**
     * Apply the starting counter a key refresh response reported for `key`:
     *
     *   - a pending `key` replaces the current one, starting at `counterStart`;
     *   - a `key` a Check-In already promoted keeps its last accepted counter, now measured from `counterStart`; if that
     *     counter lies before `counterStart`, the Check-In's baseline stays;
     *   - any other `key` changes nothing.
     *
     * Returns false only in the last case.
     *
     * @see {@link MatterSpecification.v161.Core} § 4.22.3.4, § 9.16.7.1
     */
    confirmKey(peerNodeId: NodeId, key: Bytes, counterStart: number): boolean {
        const { peer } = this.#entryFor(peerNodeId);
        if (peer.pendingKey !== undefined && Bytes.areEqual(peer.pendingKey, key)) {
            peer.key = key;
            peer.pendingKey = undefined;
            peer.counterStart = counterStart;
            peer.lastOffset = 0;
            return true;
        }
        if (!Bytes.areEqual(peer.key, key)) {
            return false;
        }
        const lastCounter = (peer.counterStart + peer.lastOffset) >>> 0;
        const validation = CheckInMessage.validateCounter(lastCounter, { counterStart, lastOffset: 0 });
        if (validation.refreshNeeded) {
            logger.info(
                `ICD peer ${peer.peerNodeId} reported starting counter ${counterStart} after Check-In counter ${lastCounter}; keeping the Check-In baseline`,
            );
            return true;
        }
        peer.counterStart = counterStart;
        peer.lastOffset = validation.offset;
        return true;
    }

    #entryFor(peerNodeId: NodeId) {
        const entry = this.#peers.get(peerNodeId);
        if (entry === undefined) {
            throw new ImplementationError(`ICD peer ${peerNodeId} is not registered with this fabric.`);
        }
        return entry;
    }

    peerFor(peerNodeId: NodeId): FabricIcd.Peer | undefined {
        return this.#peers.get(peerNodeId)?.peer;
    }

    /** The wakefulness of a registered peer. */
    wakefulnessFor(peerNodeId: NodeId): IcdPeerWakefulness | undefined {
        return this.#peers.has(peerNodeId) ? this.#wakefulness.get(peerNodeId) : undefined;
    }

    /**
     * Remove a peer's registration.  The controller no longer awaits its Check-Ins, so its wakefulness is suspended
     * until the peer is registered again.
     */
    deletePeer(peerNodeId: NodeId): void {
        if (this.#peers.delete(peerNodeId)) {
            this.#wakefulness.get(peerNodeId)?.suspend();
        }
    }

    /** Remove a peer that left the fabric, with its wakefulness; a later peer with the same node ID starts afresh. */
    removePeer(peerNodeId: NodeId): void {
        this.#peers.delete(peerNodeId);
        this.#wakefulness.get(peerNodeId)?.close();
        this.#wakefulness.delete(peerNodeId);
    }

    /** Record a message received from a peer, for its wakefulness. */
    notePeerActive(peerNodeId: NodeId): void {
        this.#wakefulness.get(peerNodeId)?.noteActive();
    }

    get hasPeers(): boolean {
        return this.#peers.size > 0;
    }

    /**
     * In-memory teardown for shutdown: cancel every peer's wakefulness timers so they do not outlive the fabric (e.g.
     * delaying node shutdown).  Does not unpersist registrations.
     */
    close(): void {
        for (const wakefulness of this.#wakefulness.values()) {
            wakefulness.close();
        }
        this.#wakefulness.clear();
        this.#peers.clear();
        this.#registrations.clear();
    }

    [Symbol.dispose](): void {
        this.close();
    }

    /**
     * Trial-decrypts a Check-In payload against all registered peer keys, and against a peer's pending key.
     *
     * The first Check-In under a pending key proves the peer switched to it, so that key replaces the current one.
     *
     * Returns true if a key matched (even when the counter was a replay), false when no key decrypted the payload.
     *
     * @see {@link MatterSpecification.v161.Core} § 4.22.4.2
     */
    async processCheckIn(payload: Bytes): Promise<boolean> {
        for (const [peerNodeId, { peer, handler }] of this.#peers) {
            const match = await this.#decrypt(peer, payload);
            if (match === undefined) {
                continue;
            }
            const { decoded, key } = match;

            let validation: CheckInMessage.CounterValidation;
            if (Bytes.areEqual(key, peer.key)) {
                validation = CheckInMessage.validateCounter(decoded.counter, peer);
                if (!validation.valid) {
                    logger.info(`Dropping replayed check-in from peer ${peer.peerNodeId}`);
                    return true;
                }
            } else if (peer.pendingKey !== undefined && Bytes.areEqual(key, peer.pendingKey)) {
                // The ICD counter spans keys, so the last counter accepted under the old key is a lower bound of the
                // peer's counter when it took the new key
                const counterStart = (peer.counterStart + peer.lastOffset) >>> 0;
                validation = CheckInMessage.validateCounter(decoded.counter, { counterStart, lastOffset: 0 });
                // An offset of 2³¹ or more is a counter from before that bound, not a fresh one
                if (!validation.valid || validation.refreshNeeded) {
                    logger.info(`Dropping replayed check-in from peer ${peer.peerNodeId}`);
                    return true;
                }
                logger.info(`ICD peer ${peer.peerNodeId} checked in with its refreshed key`);
                peer.key = key;
                peer.pendingKey = undefined;
                peer.counterStart = counterStart;
            } else {
                // The peer was re-keyed while this payload decrypted
                continue;
            }

            // Advance before the handler: a received counter value is consumed exactly once regardless of handler outcome.
            peer.lastOffset = validation.offset;
            this.#wakefulness.get(peerNodeId)?.noteCheckIn(Millis(decoded.activeModeThreshold));
            try {
                handler({
                    peerNodeId: peer.peerNodeId,
                    counter: decoded.counter,
                    activeModeThreshold: decoded.activeModeThreshold,
                });
            } catch (e) {
                logger.warn("Unhandled error in check-in handler", e);
            }
            return true;
        }

        return false;
    }

    async #decrypt(peer: FabricIcd.Peer, payload: Bytes) {
        for (const key of [peer.key, peer.pendingKey]) {
            if (key === undefined) {
                continue;
            }
            try {
                return { decoded: await CheckInMessage.decodeIcd(this.#crypto, key, payload), key };
            } catch (error) {
                if (!(error instanceof UnexpectedDataError)) {
                    throw error;
                }
            }
        }
    }
}

export namespace FabricIcd {
    /**
     * A registered check-in client entry (mirrors IcdManagement RegisteredClients).
     *
     * @see {@link MatterSpecification.v161.Core} § 9.16.6.4
     */
    export interface Registration {
        checkInNodeId: NodeId;
        monitoredSubject: SubjectId;
        key: Bytes;
        clientType: IcdManagement.ClientType;
    }

    /** A registered ICD peer on the controller side, with rolling counter state. */
    export interface Peer {
        peerNodeId: NodeId;
        key: Bytes;
        counterStart: number;
        lastOffset: number;

        /** Key offered to the peer by a key refresh that is not confirmed yet. */
        pendingKey?: Bytes;
    }

    /** Data delivered to the handler when a check-in is successfully decrypted and validated. */
    export interface ReceivedCheckIn {
        peerNodeId: NodeId;
        counter: number;
        activeModeThreshold: number;
    }

    export type CheckInHandler = (checkIn: ReceivedCheckIn) => void;
}
