/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningController, CommissioningControllerOptions } from "#CommissioningController.js";
import {
    Crypto,
    Entropy,
    Environment,
    MatterAggregateError,
    MemoryStorageDriver,
    MockCrypto,
    MockStorageService,
    Network,
    NetworkSimulator,
    RuntimeService,
} from "@matter/general";
import { ServerNode } from "@matter/node";
import { MockServerNode, MockSite } from "@matter/node/testing";

/**
 * A {@link MockSite} that also hosts legacy {@link CommissioningController}s on the same simulated network, so tests
 * get real `PairedNode`s backed by mock crypto, in-memory storage and mock time.
 *
 * Requires {@link MockTime} to be initialized.
 */
export class LegacyControllerSite {
    readonly #site = new MockSite();
    readonly #simulator = new NetworkSimulator();
    readonly #controllers = new Set<CommissioningController>();
    readonly #environments = new Set<Environment>();
    #nextControllerIndex = 0x40;

    /**
     * Adds an On/Off Light device on the shared network and starts it.
     */
    addDevice(options?: MockServerNode.Options<MockServerNode.RootEndpoint>) {
        return this.#site.addDevice({ ...options, simulator: this.#simulator });
    }

    /**
     * Creates and starts a {@link CommissioningController}.  `autoConnect` defaults to `false` so a test decides when
     * paired nodes connect.
     */
    async addController(options?: Partial<Omit<CommissioningControllerOptions, "environment">>) {
        const index = this.#nextControllerIndex++;
        const id = `legacy-controller${index}`;

        const environment = new Environment(id);
        this.#environments.add(environment);
        const crypto = MockCrypto(index);
        environment.set(Entropy, crypto);
        environment.set(Crypto, crypto);
        environment.set(Network, this.#simulator.addHost(index));
        new MockStorageService(environment, () => new MemoryStorageDriver(this.#site.storageFor(id)));

        const controller = new CommissioningController({
            adminFabricLabel: "legacy test",
            autoConnect: false,
            ...options,
            environment: { environment, id },
        });
        this.#controllers.add(controller);

        await MockTime.resolve(controller.start(), { macrotasks: true });

        return controller;
    }

    /**
     * Creates an {@link Environment} with mock crypto, in-memory storage and a host on the shared network.
     */
    addEnvironment() {
        const index = this.#nextControllerIndex++;
        const environment = new Environment(`legacy-environment${index}`);
        this.#environments.add(environment);
        const crypto = MockCrypto(index);
        environment.set(Entropy, crypto);
        environment.set(Crypto, crypto);
        environment.set(Network, this.#simulator.addHost(index));
        return environment;
    }

    /**
     * Commissions the device into the controller's fabric without creating a `PairedNode` for it.
     */
    async commission(controller: CommissioningController, device: ServerNode) {
        const { passcode, discriminator } = device.state.commissioning;

        // Without entropy both sides derive colliding session parameters
        const cryptos = [controller.crypto, device.env.get(Crypto)].filter(isMockCrypto);
        for (const crypto of cryptos) {
            crypto.entropic = true;
        }
        try {
            return await MockTime.resolve(
                controller.commissionNode(
                    {
                        commissioning: {},
                        discovery: { identifierData: { longDiscriminator: discriminator } },
                        passcode,
                    },
                    { connectNodeAfterCommissioning: false },
                ),
                { macrotasks: true },
            );
        } finally {
            for (const crypto of cryptos) {
                crypto.entropic = false;
            }
        }
    }

    /**
     * Adds a controller and a device and commissions the device.
     */
    async addCommissionedPair(options?: Partial<Omit<CommissioningControllerOptions, "environment">>) {
        const controller = await this.addController(options);
        const device = await this.addDevice();
        const nodeId = await this.commission(controller, device);
        return { controller, device, nodeId };
    }

    /**
     * Closes all controllers and their runtimes, then the devices.
     */
    async close() {
        const controllers = [...this.#controllers];
        this.#controllers.clear();
        const environments = [...this.#environments];
        this.#environments.clear();

        await MatterAggregateError.settleSeries(
            [
                () =>
                    MockTime.resolve(
                        MatterAggregateError.allSettled(
                            controllers.map(async controller => {
                                const { env } = controller;
                                try {
                                    await controller.close();
                                } finally {
                                    if (env.owns(RuntimeService)) {
                                        await env.get(RuntimeService).close();
                                    }
                                }
                            }),
                            "Error closing legacy controllers",
                        ),
                        { macrotasks: true },
                    ),
                () => {
                    for (const environment of environments) {
                        environment[Symbol.dispose]();
                    }
                },
                () => this.#site.close(),
            ],
            "Error closing legacy controller site",
        );
    }

    async [Symbol.asyncDispose]() {
        await this.close();
    }
}

function isMockCrypto(crypto: Crypto): crypto is MockCrypto {
    return "entropic" in crypto;
}
