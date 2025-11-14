/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerAddress } from "./PeerAddress.js";
import { PeerDescriptor } from "./PeerDescriptor.js";

/**
 * A node on a fabric we share.
 */
export class Peer {
    #descriptor: PeerDescriptor;

    constructor(descriptor: PeerDescriptor) {
        descriptor.address = PeerAddress(descriptor.address);
        this.#descriptor = descriptor;
    }

    get address() {
        return this.#descriptor.address;
    }

    get descriptor() {
        return this.#descriptor;
    }
}
