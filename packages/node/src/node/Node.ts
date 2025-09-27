/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
    Construction,
    Diagnostic,
    DiagnosticSource,
    Environment,
    Identity,
    ImplementationError,
    Logger,
    RuntimeService,
} from "#general";
import { Interactable } from "#protocol";
import type { EndpointNumber } from "#types";
import { RootEndpoint } from "../endpoints/root.js";
import { NodeLifecycle } from "./NodeLifecycle.js";
import { ProtocolService } from "./server/ProtocolService.js";

const logger = Logger.get("Node");

/**
 * A Matter Node.
 *
 * In Matter, a "node" is an individually addressable top-level network resource.
 */
export abstract class Node<T extends Node.CommonRootEndpoint = Node.CommonRootEndpoint> extends Endpoint<T> {
    #environment: Environment;
    #runtime?: NetworkRuntime;
    #targetState: "online" | "offline" = "offline";

    constructor(config: Node.Configuration<T>) {
        const parentEnvironment = config.environment ?? config.owner?.env ?? Environment.default;

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

    protected get targetState() {
        return this.#targetState;
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
     * Bring the node online.
     */
    async start() {
        if (this.lifecycle.isOnline) {
            return;
        }
        this.#targetState = "online";

        await this.lifecycle.mutex.produce(this.startWithMutex.bind(this));
    }

    protected async startWithMutex() {
        this.env.runtime.add(this);

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
            this.env.runtime.delete(this);
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
    async cancel() {
        this.#targetState = "offline";
        await this.lifecycle.mutex.produce(this.cancelWithMutex.bind(this));
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

        await this.act(agent => this.lifecycle.goingOffline.emit(agent.context));
        if (this.#runtime) {
            this.#environment.delete(NetworkRuntime, this.#runtime);
        }
        await this.#runtime?.close();
        this.#runtime = undefined;
    }

    override async close() {
        this.#targetState = "offline";
        await this.lifecycle.mutex.produce(this.closeWithMutex.bind(this));
    }

    protected async closeWithMutex() {
        // The runtime is not designed to operate with a node that is shutting down so destroy it before performing
        // actual close
        if (this.#runtime) {
            await this.cancelWithMutex();
        }

        await super.close();
    }

    override async reset() {
        await this.lifecycle.mutex.produce(this.resetWithMutex.bind(this));
    }

    protected async resetWithMutex() {
        return super.reset();
    }

    /**
     * Create the network runtime.
     */
    protected abstract createRuntime(): NetworkRuntime;

    /**
     * An {@link Interactable} that allows for execution of Matter interactions against this node.
     */
    abstract interaction: Interactable<ActionContext>;

    protected abstract prepareRuntimeShutdown(): Promise<void>;

    get [RuntimeService.label]() {
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
        await this.cancelWithMutex();
        await super[Construction.destruct]();
        DiagnosticSource.delete(this);
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
