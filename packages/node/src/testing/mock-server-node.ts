/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Agent } from "#endpoint/Agent.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    Crypto,
    DataReadQueue,
    Entropy,
    Environment,
    hex,
    Identity,
    ImplementationError,
    Lifecycle,
    Logger,
    MatterAggregateError,
    MaybePromise,
    MockCrypto,
    MockStorageService,
    Network,
    NetworkSimulator,
    StorageService,
} from "@matter/general";
import { AccessLevel, MatterModel } from "@matter/model";
import { ExchangeManager, FabricManager, ProtocolMocks, SessionManager, TestFabric } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";
import { MockExchange } from "./mock-exchange.js";

const logger = Logger.get("MockServerNode");

/**
 * The nodes created while a test runs.  Undefined outside a test, so a fixture a `before` hook creates is not tracked.
 */
let nodesOfCurrentTest: Set<MockServerNode> | undefined;

/**
 * Tests that left a node open.  Reported once all tests ran, because a failing `afterEach` hook would skip the rest.
 */
const leaks = new Array<string>();

beforeEach(() => {
    nodesOfCurrentTest = new Set();
});

// A node a test leaves open keeps its timers running into later tests
afterEach(async function () {
    const open = [...(nodesOfCurrentTest ?? [])].filter(
        ({ construction: { status } }) => status !== Lifecycle.Status.Destroyed,
    );
    nodesOfCurrentTest = undefined;
    if (!open.length) {
        return;
    }

    // A node whose construction failed cannot be handed to the test, but still holds its environment until closed.  A
    // failed test may not have reached its own close; its failure is reported already
    const title = this.currentTest?.fullTitle();
    const leaked = open.filter(({ construction: { status } }) => status !== Lifecycle.Status.Crashed);
    if (leaked.length && !this.currentTest?.isFailed()) {
        leaks.push(`${title}: ${leaked.map(String).join(", ")}`);
    }

    try {
        await MockTime.resolve(
            MatterAggregateError.allSettled(
                open.map(async node => {
                    // close() returns at once while another close is still running, so wait for the destruction itself
                    const closed = node.construction.closed;
                    await node.close();
                    await closed;
                }),
            ),
            { macrotasks: true },
        );
    } catch (error) {
        leaks.push(`${title}: closing left-over nodes failed: ${error}`);
    }
});

after(() => {
    if (leaks.length) {
        throw new ImplementationError(
            `Tests left nodes open; close every node a test creates, for example with "await using":\n${leaks.join("\n")}`,
        );
    }
});

/**
 * A {@link ServerNode} wired for tests: mock time, mock crypto, in-memory storage (unless the test configured storage) and a
 * simulated network host.  Nodes created while a test runs are closed after it, and the run fails at the end if a test
 * left one open.
 */
export class MockServerNode<T extends MockServerNode.RootEndpoint = MockServerNode.RootEndpoint> extends ServerNode<T> {
    #newExchanges = new DataReadQueue<MockExchange>();
    #simulator: NetworkSimulator;
    #matter?: MatterModel;

    /**
     * Creates the node without starting it.  Initializes {@link MockTime}, seeds mock crypto from the network index and sets up
     * the environment, storage and simulated network host.
     */
    constructor(type?: T, options?: MockServerNode.Options<T>);
    constructor(config: Partial<MockServerNode.Configuration<T>>);
    constructor(definition: T | MockServerNode.Configuration<T>, options?: MockServerNode.Options<T>) {
        // Server operation contains numeric time components that must be mocked
        MockTime.init();

        const config = Node.nodeConfigFor(
            ServerNode.RootEndpoint as T,
            definition,
            options ?? ({} as MockServerNode.Options<T>),
        );

        const networkIndex = config.index ?? 0x80;

        let environment = config.environment;
        if (!environment) {
            environment = new Environment("test");
        }

        // Stabilize random numbers
        const crypto = MockCrypto(config.index);
        environment.set(Entropy, crypto);
        environment.set(Crypto, crypto);

        // Set storage if not already configured by the test
        if (!environment.get(StorageService).isConfigured) {
            new MockStorageService(environment);
        }

        const simulator = config.simulator ?? new NetworkSimulator();
        environment.set(Network, simulator.addHost(networkIndex));

        config.environment = environment;

        if (config.index) {
            config.id = `node${hex.byte(networkIndex)}`;
        }
        super(config);

        this.#simulator = simulator;
        this.#matter = config.matter;

        nodesOfCurrentTest?.add(this);
    }

    /**
     * The model the node validates against: `matter` from the options if given, otherwise the standard model.
     */
    override get matter() {
        return this.#matter ?? super.matter;
    }

    /**
     * The network simulator this node's host is attached to.
     */
    get simulator() {
        return this.#simulator;
    }

    /**
     * Perform fake online activity
     */
    online<R>(
        options: Partial<RemoteActorContext.Options> & { accessLevel?: AccessLevel },
        actor: (agent: Agent.Instance<T>) => MaybePromise<R>,
    ): MaybePromise<R> {
        if (!options.exchange) {
            options.exchange = new MockExchange(
                { fabricIndex: FabricIndex.NO_FABRIC, nodeId: NodeId(0) },
                { accessLevel: options.accessLevel ?? AccessLevel.Operate },
            );
        }
        if (!options.node) {
            options.node = this;
        }
        return RemoteActorContext(options as RemoteActorContext.Options).act(context => actor(this.agentFor(context)));
    }

