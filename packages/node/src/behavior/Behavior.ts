/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Agent, INSTALL_BEHAVIOR } from "#endpoint/Agent.js";
import {
    AsyncObservable,
    EventEmitter,
    GeneratedClass,
    MaybePromise,
    NotImplementedError,
    Observable,
    Transaction,
} from "#general";
import { Schema } from "#model";
import type { ClusterType } from "#types";
import { Reactor } from "./Reactor.js";
import type { BehaviorBacking } from "./internal/BehaviorBacking.js";
import { DerivedState, EmptyState } from "./state/StateType.js";
import { BehaviorSupervisor } from "./supervision/BehaviorSupervisor.js";
import { RootSupervisor } from "./supervision/RootSupervisor.js";

// Internal fields
const BACKING = Symbol("endpoint-owner");
const STATE = Symbol("state");
const INTERNAL = Symbol("internal");
const EVENTS = Symbol("events");

interface Internal extends Behavior {
    [BACKING]: BehaviorBacking;
    [STATE]: {};
    [INTERNAL]: {};
    [EVENTS]: EventEmitter;
}

const SUPERVISOR = Symbol("supervisor");

interface StaticInternal {
    [SUPERVISOR]?: RootSupervisor;
}

/**
 * Behavior implements functionality for an Endpoint.  Endpoint agents are implemented as a composition of behaviors.
 *
 * Most behaviors associated 1:1 with a Matter cluster type as implemented by ClusterBehavior.  But you can also extend
 * Behavior directly to add other types of composable logic to an endpoint.
 *
 * You probably want to build your behavior using one of the standard implementations offered by Matter.js.
 */
export abstract class Behavior {
    #agent: Agent;

    /**
     * Each behavior implementation has an ID that uniquely identifies the type of behavior.  An Endpoint may only have
     * one behavior with the specified ID.
     *
     * Endpoint instances store each behavior in a property with the same name as the behavior's ID.
     *
     * EndpointBuilder also uses the ID when replacing behaviors using the with() builder method.
     */
    static readonly id: string;

    /**
     * A behavior's schema controls access to data, commands and events.
     *
     * Schema is inferred from the methods and properties of the behavior but you can specify explicitly for additional
     * control.
     */
    static readonly schema?: Schema;

    /**
     * By default behaviors load lazily as they are accessed.  You can set this flag to true to force behaviors to load
     * immediately when the endpoint initializes.
     */
    static readonly early: boolean = false;

    /**
     * The agent that owns the behavior.
     */
    get agent() {
        return this.#agent;
    }

    /**
     * The endpoint that owns behavior's agent.
     */
    get endpoint() {
        return this.#agent.endpoint;
    }

    /**
     * The context in which the behavior operates.
     */
    get context() {
        return this.#agent.context;
    }

    /**
     * The endpoint's environment.
     */
    get env() {
        return this.endpoint.env;
    }

    /**
     * The Behavior's type.
     */
    get type() {
        return this.constructor as Behavior.Type;
    }

    /**
     * Access the behavior's state.
     */
    declare readonly state: {};

    /**
     * Access the behavior's events.
     */
    declare readonly events: EventEmitter;

    constructor(agent: Agent, backing: BehaviorBacking) {
        this.#agent = agent;
        (this as unknown as Internal)[BACKING] = backing;

        // Note - for introspection instance agent and backing will actually be undefined.  Not represented in types
        // because it would require numerous assertions just to handle internal edge case
        if (agent !== undefined) {
            (agent as unknown as Agent.Internal)[INSTALL_BEHAVIOR](this);
        }
    }

    /**
     * The data supervisor for the behavior.  The supervisor controls validation and access to behavior data.
     */
    static get supervisor(): RootSupervisor {
        if (Object.hasOwn(this, SUPERVISOR)) {
            return (this as StaticInternal)[SUPERVISOR] as RootSupervisor;
        }
        return ((this as StaticInternal)[SUPERVISOR] = BehaviorSupervisor(this));
    }

    /**
     * Implementation of endpoint-scoped state.  Subclasses may override to extend.
     */
    static State = EmptyState;

    /**
     * Implementation of internal state.  Subclasses may override to extend.
     */
    static Internal = EmptyState;

    /**
     * Implementation of the events property.  Subclasses may override to extend.
     */
    static Events = EventEmitter;

    /**
     * Behaviors are ephemeral and should not perform initialization in their constructor.  They can override this
     * method instead.
     *
     * This method may be synchronous or asyncronous.  If asynchronous, the behavior will not be available for external
     * use until initialization completes.
     */
    initialize(_options?: {}): MaybePromise {}

    /**
     * Release resources.  This is the public API for releasing application resources held by behaviors in internal
     * state.
     */
    [Symbol.asyncDispose](): MaybePromise {}

    /**
     * Description used in diagnostic messages.
     */
    toString() {
        return `${this.endpoint}.${this.type.id}`;
    }

    /**
     * Install a {@link Reactor}.
     *
     * Important: The reactor MUST be a real JS function - arrow functions will not work!
     */
    protected reactTo<O extends Observable<any[], any>>(
        observable: O,
        reactor: Reactor<Parameters<O["emit"]>, ReturnType<O["emit"]>>,
        options?: Reactor.Options,
    ) {
        (this as unknown as Internal)[BACKING].reactTo(observable, reactor, options);
    }

