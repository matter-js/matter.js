/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import { NetworkBehavior } from "#behavior/system/network/NetworkBehavior.js";
import { NetworkRuntime } from "#behavior/system/network/NetworkRuntime.js";
import { PartsBehavior } from "#behavior/system/parts/PartsBehavior.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Endpoints } from "#endpoint/properties/Endpoints.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import {
    asError,
    Construction,
    DestroyedDependencyError,
    Diagnostic,
    DiagnosticPresentation,
    DiagnosticSource,
    Environment,
    Identity,
    ImplementationError,
    Lifecycle,
    Logger,
    MatterAggregateError,
    MaybePromise,
} from "@matter/general";
import { Matter, MatterModel } from "@matter/model";
import { Interactable } from "@matter/protocol";
import type { EndpointNumber } from "@matter/types";
import { RootEndpoint } from "../endpoints/root.js";
import { ProtocolService } from "./integration/ProtocolService.js";
import { NodeLifecycle } from "./NodeLifecycle.js";

const logger = Logger.get("Node");

/**
 * A Matter Node.
 *
 * In Matter, a "node" is an individually addressable top-level network resource.
 */
export abstract class Node<T extends Node.CommonRootEndpoint = Node.CommonRootEndpoint> extends Endpoint<T> {
    #environment: Environment;
    #runtime?: NetworkRuntime;
    #startRequest = 0;

    constructor(config: Node.Configuration<T>) {
        const parentEnvironment = config.environment ?? config.owner?.env ?? Environment.default;

        // Ensure runtime is shared across components
        void parentEnvironment.root.runtime;

        if (config.id === undefined) {
            config.id = `node${parentEnvironment.vars.increment("node.nextFallbackId")}`;
        }

        super(config);

        // We create a local environment so nodes can offer node-specific services via the environment
        this.#environment = new Environment(config.id, parentEnvironment);

        this.#environment.set(NodeActivity, new NodeActivity());
        this.#environment.set(ProtocolService, new ProtocolService(this));

        if (this.lifecycle.hasNumber) {
            if (this.number !== 0) {
                throw new ImplementationError("The root endpoint ID must be 0");
            }
        } else {
            this.number = 0;
        }

        this.lifecycle.online.on(() => {
            this.statusUpdate("is online");
        });

        this.lifecycle.offline.on(() => {
            this.statusUpdate("is offline");
        });

        this.lifecycle.goingOffline.on(() => {
            this.statusUpdate("going offline");
        });
    }

    override get env() {
        return this.#environment;
    }

    /**
     * Model of Matter semantics understood by this node.  Defaults to the standard model; client nodes may narrow or
     * extend it so remote clusters resolve to real element names.
     */
    get matter(): MatterModel {
        return Matter;
    }

    /**
     * The optimized view that supports local Matter protocol implementation.
     */
    get protocol() {
        return this.env.get(ProtocolService).protocol;
    }

    override get lifecycle(): NodeLifecycle {
        return super.lifecycle as NodeLifecycle;
    }

    /**
     * Bring the node online.  Calls of {@link start} and {@link stop} take effect in call order, so the last one sets
     * whether the node ends online.  Throws {@link DestroyedDependencyError} once a close or delete of the node was
     * requested.
     */
    async start() {
        this.assertNotTerminal("start");
        if (this.lifecycle.isOnline && this.lifecycle.shouldBeOnline) {
            return;
        }

        const request = ++this.#startRequest;
        this.lifecycle.targetState = "online";
        try {
            const preparing = this.prepareStart();
            if (MaybePromise.is(preparing)) {
                await preparing;
            }
            await this.lifecycle.mutex.hold(`starting ${this}`, async () => {
                // A close or delete may have been requested while this start waited for the mutex
                this.assertNotTerminal("start");
                if (this.lifecycle.shouldBeOnline) {
                    await this.startWithMutex();
                }
            });
        } catch (error) {
            // A later start owns the target state
            if (request === this.#startRequest) {
                this.lifecycle.targetState = "offline";
            }
            throw error;
        }
    }

    /**
     * Prepare a {@link start} once it recorded its target state and before it waits for the node mutex.
     */
    protected prepareStart(): MaybePromise<void> {}