    /**
     * Creates a node, adds the device and starts it, resolving once it is online.  If it fails, the node is closed and the error
     * rethrown.  With `online: false` it only waits for construction; no exchange capture is installed then, so
     * {@link handleExchange} never resolves.
     * Outgoing exchanges are mock exchanges queued for {@link handleExchange}.
     */
    static async createOnline<T extends MockServerNode.RootEndpoint = MockServerNode.RootEndpoint>(
        type?: T,
        options?: MockServerNode.Options<T>,
    ): Promise<MockServerNode<T>>;
    static async createOnline<T extends MockServerNode.RootEndpoint = MockServerNode.RootEndpoint>(
        definition: T | MockServerNode.Configuration<T>,
        options?: MockServerNode.Options<T>,
    ): Promise<MockServerNode<T>>;
    static async createOnline<T extends MockServerNode.RootEndpoint = MockServerNode.RootEndpoint>(
        definition: T | MockServerNode.Configuration<T>,
        options?: MockServerNode.Options<T>,
    ) {
        const config = Node.nodeConfigFor(
            ServerNode.RootEndpoint as T,
            definition,
            options ?? ({} as MockServerNode.Options<T>),
        );

        const node = new MockServerNode<MockServerNode.RootEndpoint>(config.type, config);

        let device = config.device;
        if (device === undefined && !("device" in config)) {
            device = OnOffLightDevice;
        }

        try {
            if (device) {
                await node.add(device);
            }

            if (config.online === false) {
                await node.construction;
                return node;
            }

            await node.start();
        } catch (error) {
            try {
                await node.close();
            } catch (closeError) {
                logger.error(`Closing ${node} after it failed to come online failed:`, closeError);
            }
            throw error;
        }

        node.env.get(ExchangeManager).initiateExchange = address => {
            const exchange = new MockExchange(address, {
                session: node.env.get(SessionManager).maybeSessionFor(address),
            });

            node.#newExchanges.write(exchange);

            return exchange;
        };

        if (!node.lifecycle.isOnline) {
            await node.lifecycle.online;
        }

        return node;
    }

    /**
     * Resolves with the next exchange the node initiates towards a peer.  Only available on nodes made by {@link createOnline}.
     */
    async handleExchange(): Promise<MockExchange> {
        return await this.#newExchanges.read();
    }

    /**
     * Creates a mock secure session on this node and returns an exchange on it.  `options` override the session settings, for example `fabric`.
     */
    async createExchange(options?: Partial<Parameters<SessionManager["createSecureSession"]>[0]>) {
        const session = await ProtocolMocks.NodeSession.create({
            manager: this.env.get(SessionManager),
            fabric: undefined,
            ...options,
        });

        return new ProtocolMocks.Exchange({
            context: { session },
            maxPayloadSize: 1000,
        });
    }

    /**
     * Stops the node, advancing mock time until it is offline.
     */
    override async stop() {
        await MockTime.resolve(super.stop());
    }

    /**
     * Closes the node, advancing mock time until it is destroyed.  `stepMs` sets the time step used while waiting.
     */
    override async close(stepMs?: number) {
        await MockTime.resolve(super.close(), { macrotasks: true, stepMs });
    }

    /**
     * Installs a test fabric in the node's fabric manager and returns it once the node has reported the change.
     */
    async addFabric() {
        const fabric = await TestFabric({ fabrics: this.env.get(FabricManager) });

        // Wait for fabric install
        await this.events.commissioning.fabricsChanged;

        return fabric;
    }
}

export namespace MockServerNode {
    /**
     * Root endpoint type of mock nodes: the standard server root with {@link ControllerBehavior}.
     */
    export const RootEndpoint = ServerNode.RootEndpoint.with(ControllerBehavior);
    export interface RootEndpoint extends Identity<typeof RootEndpoint> {}

    /**
     * Options specific to mock nodes, on top of the regular node options.
     */
    export interface MockOptions extends Node.NodeOptions {
        /**
         * Set to `false` to build the node without starting it.  Defaults to starting it.
         */
        online?: boolean;
        /**
         * Device added to the node.  Defaults to an On/Off Light; pass `undefined` explicitly to add none.
         */
        device?: Endpoint.Definition;
        /**
         * Index of the simulated network host.  When set, the node id is `node` plus the index in hex.  Defaults to 0x80.
         */
        index?: number;
        /**
         * Simulator to join, so nodes can talk to each other.  Defaults to a new one.
         */
        simulator?: NetworkSimulator;

        /**
         * The model the node validates its device types in, instead of the standard model.
         */
        matter?: MatterModel;
    }
    /**
     * Options for creating a {@link MockServerNode}.
     */
    export type Options<T extends RootEndpoint = RootEndpoint> = Endpoint.Options<T, MockOptions>;

    /**
     * Full configuration for creating a {@link MockServerNode}.
     */
    export type Configuration<T extends RootEndpoint = RootEndpoint> = Endpoint.Configuration<T, MockOptions>;
}
