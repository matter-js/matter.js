/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import type { MaybePromise } from "@matter/general";
import { Discovery } from "./Discovery.js";
import { DeviceNotDiscoveredError } from "./DiscoveryError.js";

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
        // The first node found is the result; devices still being prepared when it arrives do not replace it
        if (this.#result !== undefined) {
            return;
        }
        this.#result = node;
        this.stop();
    }

    /**
     * Once the node is found the result stands, so a later interruption is ignored.
     */
    protected override onInterrupt() {
        return this.#result === undefined;
    }

    protected onComplete(): MaybePromise<ClientNode> {
        if (this.#result === undefined) {
            throw new DeviceNotDiscoveredError(`${this} failed: Node not found`);
        }
        return this.#result;
    }
}
