/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { CommissioningServer } from "#behavior/system/commissioning/CommissioningServer.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { EventsBehavior } from "#behavior/system/events/EventsBehavior.js";
import { NetworkServer } from "#behavior/system/network/NetworkServer.js";
import { ServerNetworkRuntime } from "#behavior/system/network/ServerNetworkRuntime.js";
import { ProductDescriptionServer } from "#behavior/system/product-description/ProductDescriptionServer.js";
import { SessionsBehavior } from "#behavior/system/sessions/SessionsBehavior.js";
import { SubscriptionsBehavior } from "#behavior/system/subscriptions/SubscriptionsServer.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import type { Environment } from "#general";
import { asyncNew, Construction, DiagnosticSource, errorOf, Identity, MatterError } from "#general";
import { FabricManager, Interactable, OccurrenceManager, ServerInteraction, SessionManager } from "#protocol";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { RootEndpoint as BaseRootEndpoint } from "../endpoints/root.js";
import { Node } from "./Node.js";
import { Peers } from "./client/Peers.js";
import { ServerEnvironment } from "./server/ServerEnvironment.js";

/**
 * Thrown when there is an error during factory reset.
 */
class FactoryResetError extends MatterError {
    constructor(message: string, cause: any) {
        super(message);
        this.cause = errorOf(cause);
    }
}

/**
 * A server-side Matter {@link Node}.
 *
 * The Matter specification often refers to server-side nodes as "devices".
 */
export class ServerNode<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint> extends Node<T> {
    #peers?: Peers;
    #interaction?: Interactable<ActionContext>;

    /**
     * Construct a new ServerNode.
     *
     * You can use {@link create} to construct the node and wait for it to initialize fully.
     *
     * @param type the variation of {@link RootEndpoint} that defines the root endpoint's behavior
     * @param options root endpoint options and the node's environment
     */
    constructor(type?: T, options?: Node.Options<T>);

    /**
     * Construct a new ServerNode.
     *
     * You can use {@link create} to construct the node and wait for it to initialize fully.
     *
     * @param config a {@link Endpoint.Configuration} for the root endpoint
     */
    constructor(config: Partial<Node.Configuration<T>>);

    constructor(definition?: T | Node.Configuration<T>, options?: Node.Options<T>) {
        super(Node.nodeConfigFor(ServerNode.RootEndpoint as T, definition, options ?? ({} as Node.Options<T>)));

        this.env.set(Node, this);
        this.env.set(ServerNode, this);

        DiagnosticSource.add(this);

        this.construction.start();
    }

    /**
     * Create a new ServerNode.
     *
     * @param type the variation of {@link RootEndpoint} that defines the root endpoint's behavior
     * @param options root endpoint configuration and, optionally, the node's environment
     */
    static async create<
        This extends typeof ServerNode<any>,
        T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint,
    >(this: This, type?: T, options?: Node.Options<T>): Promise<ServerNode<T>>;

    /**
     * Create a new ServerNode.
     *
     * @param config root endpoint configuration and, optionally, the node's {@link Environment}
     */
    static async create<
        This extends typeof ServerNode<any>,
        T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint,
    >(this: This, config: Partial<Node.Configuration<T>>): Promise<ServerNode<T>>;

    static async create<
        This extends typeof ServerNode<any>,
        T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint,
    >(this: This, definition?: T | Node.Configuration<T>, options?: Node.Options<T>) {
        return await asyncNew(this, definition, options);
    }

    protected createRuntime(): ServerNetworkRuntime {
        return new ServerNetworkRuntime(this);
    }

    override async [Construction.destruct]() {
        await super[Construction.destruct]();
        await ServerEnvironment.close(this);
    }

    override async prepareRuntimeShutdown() {
        const sessions = this.env.get(SessionManager);
        await sessions.close();
    }

    /**
     * Perform a factory reset of the node.
     */
    override async erase() {
        await this.lifecycle.mutex.produce(this.eraseWithMutex.bind(this));
    }

    protected async eraseWithMutex() {
        try {
            await this.construction;

            // Go offline before performing reset
            const isOnline = this.lifecycle.isOnline;
            if (isOnline) {
                await this.cancelWithMutex();
            }

            // Inform user
            this.statusUpdate("resetting to factory defaults");

            // Reset in-memory state
            await this.resetWithMutex();

            // Reset persistent state
            await this.resetStorage();

            // Reset reverts node to inactive state; now reinitialize
            this.construction.start();

            // Go back online if we were online at time of reset, otherwise just await reinitialization
            if (isOnline) {
                await this.startWithMutex();
            } else {
                await this.construction.ready;
            }
        } catch (e) {
            this.construction.crash();
            throw new FactoryResetError(`Error during factory reset of ${this}`, e);
        }
    }

    /**
     * Access other nodes on the fabric.
     */
    get peers() {
        if (!this.#peers) {
            this.#peers = new Peers(this);
            this.#peers.initialize();
        }

        return this.#peers;
    }

    get interaction() {
        if (this.#interaction === undefined) {
            this.#interaction = new ServerInteraction<ActionContext>(this.protocol);
        }
        return this.#interaction;
    }

    protected override async initialize() {
        await ServerEnvironment.initialize(this);

        await super.initialize();
    }

    /**
     * By default, on factory reset we erase all stored data.
     *
     * If this is inappropriate for your application, you may override to alter the behavior.  Matter requires that all
     * "security- and privacy-related data and key material" is removed on factory reset.
     *
     * @see {@link MatterSpecification.v12.Core} § 13.4
     */
    protected async resetStorage() {
        await this.env.get(SessionManager).clear();
        await this.env.get(FabricManager).clear();
        await this.env.get(OccurrenceManager).clear();
        await this.env.get(ServerNodeStore).erase();
    }

    /**
     * Normal endpoints must have an owner to complete construction but server nodes have no such precondition for
     * construction.
     */
    protected override assertConstructable() {}
}

export namespace ServerNode {
    export const RootEndpoint = BaseRootEndpoint.with(
        CommissioningServer,
        NetworkServer,
        ProductDescriptionServer,
        SubscriptionsBehavior,
        SessionsBehavior,
        EventsBehavior,
        ControllerBehavior,
    );

    export interface RootEndpoint extends Identity<typeof RootEndpoint> {}
}
