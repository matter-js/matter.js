/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, Construction, ImplementationError } from "#general";
import type { Node } from "#node/Node.js";
import { NodeActivity } from "../../context/NodeActivity.js";
import { NetworkBehavior } from "./NetworkBehavior.js";

/**
 * Base class for networking implementation.
 */
export abstract class NetworkRuntime {
    #construction: Construction<NetworkRuntime>;
    #owner: Node;
    #abort = new Abort();

    get abortSignal() {
        return this.#abort.signal;
    }

    get construction() {
        return this.#construction;
    }

    constructor(owner: Node) {
        this.#owner = owner;

        const internals = owner.behaviors.internalsOf(NetworkBehavior);
        if (internals.runtime) {
            throw new ImplementationError("Network is already active");
        }
        internals.runtime = this;

        this.#construction = Construction(this);
    }

    async [Construction.construct]() {
        await this.start();
    }

    async [Construction.destruct]() {
        this.#abort();
        const activity = this.#owner.env.get(NodeActivity);
        await activity.inactive;

        try {
            await this.stop();
        } finally {
            this.#owner.behaviors.internalsOf(NetworkBehavior).runtime = undefined;
        }
        await this.#owner.act(agent => this.owner.lifecycle.offline.emit(agent.context));
    }

    async close() {
        await this.construction.close();
    }

    protected abstract start(): Promise<void>;

    protected abstract stop(): Promise<void>;

    protected get owner() {
        return this.#owner;
    }
}