    /**
     * Stop reacting to specified conditions.
     *
     * @param selector the observable and/or reactor to disable; if omitted terminates all reaction
     */
    protected stopReacting(selector?: Reactor.Selector) {
        return (this as unknown as Internal)[BACKING].stopReacting(selector);
    }

    /**
     * Create a generic callback function that has the same properties as a {@link Reactor}.
     *
     * Like a reactor, the callback's "this" will be bound to an active Behavior instance.
     * Because of this: The reactor MUST be a real JS function - arrow functions will not work!
     */
    protected callback<A extends any[], R>(reactor: Reactor<A, R>, options?: Reactor.Options) {
        const observable = Observable<A, R>();

        this.reactTo(observable, reactor, options);

        return observable.emit.bind(observable);
    }

    /**
     * Create an async callback.
     *
     * @see {@link callback}
     */
    protected asyncCallback<A extends any[], R>(reactor: Reactor<A, R>, options?: Reactor.Options) {
        const observable = AsyncObservable<A, R>();

        this.reactTo(observable, reactor, options);

        return observable.emit.bind(observable);
    }

    /**
     * Does this behavior support functionality of a specific implementation?
     */
    static supports(other: Behavior.Type) {
        return (this as any) === other || this.prototype instanceof other;
    }

    /**
     * Default state values.
     */
    static get defaults(): Record<string, any> {
        return new this.State();
    }

    /**
     * Create a new behavior with different default state values.
     */
    static set<This extends Behavior.Type>(this: This, defaults: Behavior.InputStateOf<This>) {
        return GeneratedClass({
            name: this.name,
            base: this,

            staticProperties: {
                State: DerivedState({
                    name: `${this.name}$State`,
                    base: this.State,
                    values: defaults,
                }),
            },
        }) as unknown as This;
    }

    /**
     * Explicitly reference other {@link Behavior}s as dependencies, ensuring this behavior is destroyed first.
     *
     * This probably won't be commonly necessary.  If it is we can instrument Agent to collect dependencies
     * automatically.
     */
    static dependencies?: Iterable<Behavior.Type>;

    get [Transaction.Resource.reference]() {
        return (this as unknown as Internal)[BACKING].datasource;
    }
}

// TS prevents us from declaring an override type if the base field is a getter in the class.  So we just declare in the
// base class and manually install the getters here.
Object.defineProperties(Behavior.prototype, {
    state: {
        get(this: Internal) {
            if (!this[STATE]) {
                this[STATE] = this[BACKING].datasource.reference(this.context);
            }
            return this[STATE];
        },

        enumerable: true,
    },

    internal: {
        get(this: Internal) {
            if (!this[INTERNAL]) {
                this[INTERNAL] = this[BACKING].getInternal();
            }
            return this[INTERNAL];
        },

        enumerable: false,
    },

    events: {
        get(this: Internal) {
            if (!this[EVENTS]) {
                this[EVENTS] = this[BACKING].events;
            }
            return this[EVENTS];
        },

        enumerable: true,
    },
});

export namespace Behavior {
    /**
     * Static properties supported by all behaviors.
     */
    export interface Type {
        new (agent: Agent, backing: BehaviorBacking): Behavior;

        readonly name: string;
        readonly id: typeof Behavior.id;
        readonly set: typeof Behavior.set;
        readonly supports: typeof Behavior.supports;
        readonly defaults: Record<string, any>;

        readonly schema?: Schema;
        readonly early: boolean;
        readonly supervisor: RootSupervisor;
        readonly dependencies?: Iterable<Behavior.Type>;
        readonly State: new () => {};
        readonly Internal: new () => {};
        readonly Events: typeof EventEmitter;
    }

    /**
     * This function simply throws NotImplementedError.  More importantly, its presence in any command implementation
     * method informs the endpoint that the command is not implemented.
     */
    export function unimplemented(..._args: any[]): Promise<any> {
        throw new NotImplementedError();
    }

    /**
     * The state type of a behavior {@link Type}.
     */
    export type StateOf<B extends Type> = InstanceType<B["State"]>;

    /**
     * Input variant of StateOf.
     */
    export type InputStateOf<B extends Type> = Partial<StateOf<B>>;

    /**
     * Patch variant of StateOf.
     */
    export type PatchStateOf<B extends Type> = ClusterType.PatchType<StateOf<B>>;

    /**
     * The events type of a behavior {@link Type}.
     */
    export type EventsOf<B extends Type> = InstanceType<B["Events"]>;

    /**
     * Initialization options.
     */
    export type InitializationOptionsOf<B extends Type> =
        Parameters<InstanceType<B>["initialize"]> extends [infer P extends object] ? P : {};

    /**
     * Configuration options you may set when adding a {@link Behavior} to an endpoint.
     */
    export type Options<T extends Behavior.Type = Behavior.Type> = Behavior.InputStateOf<T> &
        Behavior.InitializationOptionsOf<T>;
}
