/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Crypto } from "@matter/general";
import { Bytes, ImplementationError, Logger, Millis, Observable } from "@matter/general";
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

    /** Re-key a registered peer in place (key refresh), keeping its handler. */
    updatePeer(peerNodeId: NodeId, peer: Pick<FabricIcd.Peer, "key" | "counterStart" | "lastOffset">): void {
        const entry = this.#peers.get(peerNodeId);
        if (entry === undefined) {
            throw new ImplementationError(`Cannot update unregistered ICD peer ${peerNodeId}.`);
        }
        entry.peer.key = peer.key;
        entry.peer.counterStart = peer.counterStart;
        entry.peer.lastOffset = peer.lastOffset;
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
     * Trial-decrypts a Check-In payload against all registered peer keys.
     *
     * Returns true if a key matched (even when the counter was a replay), false when no key decrypted the payload.
     *
     * @see {@link MatterSpecification.v161.Core} § 4.22.4.2
     */
    async processCheckIn(payload: Bytes): Promise<boolean> {
        for (const [peerNodeId, { peer, handler }] of this.#peers) {
            let decoded: CheckInMessage.DecodedIcdCheckIn;
            try {
                decoded = await CheckInMessage.decodeIcd(this.#crypto, peer.key, payload);
            } catch {
                continue;
            }

            const validation = CheckInMessage.validateCounter(decoded.counter, peer);
            if (!validation.valid) {
                logger.info(`Dropping replayed check-in from peer ${peer.peerNodeId}`);
                return true;
            }

            // Advance before the handler: a received counter value is consumed exactly once regardless of handler outcome.
            peer.lastOffset = validation.offset;
            this.#wakefulness.get(peerNodeId)?.noteCheckIn(Millis(decoded.activeModeThreshold));
            try {
                handler({
                    peerNodeId: peer.peerNodeId,
                    counter: decoded.counter,
                    offset: validation.offset,
                    activeModeThreshold: decoded.activeModeThreshold,
                    refreshNeeded: validation.refreshNeeded,
                });
            } catch (e) {
                logger.warn("Unhandled error in check-in handler", e);
            }
            return true;
        }

        return false;
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
    }

    /** Data delivered to the handler when a check-in is successfully decrypted and validated. */
    export interface ReceivedCheckIn {
        peerNodeId: NodeId;
        counter: number;
        /** Unsigned offset of {@link counter} from the peer's registration baseline; the persisted rolling position. */
        offset: number;
        activeModeThreshold: number;
        refreshNeeded: boolean;
    }

    export type CheckInHandler = (checkIn: ReceivedCheckIn) => void;
}
