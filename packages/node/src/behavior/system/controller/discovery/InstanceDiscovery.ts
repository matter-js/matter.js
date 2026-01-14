/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MaybePromise } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Discovery } from "./Discovery.js";
import { DiscoveryError } from "./DiscoveryError.js";

/**
 * Locates a single node and returns it.
 *
 * Throws an error if the node is not located.
 */
export class InstanceDiscovery extends Discovery<ClientNode> {
    #result?: ClientNode;

    constructor(owner: ServerNode, options?: Discovery.InstanceOptions) {
        super(owner, options);
    }

    protected onDiscovered(node: ClientNode) {
        this.#result = node;
        this.stop();
    }

    protected onComplete(): MaybePromise<ClientNode> {
        if (this.#result === undefined) {
            throw new DiscoveryError(`${this} failed: Node not found`);
        }
        return this.#result;
    }
}
