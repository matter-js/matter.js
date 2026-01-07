/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeId, ServerNode } from "@matter/main";
import { ParentProcess } from "../common/process-parent.js";

/**
 * Client interface for managing test controller implemented in controller-main.ts.
 */
export class TestController extends ParentProcess {
    static #default?: TestController;

    private constructor() {
        super("controller/controller-child.js");
    }

    static get default() {
        if (!this.#default) {
            this.#default = new TestController();
        }

        return this.#default;
    }

    async commission(node: ServerNode, nodeId?: NodeId) {
        if (!node.lifecycle.isOnline) {
            await node.start();
        }

        const { passcode, discriminator } = node.state.commissioning;
        await this.send({ kind: "commission", nodeId, passcode, discriminator });
    }

    async subscribe(nodeId?: NodeId) {
        await this.send({ kind: "subscribe", nodeId });
    }

    async reset() {
        await this.send({ kind: "reset" });
    }
}
