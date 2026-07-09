/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Node } from "#node/Node.js";
import { Abort, Construction, Duration, ImplementationError, Logger, Seconds, Time } from "@matter/general";
import { NodeActivity } from "../../context/NodeActivity.js";
import { NetworkBehavior } from "./NetworkBehavior.js";

const logger = Logger.get("NetworkRuntime");

/**
 * Upper bound on how long shutdown waits for node activity to settle before force-closing sessions and exchanges.
 * Guards against an interaction parked on MRP retransmission to an unresponsive peer (e.g. a restarted ICD, whose
 * backoff spans the idle interval) holding activity open for hours.
 */
const ACTIVITY_DRAIN_TIMEOUT = Seconds(5);

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
        if (!activity.inactive.value) {
            const drainTimeout = Time.sleep("shutdown activity drain", ACTIVITY_DRAIN_TIMEOUT);
            await Promise.race([activity.inactive, drainTimeout]);
            if (activity.inactive.value) {
                drainTimeout.cancel("activity drained");
            } else {
                logger.warn(
                    `Node activity did not settle within ${Duration.format(ACTIVITY_DRAIN_TIMEOUT)}; forcing shutdown`,
                    activity,
                );
            }
        }

        try {
            await this.stop();
        } finally {
            this.#owner.behaviors.internalsOf(NetworkBehavior).runtime = undefined;
        }

        if (this.#owner.lifecycle.isOnline) {
            await this.#owner.act(agent => this.owner.lifecycle.offline.emit(agent.context));
        }
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
