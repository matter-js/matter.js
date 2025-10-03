/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Migration } from "#behavior/state/migrations/Migration.js";
import type { Agent } from "#endpoint/Agent.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { BehaviorInitializationError } from "#endpoint/errors.js";
import type { SupportedElements } from "#endpoint/properties/Behaviors.js";
import {
    Construction,
    Crypto,
    EventEmitter,
    ImplementationError,
    InternalError,
    Lifecycle,
    Logger,
    MaybePromise,
    Observable,
} from "#general";
import { ProtocolService } from "#node/server/ProtocolService.js";
import type { ClusterId } from "#types";
import type { Behavior } from "../Behavior.js";
import { Reactor } from "../Reactor.js";
import { Datasource } from "../state/managed/Datasource.js";
import { BackingEvents } from "./BackingEvents.js";
import { Reactors } from "./Reactors.js";

const logger = Logger.get("BehaviorBacking");

/**
 * The "backing" for a behavior manages those portions of behavior that endure for the lifetime of an endpoint.
 */
export abstract class BehaviorBacking {
    #endpoint: Endpoint;
    #type: Behavior.Type;
    #internal?: object;
    #events?: EventEmitter;
    #options?: Behavior.Options;
    #datasource?: Datasource;
    #reactors?: Reactors;
    #construction: Construction<BehaviorBacking>;

    get construction() {
        return this.#construction;
    }

