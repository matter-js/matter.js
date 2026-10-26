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
export class NodeLifecycle<I extends NodeLifecycle.Intent = NodeLifecycle.Intent> extends EndpointLifecycle {
    #online = AsyncObservable<[context: ActionContext]>();
    #goingOffline = AsyncObservable<[context: ActionContext]>();
    #offline = AsyncObservable<[context: ActionContext]>();
    #commissioned = Observable<[context: ActionContext]>();
    #decommissioned = Observable<[context: ActionContext]>();
    #initialized = Observable<[isCommissioned: boolean]>();
    #onlineAt?: Date;
    #isCommissioned = false;
    #intent: I;
    #lastRequest = 0;
    #isAsked = false;
    #intentChanged = Observable<[]>();
    #mutex: LifecycleMutex;

    constructor(endpoint: Endpoint, intent: I) {
        super(endpoint);

        this.#intent = intent;
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
     * Emits when the network runtime of the node is about to stop, whether or not the node went online.  {@link offline}
     * follows only if it did.
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

    /**
     * What the last call of `start()`, `stop()` or a call that changes the target like them asked for, or what the node
     * is if that call failed.  A call records its whole intent before it waits for its turn.  Before the first call it
     * is what {@link seedIntent} adopted.  After a last call that failed it is what the node is, until
     * {@link seedIntent} adopts values again.
     *
     * @internal
     */
    get intent(): Readonly<I> {
        return this.#intent;
    }

    /**
     * Emits when {@link intent} changes.
     *
     * @internal
     */
    get intentChanged() {
        return this.#intentChanged;
    }

    /**
     * Record the intent of a call.  The returned request names the call in {@link restoreIntent}.  A call that keeps
     * the target asks for none, so {@link seedIntent} still adopts a target unless an earlier call asked for one.
     *
     * @internal
     */
    recordIntent(change: Partial<I>, options?: { keepsTarget?: boolean }): NodeLifecycle.IntentRequest {
        this.#setIntent({ ...this.#intent, ...change });
        if (!options?.keepsTarget) {
            this.#isAsked = true;
        }
        return ++this.#lastRequest;
    }

    /**
     * Set the intent to what the node is, {@link applied}, after the call of {@link request} failed, unless a later
     * call recorded an intent meanwhile.  A restored intent was not asked for, so {@link seedIntent} applies again.
     *
     * @internal
     */
    restoreIntent(request: NodeLifecycle.IntentRequest, applied: I) {
        if (request === this.#lastRequest) {
            this.#setIntent(applied);
            this.#isAsked = false;
        }
    }

    /**
     * Adopt intent values that hold until a call records an intent: the persisted part when the node loads, or the
     * online intent the auto-start of its server node gives.  Does nothing while the intent is what a call asked for.
     *
     * @internal
     */
    seedIntent(seed: Partial<I>) {
        if (!this.#isAsked) {
            this.#setIntent({ ...this.#intent, ...seed });
        }
    }

    #setIntent(intent: I) {
        this.#intent = intent;
        this.#intentChanged.emit();
    }

    /**
     * Whether the node should be online: it was started, not stopped, and no close or delete was requested.
     */
    get shouldBeOnline() {
        return this.#intent.target === "online" && !this.isTerminal;
    }

    get shouldBeOffline() {
        return !this.shouldBeOnline;
    }
}

export namespace NodeLifecycle {
    /**
     * The state a node should be in.
     */
    export type TargetState = "online" | "offline";

    /**
     * What a node should be.
     */
    export interface Intent {
        readonly target: TargetState;
    }

    /**
     * Names the call of {@link NodeLifecycle.recordIntent} that recorded an intent.
     */
    export type IntentRequest = number;
}
