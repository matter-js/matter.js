/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Observable } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Discovery } from "./Discovery.js";

/**
 * Finds all nodes possible within a time window or indefinitely until canceled.
 *
 * If you run without a timeout, the output array is always empty and you must add a listener to
 * {@link ContinuousDiscover#discovered}.
 */
export class ContinuousDiscovery extends Discovery<ClientNode[]> {
    #discovered = Observable<[ClientNode]>();
    #result = Array<ClientNode>();
    #bounded: boolean;

    constructor(owner: ServerNode, options?: Discovery.Options) {
        super(owner, options);
        this.#bounded = options?.timeout !== undefined;
    }

    /**
     * Emitted as discovery encounters new nodes.
     */
    get discovered() {
        return this.#discovered;
    }

    protected onDiscovered(node: ClientNode) {
        if (this.#bounded) {
            this.#result.push(node);
        }
        this.#discovered.emit(node);
    }

    protected onComplete() {
        return this.#result;
    }
}
