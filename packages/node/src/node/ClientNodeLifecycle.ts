/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
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
     * The node is disconnected because it is disabled, stopped, not started, not commissioned, its server node is
     * offline, or its start failed.  No connection is attempted and data is stale.
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
export class ClientNodeLifecycle extends NodeLifecycle<ClientNodeLifecycle.Intent> {
    #seeded = Observable<[context: ActionContext]>();
    #connectionStateChanged = Observable<[state: NodeConnectionState]>();
    #isSeeded = false;
    #connectionState = NodeConnectionState.Disconnected;
    #isDisabledRequested = false;

    constructor(endpoint: Endpoint) {
        super(endpoint, { target: "offline", isDisabled: false });
    }

    /**
     * Whether the last `ClientNode.enable()` or `disable()` asked for the node to be disabled.  Before the first call,
     * and after a last call that failed, it is the persisted flag; before the node loads it is not disabled.
     *
     * @internal
     */
    get isDisabled(): boolean {
        return this.intent.isDisabled;
    }

    /**
     * Adopt the persisted disabled flag when the node first initializes.  Does nothing once a call asked for the flag,
     * so a call before the first initialization keeps its value.
     *
     * @internal
     */
    initializeDisabled(isDisabled: boolean) {
        if (!this.#isDisabledRequested) {
            this.adopt({ isDisabled });
        }
    }

    override request(change: Partial<ClientNodeLifecycle.Intent>) {
        if ("isDisabled" in change) {
            this.#isDisabledRequested = true;
        }
        return super.request(change);
    }

    override restore(ticket: NodeLifecycle.IntentTicket, applied: ClientNodeLifecycle.Intent) {
        const restored = super.restore(ticket, applied);
        if (restored) {
            this.#isDisabledRequested = false;
        }
        return restored;
    }

    /**
     * True once the node's structure has been read since the node was created or last erased: BasicInformation is
     * present and every endpoint the root endpoint's PartsList names is installed.  A node with only its root endpoint
     * qualifies.  A node built by hand without a root PartsList needs an endpoint beyond the root.
     *
     * @see {@link MatterSpecification.v161.Core} § 9.2, § 9.5.6.4
     */
    get isSeeded() {
        return this.#isSeeded;
    }

    /**
     * Emits when the node becomes {@link isSeeded}: once after the node is created and once after each erase.
     */
    get seeded() {
        return this.#seeded;
    }

    /**
     * Transitions the node to seeded. No-op if already seeded, so {@link seeded} emits once until {@link resetSeeded}.
     */
    markSeeded(context: ActionContext) {
        if (this.#isSeeded) {
            return;
        }
        this.#isSeeded = true;
        this.#seeded.emit(context);
    }

    /**
     * Forget that the structure was read, as an erase drops it.
     *
     * @internal
     */
    resetSeeded() {
        this.#isSeeded = false;
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

export namespace ClientNodeLifecycle {
    export interface Intent extends NodeLifecycle.Intent {
        readonly isDisabled: boolean;
    }
}
