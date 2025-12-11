/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import {
    Crypto,
    Entropy,
    Environment,
    hex,
    Logger,
    MatterAggregateError,
    MockCrypto,
    Network,
    NetworkSimulator,
    Seconds,
    Storage,
    StorageBackendMemory,
    StorageService,
} from "#general";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import { FabricId } from "#types";
import type { MockServerNode } from "./mock-server-node.js";

const logger = Logger.get("MockSite");

/**
 * Manages a mock network with nodes on it.
 */
export class MockSite {
    #simulator = new NetworkSimulator();
    #nodes = new Set<ServerNode>();
    #nextNetworkIndex = 1;
    #storage = {} as Record<string, Storage>;

    addNode<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint>(
        type?: T,
        options?: MockServerNode.Options<T>,
    ): Promise<ServerNode<T>>;
    addNode<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint>(
        definition: T | MockServerNode.Configuration<T>,
        options?: MockServerNode.Options<T>,
    ): Promise<ServerNode<T>>;
    async addNode<T extends ServerNode.RootEndpoint = ServerNode.RootEndpoint>(
        definition: T | MockServerNode.Configuration<T>,
        options?: MockServerNode.Options<T>,
    ) {
        const config = Node.nodeConfigFor(
            ServerNode.RootEndpoint as T,
            definition,
            options ?? ({} as MockServerNode.Options<T>),
        );

        const index = (config.index ??= this.#nextNetworkIndex++);
        const id = (config.id ??= `node${hex.byte(index)}`);
        const env = (config.environment ??= new Environment(id));
        if (!env.has(Crypto)) {
            const crypto = MockCrypto(index);
            env.set(Entropy, crypto);
            env.set(Crypto, crypto);
        }
        if (!env.has(Network)) {
            env.set(Network, (config.simulator ?? this.#simulator).addHost(index));
        }

        const storage = env.get(StorageService);
        const location = `/memory/${id}`;
        if (storage.location !== location) {
            storage.location = location;
            storage.factory = () => this.storageFor(id);
        }

        // Note that we don't use MockServerNode as we don't actually want anything mocked
        const node = new ServerNode(config);
        this.#nodes.add(node);

        if (config.device) {
            await node.add(config.device);
        }

        await node.start();

        node.lifecycle.destroyed.once(() => {
            this.#nodes.delete(node);
        });

        return node;
    }

    async addController(options?: MockServerNode.Options<ServerNode.RootEndpoint>) {
        options ??= {};
        if (options.controller?.adminFabricId === undefined) {
            options.controller ??= {};
            options.controller.adminFabricId = FabricId(1);
        }
        return await this.addNode(undefined, {
            online: false,
            ...options,
            commissioning: { enabled: false, ...options.commissioning },
        });
    }

    async addUncommissionedPair(options?: MockSite.PairOptions) {
        options ??= {};
        const controller = await this.addController(options.controller);
        const device = await this.addNode(undefined, {
            device: OnOffLightDevice,
            ...options.device,
        });

        return { controller, device };
    }

    async addCommissionedPair(options?: MockSite.PairOptions) {
        const { controller, device } = await this.addUncommissionedPair(options);

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;

        // We end up with session collisions without entropy so enable during pairing
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });

        controllerCrypto.entropic = deviceCrypto.entropic = false;

        return { controller, device };
    }

    async close() {
        try {
            await MockTime.resolve(
                MatterAggregateError.allSettled(
                    [...this.#nodes].map(async node => {
                        await node.close();
                    }),
                ),

                // Not sure why macrotasks are necessary; something hangs with microtasks but haven't tracked down
                { macrotasks: true },
            );
        } catch (e) {
            logger.error("Error closing mock site", e);
        }
    }

    storageFor(id: string | { id: string }) {
        if (typeof id !== "string") {
            id = id.id;
        }
        if (!(id in this.#storage)) {
            this.#storage[id] = new StorageBackendMemory();
        }
        return this.#storage[id];
    }

    async [Symbol.asyncDispose]() {
        await this.close();
    }
}

export namespace MockSite {
    export interface PairOptions {
        controller?: MockServerNode.Configuration<any>;
        device?: MockServerNode.Configuration<any>;
    }
}
