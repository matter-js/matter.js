/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { AsyncObservable, Mutex, Observable } from "@matter/general";

/**
 * Connection state of a client (peer) node.
 *
 * Values match the legacy `NodeStates` enum so consumers migrate by type swap.
 */
export enum NodeConnectionState {
    /**
     * The node is connected: the last communications succeeded and subscription updates are flowing, so data is
     * up-to-date.
     */
    Connected = 0,

    /**
     * The node is disconnected because it is disabled, stopped or not yet started.  No connection is attempted and
     * data is stale.
     */
    Disconnected = 1,

    /**
     * A former connection was lost and we are actively re-establishing it on known addresses.  Data is stale and it is
     * not yet known whether reconnection will succeed.
     */
    Reconnecting = 2,

    /**
     * The node appears offline: communication failed and there is no known-reachable address, so we are waiting for the
     * node to re-announce itself via mDNS before attempting to connect again.
     */
    WaitingForDeviceDiscovery = 3,
}

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
    #seeded = Observable<[context: ActionContext]>();
    #connectionStateChanged = Observable<[state: NodeConnectionState]>();
    #onlineAt?: Date;
    #isCommissioned = false;
    #isSeeded = false;
    #connectionState = NodeConnectionState.Disconnected;
    #mutex: Mutex;
    #targetState: "online" | "offline" = "offline";

    constructor(endpoint: Endpoint) {
        super(endpoint);

        this.#mutex = new Mutex(endpoint);

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
     * True once the node's structure has been read at least once (BasicInformation present and more than just the
     * root endpoint present).  Only driven for client (peer) nodes.
     */
    get isSeeded() {
        return this.#isSeeded;
    }

    /**
     * Emits the first time the node becomes {@link isSeeded}.
     */
    get seeded() {
        return this.#seeded;
    }

    /**
     * Transitions the node to seeded. No-op if already seeded, so {@link seeded} emits at most once.
     */
    markSeeded(context: ActionContext) {
        if (this.#isSeeded) {
            return;
        }
        this.#isSeeded = true;
        this.#seeded.emit(context);
    }

    /**
     * The current {@link NodeConnectionState}.  Only driven for client (peer) nodes.
     */
    get connectionState() {
        return this.#connectionState;
    }

    /**
     * Emits on each {@link connectionState} transition (not on no-op re-computes).
     */
    get connectionStateChanged() {
        return this.#connectionStateChanged;
    }

    /**
     * True when {@link connectionState} is {@link NodeConnectionState.Connected}.
     */
    get isConnected() {
        return this.#connectionState === NodeConnectionState.Connected;
    }

    /**
     * Set the {@link connectionState}, emitting {@link connectionStateChanged} only on a real transition.
     */
    setConnectionState(state: NodeConnectionState) {
        if (this.#connectionState === state) {
            return;
        }
        this.#connectionState = state;
        this.#connectionStateChanged.emit(state);
    }

    /**
     * Mutex for protecting node lifecycle transitions.
     *
     * Methods that implement complex async lifecycle transitions use this mutex to ensure conflicting operations cannot
     * intermingle.
     *
     * Generally methods that hold this mutex have a protected "*WithMutex" variant.  This allows for nesting of logic
     * that requires the mutex without causing deadlock.
     */
    get mutex() {
        return this.#mutex;
    }

    set targetState(state: "online" | "offline") {
        this.#targetState = state;
    }

    get shouldBeOnline() {
        return this.#targetState === "online";
    }

    get shouldBeOffline() {
        return this.#targetState === "offline";
    }
}
