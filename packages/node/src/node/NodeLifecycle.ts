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
    #lastTicket = 0;
    #isTargetRequested = false;
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
     * Emits when the network runtime of the node is about to stop, whether or not the node went online.  {@link
     * offline} follows only if it did.
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
     * Mutex for protecting node lifecycle transitions, the node mutex.
     *
     * {@link Node.start}, {@link Node.stop} and the lifecycle verbs of the node hold this mutex.  The verbs of the
     * node's other endpoints do not; they hold {@link treeMutex}, which the verbs of the node take after this one.
     * See {@link LifecycleMutex} for the lock order.
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
     * What the last call of `start()`, `stop()`, `enable()` or `disable()` asked for, or what the node is if that call
     * failed.  A call records its intent with {@link request} before it waits for its turn.  The auto-start of the
     * server node gives the target online with {@link autoStart} unless a call asked for a target.
     *
     * | event                              | intent after                    | target asked for after |
     * |------------------------------------|---------------------------------|------------------------|
     * | {@link request}                    | the change applied              | true if it has target  |
     * | {@link autoStart}, target not asked | target online                  | unchanged (false)      |
     * | {@link autoStart}, target asked    | unchanged                       | unchanged (true)       |
     * | {@link restore} of the last call   | what the node is                | false                  |
     * | {@link restore} of an earlier call | unchanged                       | unchanged              |
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
     * Record the intent of a call.  The returned ticket names the call in {@link restore}.
     *
     * @internal
     */
    request(change: Partial<I>): NodeLifecycle.IntentTicket {
        if ("target" in change) {
            this.#isTargetRequested = true;
        }
        this.#setIntent({ ...this.#intent, ...change });
        return ++this.#lastTicket;
    }

    /**
     * Give the node the target online for the auto-start of its server node, unless a call asked for a target.  Emits
     * {@link intentChanged} only if the target changes.
     *
     * @internal
     */
    autoStart() {
        if (!this.#isTargetRequested && this.#intent.target !== "online") {
            this.#setIntent({ ...this.#intent, target: "online" });
        }
    }

    /**
     * Set the intent to what the node is, {@link applied}, after the call of {@link ticket} failed, unless a later call
     * recorded an intent meanwhile.  The auto-start applies again afterwards.  Returns whether the intent was restored.
     *
     * @internal
     */
    restore(ticket: NodeLifecycle.IntentTicket, applied: I) {
        if (ticket !== this.#lastTicket) {
            return false;
        }
        this.#isTargetRequested = false;
        this.#setIntent(applied);
        return true;
    }

    /**
     * Take over the values of {@link change} without a call asking for them.  Emits {@link intentChanged} only if a
     * value changes.
     */
    protected adopt(change: Partial<I>) {
        for (const key in change) {
            if (change[key] !== this.#intent[key]) {
                this.#setIntent({ ...this.#intent, ...change });
                return;
            }
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
     * Names the call of {@link NodeLifecycle.request} that recorded an intent.
     */
    export type IntentTicket = number;
}
