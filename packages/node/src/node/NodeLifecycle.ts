/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { LifecycleMutex } from "#endpoint/properties/LifecycleMutex.js";
import { AsyncObservable, Observable } from "@matter/general";

/**
 * Extended lifecycle information that only applies to root endpoints.
 */
export class NodeLifecycle extends EndpointLifecycle {
    #online = AsyncObservable<[context: ActionContext]>();
    #goingOffline = AsyncObservable<[context: ActionContext]>();
    #offline = AsyncObservable<[context: ActionContext]>();
    #commissioned = Observable<[context: ActionContext]>();
    #decommissioned = Observable<[context: ActionContext]>();
    #initialized = Observable<[isCommissioned: boolean]>();
    #onlineAt?: Date;
    #isCommissioned = false;
    #targetState: "online" | "offline" = "offline";
    #mutex: LifecycleMutex;

    constructor(endpoint: Endpoint) {
        super(endpoint);

        this.#mutex = new LifecycleMutex(endpoint);

        this.#online.on(() => {
            this.#onlineAt = new Date();
        });
        this.#offline.on(() => {
            this.#onlineAt = undefined;
        });
        this.#commissioned.on(() => {
            this.#isCommissioned = true;
        });
        this.#decommissioned.on(() => {
            this.#isCommissioned = false;
        });
        this.#initialized.on(isCommissioned => {
            this.#isCommissioned = isCommissioned;
        });
    }

    /**
     * True when the node is connected to the network.
     */
    get isOnline() {
        return this.#onlineAt !== undefined;
    }

    /**
     * The time the node went online.
     */
    get onlineAt() {
        return this.#onlineAt;
    }

    /**
     * Emits when the node is first online.
     */
    get online() {
        return this.#online;
    }

    /**
     * Emits when the node's endpoint tree is ready/initialized and used to initialize the commissioning state
     */
    get initialized() {
        return this.#initialized;
    }

    /**
     * Emits when the node is going offline.
     */
    get goingOffline() {
        return this.#goingOffline;
    }

    /**
     * Emits when the node goes offline.
     */
    get offline() {
        return this.#offline;
    }

    /**
     * True when the node is part of at least one fabric.
     */
    get isCommissioned() {
        return this.#isCommissioned;
    }

    /**
     * Emits when node is first commissioned.
     */
    get commissioned() {
        return this.#commissioned;
    }

    /**
     * Emits when node is no longer commissioned.
     */
    get decommissioned() {
        return this.#decommissioned;
    }

    /**
     * Mutex for protecting node lifecycle transitions.
     *
     * {@link Node.start}, {@link Node.stop} and the lifecycle verbs of the node hold this mutex.  The verbs of the
     * node's other endpoints do not; they hold {@link treeMutex}, which the verbs of the node take after this one.
     *
     * {@link Node.startWithMutex} and {@link Node.cancelWithMutex} expect this mutex; the other "*WithMutex" methods
     * expect {@link treeMutex}.
     *
     * @internal
     */
    get mutex() {
        return this.#mutex;
    }

    override get isNode() {
        return true;
    }

    set targetState(state: "online" | "offline") {
        this.#targetState = state;
    }

    /**
     * Whether the node should be online: it was started, not stopped, and no close or delete was requested.
     */
    get shouldBeOnline() {
        return this.#targetState === "online" && !this.isTerminal;
    }

    get shouldBeOffline() {
        return !this.shouldBeOnline;
    }
}
