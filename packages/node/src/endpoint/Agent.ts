/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Behavior } from "#behavior/Behavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { GeneratedClass, MaybePromise } from "#general";
import { hasRemoteActor, Val } from "#protocol";
import { DescriptorBehavior } from "../behaviors/descriptor/DescriptorBehavior.js";
import type { Endpoint } from "./Endpoint.js";
import type { SupportedBehaviors } from "./properties/SupportedBehaviors.js";
import { EndpointType } from "./type/EndpointType.js";

export const INSTALL_BEHAVIOR = Symbol("install-behavior");

/**
 * An Agent offers interaction with a single endpoint.  This is the operational interface to endpoints.  It is separate
 * from the {@link Endpoint} because the agent is context-aware and may be bound to a specific fabric.
 *
 * An endpoint agent manages one or more {@link Behavior} instances that implement a discrete subset of the agent's
 * functionality.
 *
 * Each endpoint agent has an associated {@link Agent.Type} that defines each {@link Behavior.Type} the endpoint
 * supports.
 *
 * {@link Agent.Type} is a permanent feature of an endpoint but agent instances themselves are transitory and there is
 * no guarantee they will exist beyond the lifecycle of a single transaction.
 */
export class Agent {
    #endpoint: Endpoint;
    #context: ActionContext;
    #behaviors = {} as Record<string, Behavior>;

    constructor(endpoint: Endpoint, context: ActionContext) {
        this.#endpoint = endpoint;
        this.#context = context;
    }

    /**
     * Access the {@link Endpoint} this agent acts on behalf of.
     */
    get endpoint() {
        return this.#endpoint;
    }

    /**
     * Access an {@link Agent} for this agent's owner.
     */
    get owner(): Agent | undefined {
        if (this.#endpoint.owner === undefined) {
            return undefined;
        }
        return this.#endpoint.owner.agentFor(this.context);
    }

    /**
     * Access the agent's {@link ActionContext}.
     */
    get context() {
        return this.#context;
    }

    /**
     * Test to see if a {@link Behavior.Type} is supported by this agent.
     */
    has<BehaviorT extends Behavior.Type>(type: BehaviorT): this is InstanceType<BehaviorT> {
        return this.#endpoint.behaviors.has(type);
    }

    /**
     * Obtain a {@link Behavior} supported by this agent.  Throws an error if the {@link Behavior.Type} isn't supported
     * or is still initializing.
     *
     * You may also access behaviors using normal property access, e.g. `agent.descriptor` is the same as
     * `agent.get(DescriptorBehavior)`.
     *
     * Property access is available in TypeScript when the set of behaviors is defined statically.
     */
    get<T extends Behavior.Type>(type: T) {
        let behavior = this.#behaviors[type.id];
        if (!behavior) {
            behavior = this.#endpoint.behaviors.createSync(type, this);
        }
        return behavior as InstanceType<T>;
    }

    /**
     * Obtain a behavior supported by this agent.  Throws an error if the {@link Behavior.Type} isn't supported.  Waits
     * if the behavior is not yet initialized.
     */
    load<T extends Behavior.Type>(type: T): MaybePromise<InstanceType<T>> {
        const behavior = this.#behaviors[type.id];
        if (behavior) {
            return behavior as InstanceType<T>;
        }

        return this.#endpoint.behaviors.createMaybeAsync(type, this) as MaybePromise<InstanceType<T>>;
    }

    /**
     * Trigger initialization of a supported {@link Behavior.Type}.
     *
     * Functionally identical to {@link load} but has no return value and errors are logged rather than thrown.
     */
    activate(type: Behavior.Type) {
        this.#endpoint.behaviors.activate(type, this);
    }

    /**
     * Add support for a {@link Behavior.Type}.
     */
    require<T extends Behavior.Type>(type: T, options?: Behavior.Options<T>) {
        this.#endpoint.behaviors.require(type, options);
    }

    /**
     * Determine whether a behavior is loaded (does not validate class, only by ID).
     */
    isLoaded(type: Behavior.Type) {
        return this.#behaviors[type.id] !== undefined;
    }

    get env() {
        return this.#endpoint.env;
    }

    toString() {
        return this.#endpoint.toString();
    }

    /**
     * Create a new {@link Agent} that supports the specified behaviors.
     */
    static for<T extends EndpointType>(type: EndpointType, behaviors: SupportedBehaviors) {
        const props = {} as PropertyDescriptorMap;
        Object.values(behaviors).forEach(behavior => {
            props[behavior.id] = {
                get(this: Agent) {
                    return this.get(behavior);
                },

                enumerable: true,
            };
        });

        return GeneratedClass({
            name: `${type.name}Agent`,
            base: Agent,
            instanceDescriptors: props,
        }) as Agent.Type<T>;
    }

    /**
     * Execute logic with elevated privileges.
     *
     * Temporarily modifies {@link context} to be a {@link LocalActorContext}.  This bypasses checks associated with the
     * remote subject.
     *
     * Elevated logic effectively ignores ACLs so should be used with care.
     *
     * Note that interactions with the agent will remain elevated until the synchronous completion of this call. You
     * should only elevate privileges for synchronous logic.
     *
     * @param fn the elevated logic
     */
    asLocalActor(fn: () => void) {
        const { context } = this;
        let restoreContext: undefined | (() => void);

        try {
            if (hasRemoteActor(context)) {
                const { fabric, subject } = context;
                restoreContext = () => {
                    Object.assign(context, { fabric, subject });
                };
                delete (context as unknown as Val.Struct).fabric;
                delete (context as unknown as Val.Struct).subject;
                Object.assign(context, { fabric: undefined, subject: undefined });
            }
            fn();
        } finally {
            restoreContext?.();
        }
    }

    [INSTALL_BEHAVIOR](behavior: Behavior) {
        this.#behaviors[(behavior.constructor as Behavior.Type).id] = behavior;
    }
}

export namespace Agent {
    /**
     * Static type for {@link Agent} with a property for each statically defined behavior.
     *
     * Behaviors available at construction time are available as instance properties.  You must use {@link Agent.get} or
     * {@link Agent.require} to acquire behaviors added via {@link Agent.require}.
     */
    export interface Type<T extends EndpointType = EndpointType.Empty> {
        new (endpoint: Endpoint, context: ActionContext): Instance<T>;
    }

    export type Instance<T extends EndpointType = EndpointType.Empty> = Agent & {
        readonly [K in keyof T["behaviors"] & string]: InstanceType<T["behaviors"][K]>;
    } & {
        readonly descriptor: DescriptorBehavior;
    };

    /**
     * Internal interface used by Behavior's constructor to install.
     */
    export interface Internal {
        [INSTALL_BEHAVIOR](behavior: Behavior): void;
    }
}
