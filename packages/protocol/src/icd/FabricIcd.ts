/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Crypto } from "@matter/general";
import { Bytes, ImplementationError, Logger, Observable } from "@matter/general";
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
 * @see {@link MatterSpecification.v16.Core} § 9.16.6.4 (device-role registrations)
 * @see {@link MatterSpecification.v16.Core} § 4.22.4.2 (controller-role trial decryption)
 */
export class FabricIcd {
    readonly #crypto: Crypto;
    readonly #registrations = new Map<NodeId, FabricIcd.Registration>();
    readonly #peers = new Map<
        NodeId,
        { peer: FabricIcd.Peer; handler: FabricIcd.CheckInHandler; wakefulness: IcdPeerWakefulness }
    >();
    readonly #peerFed = Observable<[NodeId]>();

    constructor(crypto: Crypto) {
        this.#crypto = crypto;
    }

    /**
     * Emits the peer node ID whenever a peer is fed ({@link addPeer}), i.e. a fresh {@link IcdPeerWakefulness} becomes
     * available.  A sustained subscription established before its peer was registered races this signal so the first
     * registration-induced SIT⇄LIT flip recreates the subscription for the new mode.
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

    addPeer(peer: FabricIcd.Peer, handler: FabricIcd.CheckInHandler): void {
        this.#peers.get(peer.peerNodeId)?.wakefulness.close();
        this.#peers.set(peer.peerNodeId, { peer, handler, wakefulness: new IcdPeerWakefulness() });
        this.#peerFed.emit(peer.peerNodeId);
    }

    /**
     * Re-key a registered peer in place (key refresh), preserving its {@link IcdPeerWakefulness} and handler. Recreating
     * the entry would reset the live wakefulness windows that a parked sustained subscription resolves each loop, so the
     * rolling-counter baseline is updated without disturbing them.
     */
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

    wakefulnessFor(peerNodeId: NodeId): IcdPeerWakefulness | undefined {
        return this.#peers.get(peerNodeId)?.wakefulness;
    }

    deletePeer(peerNodeId: NodeId): void {
        this.#peers.get(peerNodeId)?.wakefulness.close();
        this.#peers.delete(peerNodeId);
    }

    get hasPeers(): boolean {
        return this.#peers.size > 0;
    }

    /**
     * Trial-decrypts a Check-In payload against all registered peer keys.
     *
     * Returns true if a key matched (even when the counter was a replay), false when no key decrypted the payload.
     *
     * @see {@link MatterSpecification.v16.Core} § 4.22.4.2
     */
    async processCheckIn(payload: Bytes): Promise<boolean> {
        for (const { peer, handler, wakefulness } of this.#peers.values()) {
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
            wakefulness.noteSignal();
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
     * @see {@link MatterSpecification.v16.Core} § 9.16.6.4
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
