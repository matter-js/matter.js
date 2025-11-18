/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformation } from "#clusters/basic-information";
import { BasicMultiplex, BasicSet, isIpNetworkChannel, MaybePromise } from "#general";
import type { MdnsClient } from "#mdns/MdnsClient.js";
import type { NodeSession } from "#session/NodeSession.js";
import type { SecureSession } from "#session/SecureSession.js";
import type { SessionManager } from "#session/SessionManager.js";
import { ObservablePeerDescriptor, PeerDescriptor } from "./PeerDescriptor.js";
import type { NodeDiscoveryType } from "./PeerSet.js";

/**
 * A node on a fabric we are a member of.
 */
export class Peer {
    #descriptor: PeerDescriptor;
    #context: Peer.Context;
    #sessions = new BasicSet<NodeSession>();
    #workers = new BasicMultiplex();
    #isSaving = false;
    #limits: BasicInformation.CapabilityMinima = {
        caseSessionsPerFabric: 3,
        subscriptionsPerFabric: 3,
    };

    // TODO - manage these internally and/or factor away
    activeDiscovery?: Peer.ActiveDiscovery;
    activeReconnection?: Peer.ActiveReconnection;

    constructor(descriptor: PeerDescriptor, context: Peer.Context) {
        this.#descriptor = new ObservablePeerDescriptor(descriptor, () => {
            if (this.#isSaving) {
                return;
            }

            this.#isSaving = true;
            this.#workers.add(this.#save(), `persistence of ${this}`);
        });
        this.#context = context;

        this.#sessions.added.on(session => {
            // Remove channel when destroyed
            session.destroyed.on(() => {
                this.#sessions.delete(session);
            });

            // Ensure operational address is always the most recent IP
            const { channel } = session.channel;
            if (isIpNetworkChannel(channel)) {
                this.#descriptor.operationalAddress = channel.networkAddress;
            }
        });
    }

    get fabric() {
        return this.#context.sessions.fabricFor(this.address);
    }

    get limits() {
        return this.#limits;
    }

    set limits(limits: BasicInformation.CapabilityMinima) {
        this.#limits = limits;
    }

    get address() {
        return this.#descriptor.address;
    }

    get descriptor() {
        return this.#descriptor;
    }

    get sessions() {
        return this.#sessions;
    }

    /**
     * Permanently forget the peer.
     */
    async delete() {
        await this.close();
        await this.#context.deletePeer(this);
        await this.#context.sessions.deleteResumptionRecord(this.address);
    }

    /**
     *
     */
    async close(sendSessionClose = true) {
        if (this.activeDiscovery) {
            this.activeDiscovery.stopTimerFunc?.();

            // This ends discovery without triggering promises
            this.activeDiscovery.mdnsClient?.cancelOperationalDeviceDiscovery(this.fabric, this.address.nodeId, false);

            this.activeDiscovery = undefined;
        }

        if (this.activeReconnection) {
            this.activeReconnection.rejecter("Peer closed");
            this.activeReconnection = undefined;
        }

        await this.#context.sessions.removeSessionsFor(this.address, sendSessionClose);

        await this.#workers;

        this.#context.closed(this);
    }

    toString() {
        return this.address.toString();
    }

    async #save() {
        this.#isSaving = false;
        await this.#context.savePeer(this);
    }
}

export namespace Peer {
    export interface Context {
        sessions: SessionManager;
        savePeer(peer: Peer): MaybePromise<void>;
        deletePeer(peer: Peer): MaybePromise<void>;
        closed(peer: Peer): void;
    }

    // TODO - factor away
    export interface ActiveDiscovery {
        type: NodeDiscoveryType;
        promises?: (() => Promise<SecureSession>)[];
        stopTimerFunc?: (() => void) | undefined;
        mdnsClient?: MdnsClient;
    }

    // TODO - factor away
    export interface ActiveReconnection {
        promise: Promise<SecureSession>;
        rejecter: (reason?: any) => void;
    }
}
