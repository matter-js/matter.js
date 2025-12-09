/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import type { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Events } from "#behavior/Events.js";
import { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import {
    camelize,
    Construction,
    describeList,
    Diagnostic,
    EventEmitter,
    Immutable,
    ImplementationError,
    Lifecycle,
    Logger,
    MaybePromise,
    Transaction,
} from "#general";
import { FeatureSet } from "#model";
import { ProtocolService } from "#node/integration/ProtocolService.js";
import { ClusterTypeProtocol, Val } from "#protocol";
import { ClusterType, VoidSchema } from "#types";
import type { Agent } from "../Agent.js";
import type { Endpoint } from "../Endpoint.js";
import { EndpointVariableService } from "../EndpointVariableService.js";
import { BehaviorInitializationError, EndpointBehaviorsError } from "../errors.js";
import { EndpointInitializer } from "./EndpointInitializer.js";
import { EndpointLifecycle } from "./EndpointLifecycle.js";
import type { SupportedBehaviors } from "./SupportedBehaviors.js";

const logger = Logger.get("Behaviors");

export interface SupportedElements {
    features: Set<string>;
    attributes: Set<string>;
    commands: Set<string>;
    events: Set<string>;
}

/**
 * This class manages {@link Behavior} instances owned by a {@link Endpoint}.
 */
export class Behaviors {
    #endpoint: Endpoint;
    #supported: SupportedBehaviors;
    #backings: Record<string, BehaviorBacking> = {};
    #events: Record<string, EventEmitter> = {};
    #options: Record<string, object | undefined>;
    #protocol?: ProtocolService;

    /**
     * The {@link SupportedBehaviors} of the {@link Endpoint}.
     */
    get supported() {
        return this.#supported;
    }

    /**
     * Obtain the specific {@link Behavior.Type} used by the endpoint for implementation if the endpoint supports
     * {@link type}.
     */
    typeFor<T extends Behavior.Type>(type: T): T | undefined {
        const supported = this.#supported[type.id];
        if (!supported) {
            return;
        }

        if (!supported.supports(type)) {
            return undefined;
        }

        return supported as T;
    }

    /**
     * The list of active behaviors.
     */
    get active() {
        return Object.values(this.#backings).map(backing => backing.type);
    }

    get status() {
        const status = {} as Record<string, Lifecycle.Status>;
        for (const key in this.#supported) {
            status[key] = this.#backings[key]?.status ?? Lifecycle.Status.Inactive;
        }
        return status;
    }

    get [Diagnostic.value]() {
        return Diagnostic.lifecycleList(this.status);
    }

    get detailedDiagnostic() {
        return Object.entries(this.#supported).map(([name, type]) => {
            const backing = this.#backings[name];

            const cluster = clusterOf(type);

            const result = [
                Diagnostic(backing?.status ?? Lifecycle.Status.Inactive, name),
                Diagnostic.dict({
                    id: cluster ? Diagnostic.hex(cluster.id) : undefined,
                }),
            ];

            if (!cluster) {
                return result;
            }

            const elements = this.elementsOf(type);
            const elementDiagnostic = Array<unknown>();

            const features = new FeatureSet(cluster.supportedFeatures);
            if (features.size) {
                elementDiagnostic.push([Diagnostic.strong("features"), features]);
            }

            if (elements.attributes.size) {
                const behaviorData = new Array<unknown>();
                for (const attributeName of elements.attributes) {
                    const attr = cluster.attributes[attributeName];
                    behaviorData.push([
                        attributeName,
                        Diagnostic.dict({
                            id: Diagnostic.hex(attr.id),
                            val: (backing?.stateView as Val.Struct)[attributeName],
                            flags: Diagnostic.asFlags({
                                fabricScoped: attr.fabricScoped,
                            }),
                        }),
                    ]);
                }
                elementDiagnostic.push([Diagnostic.strong("attributes"), Diagnostic.list(behaviorData)]);
            }
            if (elements.commands.size) {
                elementDiagnostic.push([
                    Diagnostic.strong("commands"),
                    Diagnostic.list(
                        [...elements.commands].map(name => [
                            name,
                            Diagnostic.weak(
                                `(${Diagnostic.hex(cluster.commands[name].requestId)}${cluster.commands[name].responseSchema instanceof VoidSchema ? "" : `/${Diagnostic.hex(cluster.commands[name].responseId)}`})`,
                            ),
                        ]),
                    ),
                ]);
            }
            if (elements.events.size) {
                elementDiagnostic.push(
                    Diagnostic.strong("events"),
                    Diagnostic.list([
                        [...elements.events].map(name => [
                            name,
                            Diagnostic.weak(`(${Diagnostic.hex(cluster.events[name].id)})`),
                        ]),
                    ]),
                );
            }

            if (elementDiagnostic.length) {
                result.push(Diagnostic.list(elementDiagnostic));
            }

            return result;
        });
    }

    constructor(endpoint: Endpoint, options: Record<string, object | undefined>) {
        const { type } = endpoint;
        if (typeof type?.behaviors !== "object") {
            throw new ImplementationError('EndpointType "behaviors" must be an array of Behavior.Type instances');
        }

        this.#endpoint = endpoint;
        this.#supported = type.behaviors;
        this.#options = options;

        for (const id in this.#supported) {
            const type = this.#supported[id];
            if (!(type.prototype instanceof Behavior)) {
                throw new ImplementationError(`${endpoint}.${id}" is not a Behavior.Type`);
            }
            if (typeof type.id !== "string") {
                throw new ImplementationError(`${endpoint}.${id} has no ID`);
            }
            this.#augmentEndpoint(type);
        }
    }

    /**
     * Activate any behaviors designated for immediate activation.  Returns a promise iff any behaviors have ongoing
     * initialization.
     *
     * Throws an error if any behavior crashes, but we allow all behaviors to settle before throwing.  The goal is to
     * surface multiple configuration errors and prevent inconsistent state caused by partial initialization.
     */
    initialize(): MaybePromise {
        // Sanity check
        if (!this.#endpoint.lifecycle.isInstalled) {
            throw new ImplementationError(`Cannot initialize behaviors because endpoint is not installed`);
        }

        // Initialization action.  We initialize all behaviors in the same transaction
        const initializeBehaviors = (context: ActionContext): MaybePromise => {
            const agent = this.#endpoint.agentFor(context);

            // Activate behaviors
            //
            // TODO - add a timeout on behavior initialization
            for (const type of Object.values(this.supported)) {
                if (type.early) {
                    this.activate(type, agent);
                }
            }

            // Wait for all behaviors to initialize
            let promise = Construction.all(
                {
                    [Symbol.iterator]: () => {
                        return Object.values(this.#backings)[Symbol.iterator]();
                    },
                },

                causes => new EndpointBehaviorsError(causes),
            );

            // Notify other components that participate in initialization
            const endpointInitializer = this.#endpoint.env.get(EndpointInitializer);
            if (promise) {
                promise = promise.then(() => endpointInitializer.behaviorsInitialized(agent));
            } else {
                promise = endpointInitializer.behaviorsInitialized(agent);
            }

            return promise;
        };

        // Initialize instrumentation
        const activity = this.#endpoint.env.get(NodeActivity);

        // Perform initialization
        let promise = LocalActorContext.act(`initialize<${this.#endpoint}>`, initializeBehaviors, {
            activity,
            lifetime: this.#endpoint.construction,
        });

        // Once behaviors are ready the endpoint we consider the endpoint "ready"
        const onReady = () => {
            this.#endpoint.lifecycle.change(EndpointLifecycle.Change.Ready);
        };
        if (promise) {
            promise = promise.then(onReady);
        } else {
            onReady();
        }

        return promise;
    }

    /**
     * Does the {@link Endpoint} support a specified behavior?
     */
    has<T extends Behavior.Type>(type: T): boolean;

    /**
     * Does the {@link Endpoint} support a specified behavior by it's behavior Id?
     */
    has(typeId: string): boolean;

    has(type: Behavior.Type | string): boolean {
        if (typeof type === "string") {
            return !!this.#supported[type];
        }
        const myType = this.#supported[type.id];
        return myType === type || myType?.supports(type);
    }

    /**
     * Add behavior support dynamically at runtime.  Typically called via {@link Agent.require}.
     */
    require<T extends Behavior.Type>(type: T, options?: Behavior.Options<T>) {
        if (this.#supported[type.id]) {
            if (!this.has(type)) {
                throw new ImplementationError(
                    `Cannot require ${this.#endpoint}.${type.id} because incompatible implementation already exists`,
                );
            }
            return;
        }

        this.inject(type, options);
    }

    /**
     * Create a behavior synchronously.  Fails if the behavior is not fully initialized.
     */
    createSync(type: Behavior.Type, agent: Agent) {
        const behavior = this.createMaybeAsync(type, agent);

        if (MaybePromise.is(behavior)) {
            throw new ImplementationError(
                `Synchronous access to ${this.#endpoint}.${type.id} is impossible because it is still initializing`,
            );
        }

        return behavior;
    }

    /**
     * Create a behavior asynchronously.  Waits for the behavior to complete initialization.
     */
    async createAsync(type: Behavior.Type, agent: Agent) {
        return MaybePromise.then(
            () => this.createMaybeAsync(type, agent),
            undefined,
            e => {
                // We log the actual error produced by the backing.  Here we want the error to present as crashed
                // access with a proper stack trace
                const backing = this.#backings[type.id];
                if (!backing) {
                    throw e;
                }
                backing.construction.assert(backing.toString());
            },
        );
    }

    /**
     * Create a behavior, possibly asynchronously.
     *
     * This method returns a {@link Promise} only if await is necessary so the behavior can be used immediately if
     * possible.
     */
    createMaybeAsync(type: Behavior.Type, agent: Agent): MaybePromise<Behavior> {
        this.activate(type, agent);
        const backing = this.#backings[type.id];

        // On first activation the backing will create the behavior to initialize.  Otherwise we need to create now.
        // This function obtains the behavior in both cases
        const getBehavior = () => {
            if (agent.isLoaded(type)) {
                return agent.get(type);
            }
            return backing.createBehavior(agent, type);
        };

        // If the backing initializes asynchronously, return a promise that returns the behavior when initialized
        if (backing.construction.status === Lifecycle.Status.Initializing) {
            return backing.construction
                .then(() => getBehavior())
                .catch(() => {
                    // The backing logs the actual error so here the error should just throw "unavailable due to crash"
                    backing.construction.assert(backing.toString());

                    // Shouldn't get here but catch result type needs to be a behavior
                    return getBehavior();
                });
        }

        // Synchronous construction; first a sanity check
        backing.construction.assert(backing.toString());

        // Return the behavior instance
        return getBehavior();
    }

    /**
     * Activate a behavior.
     *
     * Semantically identical to createAsync() but does not return a {@link Promise} or throw an error.
     *
     * Behaviors that fail initialization will be marked with crashed {@link status}.
     */
    activate(type: Behavior.Type, agent: Agent) {
        if (!this.#backings[type.id]) {
            this.#createBacking(type, agent);
        }
    }

    /**
     * Determine if a specified behavior is supported and active.
     */
    isActive(type: Behavior.Type | string) {
        if (typeof type === "string") {
            return this.#backings[type] !== undefined;
        }

        const backing = this.#backings[type.id];
        return !!backing && backing.type.supports(type);
    }

    /**
     * Destroy all behaviors that are initialized (have backings present).  The object may be reused after close.
     */
    async close() {
        const dispose = async (context: ActionContext) => {
            const agent = this.#endpoint.agentFor(context);

            let destroyNow = new Set(Object.keys(this.#backings));
            while (destroyNow.size) {
                for (const key in this.#backings) {
                    const dependencies = this.#backings[key].type.dependencies;

                    if (!dependencies) {
                        continue;
                    }

                    for (const type of dependencies) {
                        destroyNow.delete(type.id);
                    }

                    if (!destroyNow.size) {
                        throw new ImplementationError("Cannot destroy behaviors due to circular dependency");
                    }
                }

                for (const id of destroyNow) {
                    const backing = this.#backings[id];
                    this.#protocol?.deleteCluster(backing);
                    await this.#backings[id].close(agent);
                    delete this.#backings[id];
                }

                destroyNow = new Set(Object.keys(this.#backings));
            }

            // Commit any state changes that occurred during destruction
            const transaction = agent.context.transaction;
            if (transaction.status === Transaction.Status.Exclusive) {
                await transaction.commit();
            }
        };

        await LocalActorContext.act(
            `close<${this.#endpoint}>`,
            dispose,

            {
                lifetime: this.#endpoint.construction,

                // Note - do not close in an activity because this can cause deadlock
                // activity: this.#endpoint.env.get(NodeActivity),
            },
        );
    }

    /**
     * Add support for an additional behavior.
     *
     * This should generally only be used prior to initialization.  It may cause subtle errors if incompatible types are
     * injected once the endpoint is initialized.
     */
    inject(type: Behavior.Type, options?: Behavior.Options, notify = true) {
        if (options) {
            this.#options[type.id] = options;
        }

        if (this.#supported === this.#endpoint.type.behaviors) {
            this.#supported = { ...this.#supported };
        }

        this.#supported[type.id] = type;

        this.#augmentEndpoint(type);

        if (notify) {
            this.#endpoint.lifecycle.change(EndpointLifecycle.Change.ServersChanged);
        }

        if (!this.#endpoint.lifecycle.isInstalled) {
            return;
        }

        const activeBacking = this.#backings[type.id];
        if (activeBacking) {
            activeBacking.type = type;
        } else if (type.early) {
            this.#activateLate(type);
        }
    }

    /**
     * Drop support for a behavior.
     *
     * This is intended for synchronization with peers and should not be used for servers as Matter does not allow an
     * endpoint to change its set of supported clusters.
     */
    drop(id: string): MaybePromise<void> {
        const supported = this.#supported[id];
        if (!supported) {
            return;
        }

        delete this.#supported[id];

        let promise: undefined | MaybePromise<void>;
        const backing = this.#backings[id];
        if (backing) {
            logger.warn(`Removing ${backing} from active endpoint`);
            promise = backing.close();
        }

        this.#endpoint.lifecycle.change(EndpointLifecycle.Change.ServersChanged);

        return promise;
    }

    /**
     * Ensure a set of behavior requirements are met.  Throws an error detailing missing requirements.
     */
    validateRequirements(requirements?: SupportedBehaviors) {
        if (!requirements) {
            return;
        }

        const missing = Array<string>();
        for (const requirement of Object.values(requirements)) {
            let name = camelize(requirement.name, true);

            if (this.#endpoint.behaviors.has(requirement)) {
                continue;
            }

            // For ClusterBehaviors, accept any behavior that supports the cluster.  Could confirm features too but
            // doesn't currently
            const cluster = clusterOf(requirement);
            if (cluster) {
                const other = this.#endpoint.behaviors.supported[requirement.id];

                if (clusterOf(other)?.id === cluster.id) {
                    continue;
                }

                name = `${name} (${Diagnostic.hex(cluster.id)})`;
            }

            missing.push(name);
        }

        if (missing.length) {
            throw new ImplementationError(
                `${this.#endpoint} is missing required behaviors: ${describeList("and", ...missing)}`,
            );
        }
    }

    /**
     * Obtain default values for a behavior.  This is state values as present when the behavior is first initialized for
     * a new endpoint.
     */
    defaultsFor(type: Behavior.Type) {
        let defaults: Val.Struct | undefined;

        // Set defaults from options
        const options = this.#options[type.id];
        if (options) {
            for (const key in type.defaults) {
                if (key in options) {
                    if (!defaults) {
                        defaults = {};
                    }
                    defaults[key] = (options as Val.Struct)[key];
                }
            }
        }

        // Set defaults from environmental configuration
        const varService = this.#endpoint.env.get(EndpointVariableService);
        const vars = varService.forBehaviorInstance(this.#endpoint, type);
        if (vars !== undefined) {
            defaults = { ...defaults, ...(type.supervisor.cast(vars) as Val.Struct) };
        }

        return defaults;
    }

    /**
     * Retrieve the options for a behavior type provided to the endpoint.
     */
    optionsFor(type: Behavior.Type) {
        return this.#options[type.id];
    }

    /**
     * Access internal state for a {@link Behavior}.
     *
     * Internal state is not stable API and not intended for consumption outside of the behavior.  However it is not
     * truly private and may be accessed by tightly coupled implementation.
     *
     * As this API is intended for use by "friendly" code, it does not perform the same initialization assertions as
     * does access to {@link Behavior.State} and {@link Behavior.Events}.
     */
    internalsOf<T extends Behavior.Type>(type: T) {
        const backing = this.#backingFor(type);
        return backing.getInternal() as InstanceType<T["Internal"]>;
    }

    /**
     * Obtain current data version of behavior.
     */
    versionOf(type: Behavior.Type): number;

    /**
     * Obtain current data version of behavior by its behavior Id, if existing
     */
    versionOf(typeId: string): number | undefined;

    versionOf(type: Behavior.Type | string) {
        if (typeof type === "string") {
            const backing = this.#backings[type];
            return backing?.maybeDatasource?.version;
        }
        const backing = this.#backingFor(type);
        return backing.datasource.version;
    }

    /**
     * Access elements supported by a behavior.
     */
    elementsOf(type: Behavior.Type): SupportedElements {
        if (!this.has(type)) {
            throw new ImplementationError(`Endpoint ${this.#endpoint} does not support behavior ${type.id}`);
        }

        const elements = this.#backingFor(type).elements;
        if (elements === undefined) {
            throw new ImplementationError(
                `Endpoint ${this.#endpoint} behavior ${type.id} elements accessed before initialization`,
            );
        }

        return elements;
    }

    /**
     * Access the state view of a behavior if loaded.
     */
    maybeStateOf(behaviorId: string): Immutable<Val.Struct> | undefined {
        const backing = this.#backings[behaviorId];
        return backing?.maybeDatasource?.view;
    }

    [Symbol.iterator]() {
        return Object.values(this.#supported)[Symbol.iterator]();
    }

    #activateLate(type: Behavior.Type) {
        const result = LocalActorContext.act(
            "behavior-late-activation",
            context => {
                this.activate(type, this.#endpoint.agentFor(context));

                // Agent must remain active until backing is initialized
                const backing = this.#backingFor(type);
                return backing.construction.ready;
            },
            { activity: this.#endpoint.env.get(NodeActivity), lifetime: this.#endpoint.construction },
        );

        if (MaybePromise.is(result)) {
            result.then(undefined, error => {
                // The backing should handle its own errors so if present assume this is a commit error and crash the
                // backing.  If there's no backing then there shouldn't be a promise so this is effectively an internal
                // error
                const backing = this.#backings[type.id];
                if (error instanceof BehaviorInitializationError) {
                    logger.error(error);
                } else if (backing) {
                    logger.error(`Error initializing ${backing}:`, error);
                } else {
                    logger.error(`Unexpected rejection initializing ${type.name}:`, error);
                }
            });
        }
    }

    /**
     * Create a read-only online view of a behavior.
     */
    createOnlineView(type: Behavior.Type) {
        return this.#backingFor(type).datasource;
    }

    /**
     * Obtain a backing for a behavior.
     */
    #backingFor(type: Behavior.Type) {
        // Crash if endpoint is not initialized
        if (this.#endpoint.construction.status !== Lifecycle.Status.Initializing) {
            this.#endpoint.construction.assert(this.#endpoint.toString(), `behavior ${type.id}`);
        }

        // Obtain backing
        let backing = this.#backings[type.id];

        // If backing is not already initialized, attempt late initialization
        if (!backing) {
            this.#activateLate(type);
            backing = this.#backings[type.id];
            if (backing === undefined) {
                throw new BehaviorInitializationError(`${this.#endpoint}.${type.id}`, "initialization failed");
            }
        }

        return backing;
    }

    #createBacking(type: Behavior.Type, agent: Agent) {
        // Ensure the type is supported.  If it is, we instantiate with our type rather than the specified type because
        // our type might be an extension
        const myType = this.#getBehaviorType(type);
        if (!myType) {
            throw new BehaviorInitializationError(`Initializing ${this.#endpoint}.${type.id}: Unsupported behavior`);
        }

        const backing = this.#endpoint.env.get(EndpointInitializer).createBacking(this.#endpoint, myType);
        this.#backings[backing.type.id] = backing;

        // The EndpointInitializer may choose to replace the behavior implementation.  If so the replacement should be
        // compatible, but update our support map to designate the specific implementation
        if (backing.type !== myType) {
            this.#supported[backing.type.id] = backing.type;
        }

        if (!this.#protocol) {
            this.#protocol = this.#endpoint.env.get(ProtocolService);
        }
        backing.initializeDataSource();
        backing.construction.start(agent);
        return backing;
    }

    #getBehaviorType(type: Behavior.Type) {
        const myType = this.#supported[type.id];

        if (myType === undefined) {
            return myType;
        }

        if (typeof myType !== "function" || !(myType.prototype instanceof Behavior)) {
            throw new ImplementationError(`Endpoint behavior "${type.id}" implementation is not a Behavior`);
        }

        return myType;
    }

    /**
     * Updates endpoint "state" and "events" properties to include properties for a supported behavior.
     */
    #augmentEndpoint(type: Behavior.Type) {
        const { id, Events } = type;

        const get = () => this.#backingFor(type).stateView;
        Object.defineProperty(this.#endpoint.state, id, { get, enumerable: true });
        if (type.schema.id !== undefined) {
            Object.defineProperty(this.#endpoint.state, type.schema.id, { get });
        }

        Object.defineProperty(this.#endpoint.events, id, {
            get: () => {
                let events = this.#events[id];
                if (!events) {
                    events = this.#events[id] = new Events();

                    if (typeof (events as Events).setContext === "function") {
                        (events as Events).setContext(this.#endpoint, type);
                    }
                }
                return events;
            },

            enumerable: true,
        });
    }
}

function clusterOf(behavior?: Behavior.Type): ClusterType | undefined {
    return (behavior as ClusterBehavior.Type)?.cluster;
}

export namespace Behaviors {
    export interface ProtocolContext {
        descriptor: ClusterTypeProtocol;
        datasource: Datasource;
    }
}
