/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { ContextAgents } from "#behavior/context/server/ContextAgents.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import {
    Construction,
    Diagnostic,
    Environment,
    Immutable,
    ImplementationError,
    Lifecycle,
    Logger,
    MaybePromise,
    Observable,
    toHex,
    UninitializedDependencyError,
} from "#general";
import { DataModelPath } from "#model";
import { ProtocolService } from "#node/integration/ProtocolService.js";
import type { Node } from "#node/Node.js";
import { IdentityService } from "#node/server/IdentityService.js";
import { Val } from "#protocol";
import { EndpointNumber } from "#types";
import { RootEndpoint } from "../endpoints/root.js";
import { Agent } from "./Agent.js";
import { Behaviors } from "./properties/Behaviors.js";
import { Commands } from "./properties/Commands.js";
import { EndpointContainer } from "./properties/EndpointContainer.js";
import { EndpointInitializer } from "./properties/EndpointInitializer.js";
import { EndpointLifecycle } from "./properties/EndpointLifecycle.js";
import { Parts } from "./properties/Parts.js";
import { SupportedBehaviors } from "./properties/SupportedBehaviors.js";
import { EndpointType } from "./type/EndpointType.js";

const logger = Logger.get("Endpoint");

/**
 * Endpoints consist of a hierarchy of parts.  This class manages the current state of a single endpoint.
 *
 * You can interact with endpoints using an {@link Agent} created with {@link Endpoint.agentFor}.  Agents are stateless and
 * designed for quick instantiation so you can create them as needed then discard.
 *
 * Most often direct access to {@link Agent} is transparent as Matter.js acquires an agent as necessary for
 * {@link Behavior} interactions.
 */
export class Endpoint<T extends EndpointType = EndpointType.Empty> {
    #type: EndpointType;
    #id?: string;
    #number?: EndpointNumber;
    #owner?: Endpoint;
    #agentType?: Agent.Type<T>;
    #behaviors: Behaviors;
    #lifecycle: EndpointLifecycle;
    #parts?: Parts;
    #construction: Construction<Endpoint<T>>;
    #stateView = {} as Immutable<SupportedBehaviors.StateOf<T["behaviors"]>>;
    #events = {} as SupportedBehaviors.EventsOf<T["behaviors"]>;
    #commands?: Commands<T>;
    #activity?: NodeActivity;

    /**
     * A string that uniquely identifies an endpoint.
     *
     * This ID must be unique amongst all Parts with the same owner.
     */
    get id() {
        if (this.#id === undefined) {
            throw new UninitializedDependencyError(
                this.toString(),
                "endpoint ID is not yet assigned; set ID or await endpoint.construction to avoid this error",
            );
        }
        return this.#id;
    }

    /**
     * The endpoint ID or undefined if not yet assigned.
     */
    get maybeId() {
        return this.#id;
    }

    /**
     * The Matter {@link EndpointNumber} of the endpoint.  This uniquely identifies the {@link Endpoint} in the scope of the
     * Matter node.
     */
    get number(): EndpointNumber {
        if (this.#number === undefined) {
            throw new UninitializedDependencyError(
                this.toString(),
                "endpoint number is not yet assigned; set number or await endpoint.construction to avoid this error",
            );
        }
        return this.#number;
    }

    /**
     * The endpoint number or undefined if not yet assigned.
     */
    get maybeNumber() {
        return this.#number;
    }

    /**
     * The owner of the endpoint.
     *
     * Every endpoint but the root endpoint (the "server node") is owned by another endpoint.
     */
    get owner(): Endpoint | undefined {
        return this.#owner;
    }

    /**
     * Access an {@link Agent} for this endpoint.
     *
     * An {@link Agent} allows you to interact directly with the behaviors supported by the endpoint.  Normally you
     * would use {@link act} to obtain an agent but {@link agentFor} is useful if you need to interact with multiple
     * endpoints in the same context.
     */
    agentFor<T extends EndpointType>(this: Endpoint<T>, context: ActionContext) {
        return ContextAgents(context).agentFor(this);
    }

