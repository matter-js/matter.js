/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicMultiplex, MaybePromise } from "#general";
import { ObservablePeerDescriptor, PeerDescriptor } from "./PeerDescriptor.js";

/**
 * A node (or group) on a fabric we are a member of.
 */
export class Peer {
    #descriptor: PeerDescriptor;
    #context: Peer.Context;
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
    }

    get address() {
        return this.#descriptor.address;
    }

    get descriptor() {
        return this.#descriptor;
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