    constructor(endpoint: Endpoint, type: Behavior.Type, store: Datasource.Store, options?: Behavior.Options) {
        this.#endpoint = endpoint;
        this.#type = type;
        this.store = store;
        this.#options = options;

        this.#construction = Construction(this);
        this.#construction.onError(error => {
            // The endpoint reports errors during initialization.  For errors occurring later we report the error
            // ourselves
            if (endpoint.lifecycle.isReady) {
                if (error instanceof BehaviorInitializationError) {
                    logger.error(error);
                } else {
                    logger.error(`Error initializing ${this}:`, error);
                }
            }
        });
    }

    toString() {
        return this.path.toString();
    }

    get path() {
        return this.#endpoint.path.at(this.type.id);
    }

    /**
     * Initialize state by applying values from options and invoking the behavior's initialize() function.
     *
     * Initiated via {@link Construction#start} by Behaviors class once the backing is installed.
     */
    [Construction.construct](agent: Agent) {
        let crashError: undefined | BehaviorInitializationError;
        const crash = (cause: unknown) => {
            if (!crashError) {
                crashError = new BehaviorInitializationError(`Error initializing ${this}`, cause);
            }
            throw crashError;
        };

        try {
            // We use this behavior for initialization.  Do not use agent.get() to access the behavior because it
            // will throw if the behavior isn't initialized
            const behavior = this.#lifecycleInstance(agent);

            // Perform actual initialization
            const promise = this.invokeInitializer(behavior, this.#options);
            return MaybePromise.then(promise, () => this.#endpoint.env.get(ProtocolService).addCluster(this), crash);
        } catch (e) {
            crash(e);
        }
    }

    initializeDataSource() {
        if (this.#datasource) {
            return;
        }

        if (this.store.initialValues !== undefined) {
            Migration.migrate(this.type, this.store.initialValues);
        }

        this.#datasource = Datasource(this.datasourceOptions);
    }

    /**
     * Destroy the backing.
     */
    close(agent: Agent, invokeClose = true) {
        const initialized = this.construction.status === Lifecycle.Status.Active;
        if (!initialized) {
            invokeClose = false;
        }

        return this.construction.close(() => {
            let result = MaybePromise.then(
                () => this.#reactors?.close(),
                () => {
                    this.#reactors = undefined;
                },
            );

            if (invokeClose) {
                result = MaybePromise.then(result, () => this.#invokeClose(agent));
            }

            return result;
        });
    }

    /**
     * Set state from options and invoke {@link Behavior.invokeInitializer}.
     *
     * This is an optional extension point for derivatives.  Errors thrown here are recorded and place the behavior into
     * crashed state.
     */
    protected invokeInitializer(behavior: Behavior, options?: Behavior.Options) {
        return behavior.initialize(options);
    }

    /**
     * The {@link Endpoint} that owns the behavior.
     */
    get endpoint() {
        return this.#endpoint;
    }

    /**
     * The {@link Behavior.Type} backed.
     */
    get type() {
        return this.#type;
    }

    /**
     * Create an instance of the backed {@link Behavior}.
     *
     * Derivatives may override to perform additional setup beyond simple instantiation.
     */
    createBehavior(agent: Agent, type: Behavior.Type) {
        const behavior = new this.#type(agent, this);
        if (behavior instanceof type) {
            return behavior;
        }

        throw new ImplementationError(
            `Cannot create ${this.#endpoint}.${type.id} because installed implementation is incompatible`,
        );
    }

    /**
     * The source of raw data that backs managed state instances.
     */
    get datasource() {
        if (!this.#datasource) {
            throw new InternalError("Datasource not yet initialized");
        }
        return this.#datasource;
    }

    /**
     * Access the datasource if present.
     */
    get maybeDatasource() {
        return this.#datasource;
    }

    protected get datasourceOptions(): Datasource.Options {
        return {
            crypto: this.#endpoint.env.get(Crypto),
            location: {
                path: this.#endpoint.path.at(this.#type.id).at("state"),
                endpoint: this.#endpoint.number,
                cluster: this.type.schema?.tag === "cluster" ? (this.type.schema.id as ClusterId) : undefined,
            },
            supervisor: this.type.supervisor,
            type: this.type.State,
            events: this.events as unknown as Datasource.Events,
            defaults: this.#endpoint.behaviors.defaultsFor(this.type),
            store: this.store,
            owner: this.#endpoint,
        };
    }

    /**
     * The data provider for {@link datasource}.
     */
    protected readonly store: Datasource.Store;

    /**
     * Obtain internal state for a behavior instance.
     */
    getInternal() {
        if (!this.#internal) {
            this.#internal = new this.#type.Internal();
        }

        return this.#internal;
    }

    /**
     * Access the event object.  Unlike state, the events object does not vary by instance.
     */
    get events() {
        if (!this.#events) {
            this.#events = BackingEvents(this);
        }
        return this.#events;
    }

    /**
     * The status of the behavior.
     */
    get status() {
        return this.construction.status;
    }

    /**
     * A read-only offline view of behavior state.
     */
    get stateView() {
        return this.datasource.view ?? {};
    }

    /**
     * Supported elements.
     */
    abstract readonly elements: SupportedElements | undefined;

    /**
     * Install a reactor.
     */
    reactTo<O extends Observable<any[], any>>(
        observable: O,
        reactor: Reactor<Parameters<O["emit"]>, ReturnType<O["emit"]>>,
        options?: Reactor.Options,
    ) {
        if (!this.#reactors) {
            this.#reactors = new Reactors(this);
        }
        this.#reactors.add(observable, reactor, options);
    }

    /**
     * Terminate reactions.
     */
    async stopReacting(selector?: { observable?: Observable; reactor?: Reactor }) {
        if (this.#reactors === undefined) {
            return;
        }

        if (selector?.observable === undefined && selector?.reactor === undefined) {
            await this.#reactors.close();
            this.#reactors = undefined;
            return;
        }

        await this.#reactors.remove(selector);
    }

    /**
     * Invoke {@link Behavior.destroy} to clean up application logic.
     */
    #invokeClose(agent: Agent): MaybePromise {
        // Do not use Agent.get because backing is in "destroying" state
        const behavior = this.#lifecycleInstance(agent);

        return MaybePromise.finally(
            () =>
                MaybePromise.then(
                    () => behavior?.[Symbol.asyncDispose](),
                    undefined,
                    e => logger.error(`Destroying ${this}:`, e),
                ),
            () => this.#events?.[Symbol.dispose](),
        );
    }

    /**
     * Obtain a behavior instance for lifecycle methods (initialize and close).
     *
     * Under these circumstances we can't use {@link Agent.get} because it will throw if the endpoint is initializing
     * or closing.
     *
     * Instead we use a "friend" method of agent to retrieve any existing behavior or create a new one.
     */
    #lifecycleInstance(agent: Agent) {
        if (agent.isLoaded(this.#type)) {
            return agent.get(this.#type);
        }
        const behavior = this.createBehavior(agent, this.#type);
        return behavior;
    }
}