    get endpointProtocol() {
        if (this.#number === undefined || !this.env.has(ProtocolService)) {
            return undefined;
        }
        return this.env.get(ProtocolService).protocol[this.#number];
    }

    /**
     * Search for the owner of a specific type.
     *
     * Returns undefined if this owner is not found on the way up to the root endpoint.
     */
    ownerOfType<T extends EndpointType.Empty>(type: T): Endpoint<T> | undefined {
        for (let endpoint: Endpoint | undefined = this; endpoint !== undefined; endpoint = endpoint.owner) {
            if (endpoint.type.deviceType === type.deviceType) {
                return endpoint as Endpoint<T>;
            }
        }
    }

    /**
     * The endpoint's environment.  Endpoint implementations use the environment to access platform components such as
     * storage and network components.
     */
    get env(): Environment {
        if (this.owner) {
            return this.owner.env;
        }
        return Environment.default;
    }

    /**
     * Access the pool of behaviors supported by this endpoint.
     */
    get behaviors() {
        return this.#behaviors;
    }

    /**
     * Current state values for all behaviors, keyed by behavior ID.  This view is read-only.
     */
    get state() {
        return this.#stateView;
    }

    /**
     * Current state for a specific behavior ID.
     *
     * Be aware that using a string type does not provide type checking and does not enforce the correctness of the used
     * Behavior type including all enabled features. Because of this the returned state is typed as a plain string
     * indexed record (Val.Struct). Please ensure to have proper checks in place when using this method with string type.
     */
    stateOf(type: string): Immutable<Val.Struct>;

    /**
     * Current state for a specific behavior.
     *
     * This is the recommended way to access state for a specific behavior because it provides proper type checking
     * and enforces the correctness of the used Behavior type including all enabled features.
     */
    stateOf<T extends Behavior.Type>(type: T): Immutable<Behavior.StateOf<T>>;

    stateOf(type: Behavior.Type | string) {
        if (typeof type === "string") {
            if (!(type in this.#stateView)) {
                throw new ImplementationError(`Behavior ${type} is not supported by ${this}`);
            }
        } else {
            if (!this.behaviors.has(type)) {
                throw new ImplementationError(`Behavior ${type.id} is not supported by ${this}`);
            }
            type = type.id;
        }
        return (this.#stateView as Record<string, unknown>)[type];
    }

    /**
     * Update state values.  This is a patch operation; it only modifies properties in {@link values}.
     *
     * {@link values} is an object with a {@link Behavior.id} as the key and state values as sub-objects.
     *
     * Input values must adhere to the {@link Behavior.schema} of the target {@link Behavior}.  If not, set will throw
     * an error.
     *
     * This is a transactional operation.  An error results in no change.  The endpoint will wait for exclusive access
     * before applying changes.
     *
     * @param values the values to change
     */
    async set(values: SupportedBehaviors.StatePatchOf<T["behaviors"]>) {
        await this.act(`set<${this}>`, async agent => {
            const tx = agent.context.transaction;

            await tx.begin();

            for (const behaviorId in values) {
                const behavior = agent[behaviorId];
                if (!(behavior instanceof Behavior)) {
                    throw new ImplementationError(`Behavior ID ${behaviorId} does not exist`);
                }

                const vals = values[behaviorId];
                if (vals === undefined) {
                    continue;
                }

                await tx.addResources(behavior);

                const patch = behavior.type.supervisor.patch;

                if (typeof vals !== "object") {
                    throw new ImplementationError(
                        `State values for ${behaviorId} must be an object, not ${typeof vals}`,
                    );
                }

                if (vals instanceof Date) {
                    throw new ImplementationError(
                        `State values for ${behaviorId} must be an object, not ${vals.constructor.name}`,
                    );
                }

                if (Array.isArray(vals)) {
                    throw new ImplementationError(`State value for ${behaviorId} must be an object, not an array`);
                }

                patch(vals, behavior.state, this.path);
            }
        });
    }

    /**
     * Update state values for a single behavior.
     *
     * The patch semantics used here are identical to {@link set}.
     *
     * This is the recommended way to set state for a single behavior because it provides proper type checking and
     * enforces the correctness of the used Behavior type including all enabled features.
     *
     * @param type the {@link Behavior} to patch
     * @param values the values to change
     */
    async setStateOf<T extends Behavior.Type>(type: T, values: Behavior.PatchStateOf<T>): Promise<void>;

    /**
     * Update state values for a single behavior ID.
     *
     * The patch semantics used here are identical to {@link set}.
     *
     * Be aware that using a string type does not provide type checking and does not enforce the correctness of the used
     * Behavior type including all enabled features. Expect runtime errors if the provided values are not compatible
     * with the actual Behavior type.
     *
     * @param type the {@link Behavior} to patch
     * @param values the values to change
     */
    async setStateOf(type: string, values: Val.Struct): Promise<void>;

    async setStateOf(type: Behavior.Type | string, values: Val.Struct) {
        if (typeof type === "string") {
            const foundType = this.behaviors.active.find(b => b.id === type);
            if (foundType === undefined) {
                throw new ImplementationError(`Behavior ${type} is not active on by this endpoint`);
            }
            type = foundType;
        }

        await this.act(`setStateOf<${this}>`, async agent => {
            const behavior = agent.get(type);

            const tx = agent.context.transaction;
            await tx.begin();
            await tx.addResources(behavior);

            const patch = behavior.type.supervisor.patch;

            if (typeof values !== "object") {
                throw new ImplementationError(`State values for ${type.id} must be an object, not ${typeof values}`);
            }
            if (values instanceof Date) {
                throw new ImplementationError(
                    `State values for ${type.id} must be an object, not ${values.constructor.name}`,
                );
            }
            if (Array.isArray(values)) {
                throw new ImplementationError(`State values for ${type.id} must be an object, not an array`);
            }

            patch(values, behavior.state, this.path);
        });
    }

    /**
     * Commands for all behaviors keyed by behavior ID.
     */
    get commands() {
        if (this.#commands === undefined) {
            this.#commands = Commands(this);
        }
        return this.#commands;
    }

    /**
     * Commands for a specific behavior.
     */
    commandsOf<T extends Behavior.Type>(type: T) {
        if (!this.behaviors.has(type)) {
            throw new ImplementationError(`Behavior ${type.id} is not supported by this endpoint`);
        }
        return this.commands[type.id] as unknown as Commands.OfBehavior<T>;
    }

    /**
     * Events for all behaviors keyed by behavior ID.
     */
    get events() {
        return this.#events;
    }

    /**
     * Events for a specific behavior ID.
     *
     * Be aware that using a string type does not provide type checking and does not enforce the correctness of the used
     * Behavior type including all enabled features. Because of this each event is typed as Observable | undefined.
     * Please ensure to have proper checks in place when using this method with string type.
     */
    eventsOf(type: string): Immutable<Record<string, Observable | undefined>>;

    /**
     * Events for a specific behavior.
     *
     * This is the recommended way to access events for a specific behavior because it provides proper type checking
     * and enforces the correctness of the used Behavior type including all enabled features.
     */
    eventsOf<T extends Behavior.Type>(type: T | string): Behavior.EventsOf<T>;

    eventsOf(type: Behavior.Type | string): unknown {
        if (typeof type === "string") {
            if (!(type in this.#stateView)) {
                throw new ImplementationError(`Behavior ${type} is not supported by ${this}`);
            }
        } else {
            if (!this.behaviors.has(type)) {
                throw new ImplementationError(`Behavior ${type.id} is not supported by this endpoint`);
            }
            type = type.id;
        }
        return this.#events[type];
    }

    get construction() {
        return this.#construction;
    }

    /**
     * Create new endpoint.
     *
     * The endpoint will not initialize fully until added to a {@link Node}.  You can use {@link Endpoint.add} to
     * construct and initialize an {@link Endpoint} in one step.
     */
    constructor(config: Endpoint.Configuration<T> | T);

    /**
     * Create new endpoint.
     *
     * The endpoint will not initialize fully until added to a {@link Node}.  You can use {@link Endpoint.add} to
     * construct and initialize an {@link Endpoint} in one step.
     */
    constructor(type: T, options?: Endpoint.Options<T>);

    constructor(definition: T | Endpoint.Configuration<T>, options?: Endpoint.Options<T>) {
        const config = Endpoint.configurationFor(definition, options);

        this.#type = config.type;

        // Create construction early so other components can hook events
        this.#construction = Construction(this);

        this.#lifecycle = this.createLifecycle(config.isEssential);
        this.#lifecycle.ready.on(() => this.#logReady());

        if (config.id !== undefined) {
            this.id = config.id;
        }

        if (config.number !== undefined) {
            this.number = config.number;
        }

        this.#behaviors = new Behaviors(this, config as Record<string, object | undefined>);

        if (config.owner) {
            this.owner = config.owner instanceof Agent ? config.owner.endpoint : config.owner;
        }

        if (config.parts) {
            for (const part of config.parts) {
                this.parts.add(part);
            }
        }
    }

    set id(id: string) {
        if (this.#id === id) {
            return;
        }
        if (this.#id !== undefined) {
            throw new ImplementationError(`${this} ID is already assigned, cannot reassign`);
        }
        if (typeof id !== "string") {
            throw new ImplementationError(`Illegal endpoint ID type "${typeof id}"`);
        }
        if (id === "") {
            throw new ImplementationError("Endpoint ID may not be empty");
        }
        if (id.includes(".")) {
            throw new ImplementationError('Endpoint ID may not include "."');
        }

        if (this.lifecycle.isInstalled) {
            this.#container.assertIdAvailable(id, this);
        }

        this.#id = id;
        this.lifecycle.change(EndpointLifecycle.Change.IdAssigned);
    }

    protected get container(): undefined | EndpointContainer {
        return this.owner?.parts;
    }

    set number(number: number) {
        if (this.#number === number) {
            return;
        }
        if (this.#number !== undefined) {
            throw new ImplementationError(
                `${this} endpoint number ${this.#number} is already assigned, cannot reassign`,
            );
        }
        if (typeof number !== "number") {
            throw new ImplementationError(`Illegal endpoint number type "${typeof number}"`);
        }
        if (!Number.isInteger(number)) {
            throw new ImplementationError(`Endpoint number ${number} is not an integer`);
        }
        if (number < 0) {
            throw new ImplementationError(`Endpoint number ${number} is negative`);
        }
        if (number > 0xffff) {
            throw new ImplementationError(`Endpoint number ${number} is greater than the maximum of 65535`);
        }

        if (this.type.deviceClass === RootEndpoint.deviceClass) {
            if (number !== 0) {
                throw new ImplementationError("The root endpoint must have ID 0");
            }
        } else {
            if (number === 0) {
                throw new ImplementationError("Only root endpoint may have ID 0");
            }

            if (this.lifecycle.isInstalled) {
                this.env.get(IdentityService).assertNumberAvailable(number, this);
            }
        }

        this.#number = EndpointNumber(number);

        this.lifecycle.change(EndpointLifecycle.Change.NumberAssigned);
    }

    set owner(owner: Endpoint | undefined) {
        if (this.#owner === owner) {
            return;
        }
        if (this.#owner) {
            this.#container.delete(this);
        }

        this.#owner = owner;

        if (owner) {
            try {
                this.#container.add(this);
            } catch (e) {
                this.#container.delete(this);
                this.#owner = undefined;
                throw e;
            }
        }
    }

    /**
     * Add a child endpoint.  If this endpoint is initialized, awaits child initialization.
     *
     * If child initialization fails:
     *
     *   - If the child is essential (@see {@link EndpointLifecycle#isEssential}), removes the child and rethrows
     *
     *   - If the child is non-essential then logs the error but leaves the child installed.
     *
     * @param endpoint the {@link Endpoint} or {@link Endpoint.Configuration}
     */
    async add<T extends EndpointType>(endpoint: Endpoint<T> | Endpoint.Configuration<T> | T): Promise<Endpoint<T>>;

    /**
     * Add a child endpoint with separate type and options arguments.
     *
     * @param type the {@link EndpointType} of the child endpoint
     * @param options settings for the new endpoint
     */
    async add<T extends EndpointType>(type: T, options?: Endpoint.Options<T>): Promise<Endpoint<T>>;

    async add<T extends EndpointType>(
        definition: T | Endpoint<T> | Endpoint.Configuration<T>,
        options?: Endpoint.Options<T>,
    ) {
        if (!this.lifecycle.isInstalled) {
            throw new ImplementationError(`You may not use add() here because ${this} is not installed in a Node`);
        }

        await this.construction;

        let endpoint;
        if (definition instanceof Endpoint) {
            endpoint = definition;
        } else {
            endpoint = new Endpoint(definition as any, options);
        }

        if (this.#lifecycle.isPartsReady) {
            // Disable the default logging of construction errors because we throw the cause below
            endpoint.construction.onError(() => {});
        }

        this.parts.add(endpoint);

        try {
            await endpoint.construction.ready;
        } catch (e) {
            // If endpoint is essential do not allow it to be added
            if (endpoint.lifecycle.isEssential) {
                await endpoint.reset();
                this.parts.delete(endpoint);
                endpoint.#owner = undefined;
            }

            // For non-essential endpoints just log the error
            if (!endpoint.lifecycle.isEssential) {
                logger.error(`Initialization error in non-essential endpoint ${endpoint}:`, e);
            }

            throw e;
        }

        return endpoint;
    }

    /**
     * The type of endpoint this endpoint implements.
     */
    get type() {
        return this.#type;
    }

    /**
     * Access child parts.
     */
    get parts() {
        if (!this.#parts) {
            this.#parts = new Parts(this);
        }
        return this.#parts;
    }

    /**
     * Is this a parent Endpoint?
     */
    get hasParts() {
        // This doesn't work, apparent TS bug
        //return !!this.#parts?.size;

        if (this.#parts?.size) {
            return true;
        }

        return false;
    }

    /**
     * Endpoint information that varies as the endpoint initializes.
     */
    get lifecycle() {
        return this.#lifecycle;
    }

    protected createLifecycle(isEssential?: boolean) {
        return new EndpointLifecycle(this, isEssential);
    }

    /**
     * Create an {@link Agent.Type} for the endpoint.
     */
    get agentType() {
        if (!this.#agentType) {
            this.#agentType = Agent.for(this.type, this.behaviors.supported);
        }
        return this.#agentType;
    }

    /**
     * Execute a function against an {@link Agent} for the endpoint.
     *
     * Agents provide the highest-leve API for interacting with endpoints.  The agent is a composite object with
     * properties for each supported behavior.
     *
     * State changes made by {@link actor} are atomic and made permanent only when the actor exits unless you commit the
     * transaction manually.
     *
     * {@link actor} runs in an "offline" context where ACLs are ignored and all state is read/write.
     *
     * The {@link Agent} is destroyed after {@link actor} exits so you should not maintain references to the agent, its
     * behaviors or associated state.
     *
     * {@link actor} may be async.  If so, the acting context will remain open until the returned {@link Promise}
     * resolves.
     *
     * @param purpose textual description of operation used for diagnostics
     * @param actor the function that performs the action
     */
    act<R>(purpose: string, actor: (agent: Agent.Instance<T>) => MaybePromise<R>): MaybePromise<R>;

    /**
     * Version of {@link act} without explicit diagnostic purpose.
     */
    act<R>(actor: (agent: Agent.Instance<T>) => MaybePromise<R>): MaybePromise<R>;

    act<R>(
        actorOrPurpose: string | ((agent: Agent.Instance<T>) => MaybePromise<R>),
        actor?: (agent: Agent.Instance<T>) => MaybePromise<R>,
    ): MaybePromise<R> {
        let purpose;
        if (typeof actorOrPurpose === "string") {
            purpose = actorOrPurpose;
        } else {
            actor = actorOrPurpose;
            purpose = "offline";
        }

        if (typeof actor !== "function") {
            throw new ImplementationError("Actor must be a function");
        }

        this.construction.assert(this.toString());

        if (!this.#activity) {
            this.#activity = this.env.get(NodeActivity);
        }

        return LocalActorContext.act(
            purpose,
            context => {
                return actor(this.agentFor(context));
            },
            { activity: this.#activity },
        );
    }

    /**
     * Perform "soft" reset of the endpoint, reverting all in-memory structures to uninitialized.
     */
    async reset() {
        try {
            // Revert lifecycle to uninitialized
            this.lifecycle.resetting();

            // Reset child parts
            await this.parts.reset();

            // Reset behaviors
            await this.behaviors.close();

            // Notify
            await this.lifecycle.reset.emit();

            // Set construction to inactive so we can restart
            this.construction.setStatus(Lifecycle.Status.Inactive);
        } catch (e) {
            logger.error(`Unhandled error during reset of ${this}`, e);
        }
    }

    /**
     * Perform "hard" reset of the endpoint, reverting all in-memory and persistent state to uninitialized.
     */
    async erase() {
        await this.reset();
        await this.env.get(EndpointInitializer).eraseDescendant(this);
    }

    /**
     * Erase all persisted data and destroy the endpoint.
     */
    async delete() {
        await this.erase();
        await this.close();
    }

    /**
     * Apply a depth-first visitor function to myself and all descendents.
     */
    visit<T extends void | PromiseLike<void>>(visitor: (endpoint: Endpoint) => T): T {
        const promise = visitor(this);

        const childIterator = this.parts[Symbol.iterator]();

        const visitChildren = (): MaybePromise => {
            for (let next = childIterator.next(); !next.done; next = childIterator.next()) {
                const promise = next.value.visit(visitor);
                if (MaybePromise.is(promise)) {
                    return promise.then(visitChildren);
                }
            }
        };

        if (MaybePromise.is(promise)) {
            return promise.then(visitChildren) as T;
        }

        return visitChildren() as T;
    }

    async close() {
        this.lifecycle.change(EndpointLifecycle.Change.Destroying);
        await this.env.get(EndpointInitializer).deactivateDescendant(this);
        await this.#construction.close();
    }

    async [Construction.destruct]() {
        await this.#parts?.close();
        await this.#behaviors?.close();

        for (const id in this.#events) {
            this.#events[id][Symbol.dispose]();
        }

        this.lifecycle.change(EndpointLifecycle.Change.Destroyed);
        this.#owner = undefined;
    }

    async [Symbol.asyncDispose]() {
        await this.close();
    }

    toString() {
        return this.path.toString();
    }

    /**
     * Path identifying the endpoint in the Matter data model.
     */
    get path(): DataModelPath {
        if (this.#owner) {
            return this.#owner.path.at(this.identity, this.#type.name);
        }

        return DataModelPath(this.identity, this.type?.name);
    }

    /**
     * Diagnostic identity.
     *
     * This is an unqualified path segment.
     */
    get identity() {
        if (this.lifecycle?.hasId) {
            return this.id;
        }

        if (this.lifecycle?.hasNumber) {
            return this.number;
        }

        return "?";
    }

    /**
     * Asynchronous initialization.
     *
     * Derivatives may override to perform async construction prior to full initialization.
     */
    protected initialize() {
        // Configure the endpoint for the appropriate node type
        this.env.get(EndpointInitializer).initializeDescendant(this);

        // Initialize behaviors.  Success brings endpoint to "ready" state
        let promise = this.behaviors.initialize();

        // Initialize parts.  Success brings endpoint to "tree ready" state
        if (promise) {
            promise = promise.then(this.parts.initialize.bind(this.parts));
        } else {
            promise = this.parts.initialize();
        }

        return promise;
    }

    /**
     * Ensure requirements for construction are met.
     */
    protected assertConstructable() {
        if (this.#owner === undefined) {
            throw new ImplementationError(`Endpoint construction initiated without owner`);
        }
        if (!this.#owner.#lifecycle.isInstalled) {
            throw new ImplementationError(`Endpoint construction initiated with uninstalled owner`);
        }
    }

    /**
     * Complete initialization.  Invoked via {@link Construction#start} by the owner.
     */
    [Construction.construct]() {
        // Sanity checks
        this.assertConstructable();

        // We now consider the endpoint "installed"
        this.lifecycle.change(EndpointLifecycle.Change.Installed);

        // Initialize
        return this.initialize();
    }

    #logReady() {
        logger.info(Diagnostic.strong(this.toString()), "ready", this.diagnosticDict);
    }

    /**
     * Hierarchical diagnostics of endpoint and children.
     */
    get [Diagnostic.value](): unknown {
        return [
            Diagnostic.strong(this.id),
            Diagnostic.dict({
                ...this.#diagnosticProps,
                class: this.constructor.name,
            }),
            Diagnostic.list([...this.behaviors.detailedDiagnostic, ...this.parts]),
        ];
    }

    /**
     * Diagnostic information regarding endpoint state.
     */
    get diagnosticDict() {
        return Diagnostic.dict({
            ...this.#diagnosticProps,
            behaviors: this.behaviors,
        });
    }

    get #diagnosticProps() {
        const type = this.type;
        return {
            "endpoint#": this.number,
            type: `${type.name} (${
                type.deviceType === EndpointType.UNKNOWN_DEVICE_TYPE
                    ? "unknown"
                    : `0x${toHex(type.deviceType)}${type.deviceRevision === EndpointType.UNKNOWN_DEVICE_REVISION ? "" : `, rev ${type.deviceRevision}`}`
            })`,
        };
    }

    get #container() {
        const container = this.container;

        if (container === undefined) {
            throw new ImplementationError(`No container for installed endpoint ${this}`);
        }

        return container;
    }
}

export namespace Endpoint {
    export type BehaviorOptions<
        T extends EndpointType = EndpointType.Empty,
        O extends EndpointOptions = EndpointOptions,
    > = {
        -readonly [K in keyof T["behaviors"] as K extends keyof O ? never : K]?: Behavior.Options<T["behaviors"][K]>;
    };

    export interface EndpointOptions {
        /**
         * The owner of the endpoint.
         *
         * If provided, takes ownership of the endpoint at construction.
         */
        owner?: Endpoint | Agent;

        /**
         * The endpoint's string identifier.  Must be unique within the parent.
         *
         * If you omit the identifier the node assigns a generated one for you.
         */
        id?: string;

        /**
         * The endpoint number.  Must be unique within the node.
         *
         * If you omit the endpoint number the node assigns a sequential one for you.
         */
        number?: number;

        /**
         * Child endpoints.
         *
         * This is the inverse of setting {@link owner} above.  The endpoint instantiates and takes ownership of child
         * endpoints at construction time.
         */
        parts?: Iterable<Endpoint.Definition>;

        /**
         * Designates whether an endpoint is essential.
         *
         * Endpoints are essential by default but you may disable by setting this to false.
         */
        isEssential?: boolean;
    }

    export type Options<
        T extends EndpointType = EndpointType.Empty,
        O extends EndpointOptions = EndpointOptions,
    > = BehaviorOptions<T, O> & O;

    export type Configuration<
        T extends EndpointType = EndpointType.Empty,
        O extends EndpointOptions = EndpointOptions,
    > = Options<T, O & { type: T }> & { type: T };

    /**
     * Definition of an endpoint.  May be an {@link EndpointType}, {@link Configuration}, or a {@link Endpoint}
     * instance.
     */
    export type Definition<T extends EndpointType = EndpointType.Empty> = T | Configuration<T> | Endpoint<T>;

    /**
     * Obtain a configuration from constructor parameters.
     */
    export function configurationFor<T extends EndpointType>(
        definition: T | Endpoint.Configuration<T>,
        options?: Endpoint.Options<T>,
    ) {
        if ((definition as EndpointType).deviceType) {
            return {
                ...options,
                type: definition as T,
            } as Configuration<T>;
        }
        return definition as Configuration<T>;
    }

    /**
     * Obtain an endpoint for the given {@link Definition}.
     */
    export function partFor<T extends EndpointType>(definition: Definition<T>): Endpoint<T> {
        if (definition instanceof Endpoint) {
            return definition;
        }

        return new Endpoint(definition);
    }
}
