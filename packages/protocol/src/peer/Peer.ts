/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicMultiplex, BasicSet, isIpNetworkChannel, MaybePromise } from "#general";
import { NodeSession } from "#session/NodeSession.js";
import { ObservablePeerDescriptor, PeerDescriptor } from "./PeerDescriptor.js";

/**
 * A node on a fabric we are a member of.
 */
export class Peer {
    #descriptor: PeerDescriptor;
    #context: Peer.Context;
    #sessions = new BasicSet<NodeSession>();
    #workers = new BasicMultiplex();
    #isSaving = false;

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
            if (session.hasChannel) {
                const { channel } = session.channel;
                if (isIpNetworkChannel(channel)) {
                    this.#descriptor.operationalAddress = channel.networkAddress;
                }
            }
        });
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

    async close() {
        await this.#workers;
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
        savePeer(peer: Peer): MaybePromise<void>;
    }
}
