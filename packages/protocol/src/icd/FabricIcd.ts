/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Crypto } from "@matter/general";
import { Bytes, Logger } from "@matter/general";
import { type SubjectId, NodeId } from "@matter/types";
import type { IcdManagement } from "@matter/types/clusters/icd-management";
import { CheckInMessage } from "./CheckInMessage.js";

const logger = Logger.get("FabricIcd");

/**
 * Runtime per-fabric ICD state, available as {@link Fabric#icd}.
 *
 * Populated by owning behaviors at init; persistence stays with those behaviors.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.16.6.4 (device-role registrations)
 * @see {@link MatterSpecification.v151.Core} § 4.22.4.2 (controller-role trial decryption)
 */
export class FabricIcd {
    readonly #crypto: Crypto;
    readonly #registrations = new Map<NodeId, FabricIcd.Registration>();
    readonly #peers = new Map<NodeId, { peer: FabricIcd.Peer; handler: FabricIcd.CheckInHandler }>();

    constructor(crypto: Crypto) {
        this.#crypto = crypto;
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
        this.#peers.set(peer.peerNodeId, { peer, handler });
    }

    peerFor(peerNodeId: NodeId): FabricIcd.Peer | undefined {
        return this.#peers.get(peerNodeId)?.peer;
    }

    deletePeer(peerNodeId: NodeId): void {
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
     * @see {@link MatterSpecification.v151.Core} § 4.22.4.2
     */
    async processCheckIn(payload: Bytes): Promise<boolean> {
        for (const { peer, handler } of this.#peers.values()) {
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
            try {
                handler({
                    peerNodeId: peer.peerNodeId,
                    counter: decoded.counter,
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
     * @see {@link MatterSpecification.v151.Core} § 9.16.6.4
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
        activeModeThreshold: number;
        refreshNeeded: boolean;
    }

    export type CheckInHandler = (checkIn: ReceivedCheckIn) => void;
}