    protected async startWithMutex() {
        if (this.isRuntimeWorker) {
            this.env.runtime.add(this);
        }

        try {
            await this.construction.ready;

            if (this.#runtime) {
                return;
            }

            this.statusUpdate("going online");

            this.#runtime = this.createRuntime();
            this.#runtime.construction.start();
            this.#environment.set(NetworkRuntime, this.#runtime);
            await this.#runtime.construction.ready;
            await this.act("network startup", agent => agent.get(NetworkBehavior).startup());
        } catch (e) {
            // If a runtime instance got created, tear it down.  Detach state synchronously to avoid a deadlock:
            // runtime.close() awaits activity.inactive, but we may be called from within an activity (e.g.
            // commissioning) that can't close until we return.  Closing in the background breaks the cycle.
            if (this.#runtime) {
                const runtime = this.#runtime;
                this.#environment.delete(NetworkRuntime, runtime);
                this.#runtime = undefined;
                this.behaviors.internalsOf(NetworkBehavior).runtime = undefined;

                // We intentionally do not track this promise because it is likely to hang
                runtime.close().catch(e => {
                    logger.warn("Error closing network runtime", asError(e));
                });
            }
            if (this.isRuntimeWorker) {
                this.env.runtime.delete(this);
            }
            throw e;
        }
    }

    /**
     * @deprecated use {@link start}
     */
    async bringOnline() {
        return this.start();
    }

    /**
     * Run the node in standalone mode.  Returns when the node is closed.
     */
    async run() {
        await this.start();
        await this.construction.closed;
    }

    /**
     * Take the node offline but leave state and structure intact.  Happens automatically on close.
     *
     * Once the node is offline you may use {@link start} to bring the node online again.
     */
    async stop() {
        this.lifecycle.targetState = "offline";
        await this.lifecycle.mutex.hold(`stopping ${this}`, () => this.cancelWithMutex());
    }

    /**
     * @deprecated use {@link stop}
     */
    cancel() {
        return this.stop();
    }

    /**
     * All endpoints owned by the node.
     *
     * Normally you access endpoints via {@link parts} but you can use this property access endpoints directly by
     * {@link EndpointNumber}.
     */
    get endpoints(): Endpoints {
        return new Endpoints(this);
    }

    protected async cancelWithMutex() {
        if (!this.#runtime) {
            return;
        }

        await MatterAggregateError.settleSeries(
            [
                () => this.act(agent => this.lifecycle.goingOffline.emit(agent.context)),
                async () => {
                    const runtime = this.#runtime;
                    if (runtime === undefined) {
                        return;
                    }
                    this.#runtime = undefined;
                    this.#environment.delete(NetworkRuntime, runtime);
                    await runtime.close();
                },
            ],
            `Error taking ${this} offline`,
        );
    }

    /**
     * Refuse an operation of a node whose close or delete was requested.
     */
    protected assertNotTerminal(operation: string) {
        if (this.lifecycle.isTerminal) {
            throw new DestroyedDependencyError(`${this}`, `is closing or closed, so it cannot ${operation}`);
        }
    }

    /**
     * Run the step of a lifecycle verb of the node while holding the node mutex and then the tree mutex.  The node goes
     * offline first and online again afterwards if its network was running and it should stay online.
     */
    protected override async withLifecycleMutex(operation: string, step: () => Promise<void>) {
        await this.lifecycle.mutex.hold(operation, () => this.#runOffline(operation, step));
    }

    /**
     * Take the node offline, run {@link step} while holding the tree mutex, and bring the node online again if its
     * network was running and it should stay online.  The runtime is not designed to operate with a node whose root
     * resets or closes, so it goes first.  A node that fails to go offline before an erase or to go online again
     * crashes, unless the error lets it stay offline ({@link staysOfflineAfter}).
     */
    async #runOffline(operation: string, step: () => Promise<void>) {
        // A peer without a session is offline while its runtime runs and reconnects
        const wasRunning = this.#runtime !== undefined;
        const errors = new Array<unknown>();

        try {
            await this.cancelWithMutex();
        } catch (e) {
            errors.push(e);
            if (!this.lifecycle.isTerminal) {
                this.construction.crash();
                throw new MatterAggregateError(errors, `Error ${operation}`);
            }
        }

        try {
            await this.lifecycle.treeMutex.hold(operation, step);
        } catch (e) {
            errors.push(e);
        }

        if (wasRunning && this.lifecycle.shouldBeOnline && this.construction.status === Lifecycle.Status.Active) {
            try {
                await this.startWithMutex();
            } catch (e) {
                if (this.staysOfflineAfter(e)) {
                    logger.debug(
                        Diagnostic.strong(this.toString()),
                        `stays offline after ${operation} as it cannot go online now:`,
                        e,
                    );
                } else {
                    errors.push(e);

                    // A failed start of the construction crashed it with its cause already
                    if (this.construction.status === Lifecycle.Status.Active) {
                        this.construction.crash();
                    }
                }
            }
        }

        if (errors.length === 1 && errors[0] instanceof MatterAggregateError) {
            throw errors[0];
        }
        if (errors.length) {
            throw new MatterAggregateError(errors, `Error ${operation}`);
        }
    }

