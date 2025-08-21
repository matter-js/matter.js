/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Agent } from "#endpoint/Agent.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import {
    AsyncObservable,
    Crypto,
    DataReadQueue,
    Environment,
    MaybePromise,
    MockCrypto,
    Network,
    NetworkSimulator,
    StorageBackendMemory,
    StorageService,
} from "#general";
import { AccessLevel } from "#model";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import { ExchangeManager, FabricManager, MessageExchange, SessionManager, TestFabric } from "#protocol";
import { FabricIndex, NodeId } from "#types";
import { MockExchange } from "./mock-exchange.js";

export class MockServerNode<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint> extends ServerNode<T> {
    #newExchanges = new DataReadQueue<MockExchange>();
    #simulator: NetworkSimulator;

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
        environment.set(Crypto, MockCrypto(options?.index));

        const storage = environment.get(StorageService);
        if (storage.location !== "(memory-for-test)") {
            storage.location = "(memory-for-test)";
            storage.factory = () => new StorageBackendMemory();
        }

        const simulator = config.simulator ?? new NetworkSimulator();
        environment.set(Network, simulator.addHost(networkIndex));

        config.environment = environment;

        if (config.index) {
            config.id = `node${networkIndex.toString(16).padStart(2, "0")}`;
        }
        super(config);

        this.#simulator = simulator;
    }

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

    static async createOnline<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint>(
        type?: T,
        options?: MockServerNode.Options<T>,
    ): Promise<MockServerNode<T>>;
    static async createOnline<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint>(
        definition: T | MockServerNode.Configuration<T>,
        options?: MockServerNode.Options<T>,
    ): Promise<MockServerNode<T>>;
    static async createOnline<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint>(
        definition: T | MockServerNode.Configuration<T>,
        options?: MockServerNode.Options<T>,
    ) {
        const config = Node.nodeConfigFor(
            ServerNode.RootEndpoint as T,
            definition,
            options ?? ({} as MockServerNode.Options<T>),
        );

        const node = new MockServerNode<ServerNode.RootEndpoint>(config.type, config);

        let device = config.device;
        if (device === undefined && !("device" in config)) {
            device = OnOffLightDevice;
        }

        if (device) {
            await node.add(device);
        }

        if (options?.online === false) {
            await node.construction;
            return node;
        }

        await node.start();

        node.env.get(ExchangeManager).initiateExchange = address => {
            const exchange = new MockExchange(address, { session: node.env.get(SessionManager).getSession(1) });

            node.#newExchanges.push(exchange);

            return exchange;
        };

        if (!node.lifecycle.isOnline) {
            await node.lifecycle.online;
        }

        return node;
    }

    async handleExchange(): Promise<MockExchange> {
        return await this.#newExchanges.read();
    }

    async createSession(options?: Partial<Parameters<SessionManager["createSecureSession"]>[0]>) {
        return await this.env.get(SessionManager).createSecureSession({
            sessionId: 1,
            fabric: undefined,
            peerNodeId: NodeId(0),
            peerSessionId: 1,
            sharedSecret: new Uint8Array(),
            salt: new Uint8Array(),
            isInitiator: false,
            isResumption: false,
            ...options,
        });
    }

    async createExchange(options?: Partial<Parameters<SessionManager["createSecureSession"]>[0]>) {
        return {
            channel: { name: "test" },
            clearTimedInteraction: () => {},
            hasTimedInteraction: () => false,
            hasActiveTimedInteraction: () => false,
            hasExpiredTimedInteraction: () => false,
            session: await this.createSession(options),
            maxPayloadSize: 1000,
            closing: AsyncObservable<[void]>(),
        } as unknown as MessageExchange;
    }

    override async cancel() {
        await MockTime.resolve(super.cancel());
    }

    override async close(stepMs?: number) {
        await MockTime.resolve(super.close(), { macrotasks: true, stepMs });
    }

    async addFabric() {
        const fabric = await TestFabric({ fabrics: this.env.get(FabricManager) });

        // Wait for fabric install
        await this.events.commissioning.fabricsChanged;

        return fabric;
    }
}

export namespace MockServerNode {
    export interface MockOptions extends Node.NodeOptions {
        online?: boolean;
        device?: Endpoint.Definition;
        index?: number;
        simulator?: NetworkSimulator;
    }
    export type Options<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint> = Endpoint.Options<T, MockOptions>;

    export type Configuration<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint> = Endpoint.Configuration<
        T,
        MockOptions
    >;
}
