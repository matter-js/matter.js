/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { Observable } from "@matter/general";
import { NodeLifecycle } from "./NodeLifecycle.js";

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
 * Lifecycle information specific to client (peer) nodes.
 */
export class ClientNodeLifecycle extends NodeLifecycle {
    #seeded = Observable<[context: ActionContext]>();
    #connectionStateChanged = Observable<[state: NodeConnectionState]>();
    #isSeeded = false;
    #connectionState = NodeConnectionState.Disconnected;

    /**
     * True once the node's structure has been read at least once (BasicInformation present and more than just the
     * root endpoint present).
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
     * The current {@link NodeConnectionState}.
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
}