    /**
     * Create the network runtime.
     */
    protected abstract createRuntime(): NetworkRuntime;

    /**
     * An {@link Interactable} that allows for execution of Matter interactions against this node.
     */
    abstract interaction: Interactable<ActionContext>;

    abstract readonly nodeType: "server" | "client" | "group";

    protected abstract prepareRuntimeShutdown(): Promise<void>;

    /**
     * Whether {@link error} of a start lets the node stay offline after a lifecycle verb instead of crashing.
     */
    protected staysOfflineAfter(_error: unknown) {
        return false;
    }

    /**
     * Whether the node registers with the environment's runtime when it starts, so that shutting down the runtime
     * closes it.
     */
    protected get isRuntimeWorker() {
        return true;
    }

    /**
     * Sections this node adds to its diagnostics, each a heading followed by its content.
     */
    protected get diagnosticSections(): unknown[] {
        return [];
    }

    get [DiagnosticPresentation.name]() {
        return ["Runtime for", Diagnostic.strong(this.toString())];
    }

    get [Diagnostic.value](): unknown {
        const nodeActivity = this.#environment.get(NodeActivity);
        using _activity = nodeActivity.begin("diagnostics");
        return Diagnostic.node("🧩", this.id, {
            children: [
                Diagnostic.strong("Structure"),
                Diagnostic.list([super[Diagnostic.value]]),
                Diagnostic.strong("Activity"),
                nodeActivity[Diagnostic.value],
                ...this.diagnosticSections,
            ],
        });
    }

    protected override createLifecycle(): NodeLifecycle {
        return new NodeLifecycle(this);
    }

    protected statusUpdate(message: string) {
        logger.notice(Diagnostic.strong(this.toString()), message);
    }

    override async [Construction.destruct]() {
        await MatterAggregateError.settleSeries(
            [
                () => this.cancelWithMutex(),
                () => super[Construction.destruct](),
                () => DiagnosticSource.delete(this),
                () => this.#environment[Symbol.dispose](),
            ],
            `Error destroying node ${this}`,
        );
    }
}

export namespace Node {
    export interface NodeOptions extends Endpoint.EndpointOptions {
        environment?: Environment;
    }

    export type Options<
        T extends Node.CommonRootEndpoint = Node.CommonRootEndpoint,
        O extends NodeOptions = NodeOptions,
    > = Endpoint.Options<T, O>;

    export type Configuration<
        T extends Node.CommonRootEndpoint = Node.CommonRootEndpoint,
        O extends NodeOptions = NodeOptions,
    > = Endpoint.Configuration<T, O>;

    export function nodeConfigFor<T extends RootEndpoint, O extends NodeOptions>(
        defaultType: T,
        configuration: undefined | T | Configuration<T>,
        options: Options<T, O>,
    ): Node.Configuration<T, O> {
        if (configuration === undefined) {
            return {
                type: defaultType,
                ...options,
            };
        }
        if ((configuration as EndpointType).deviceType !== undefined) {
            return {
                type: configuration as T,
                ...options,
            };
        }
        return {
            type: defaultType,
            ...configuration,
        } as Node.Configuration<T, O>;
    }

    export function forEndpoint(endpoint: Endpoint): Node {
        const node = endpoint.ownerOfType(RootEndpoint);
        if (node === undefined) {
            throw new ImplementationError(`Cannot complete operation because ${endpoint} is not installed in a node`);
        }
        if (!(node instanceof Node)) {
            throw new ImplementationError(`Root endpoint for ${endpoint} is not a node`);
        }
        return node;
    }

    /**
     * Common root endpoint definition for all nodes.
     */
    export const CommonRootEndpoint = MutableEndpoint({
        name: RootEndpoint.name,
        deviceType: RootEndpoint.deviceType,
        deviceRevision: RootEndpoint.deviceRevision,
        deviceClass: RootEndpoint.deviceClass,
        requirements: RootEndpoint.requirements,
        behaviors: {
            parts: PartsBehavior,
            index: IndexBehavior,
        },
    });

    export interface CommonRootEndpoint extends Identity<typeof CommonRootEndpoint> {}
}
