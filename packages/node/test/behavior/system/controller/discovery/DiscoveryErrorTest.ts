/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { CommissioningDiscovery } from "#behavior/system/controller/discovery/CommissioningDiscovery.js";
import {
    DeviceNotDiscoveredError,
    DiscoveryAggregateError,
    DiscoveryError,
    DiscoveryIncompleteError,
    NoDiscoveryTransportError,
} from "#behavior/system/controller/discovery/DiscoveryError.js";
import { InstanceDiscovery } from "#behavior/system/controller/discovery/InstanceDiscovery.js";
import { ClientNodeFactory } from "#node/client/ClientNodeFactory.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { ImplementationError, LogLevel, Seconds, Time } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { PeerCommunicationError, type PeerAddress, ScannerSet } from "@matter/protocol";
import {
    captureDiscoveryLog,
    configure,
    DEVICE,
    DEVICE_B,
    deferred,
    settle,
    TestDiscovery,
    untilAborted,
} from "./discovery-helpers.js";

/** Builds nodes whose construction fails, numbering the failures; only the first `failures` if given. */
class FailingNodeFactory extends ClientNodeFactory {
    #created = 0;

    constructor(
        readonly real: ClientNodeFactory,
        readonly failures = Infinity,
    ) {
        super();
    }

    find() {
        return undefined;
    }

    create(options: ClientNode.Options, peerAddress?: PeerAddress) {
        const node = this.real.create(options, peerAddress);
        const number = ++this.#created;
        if (number <= this.failures) {
            Promise.resolve(node.construction.ready).catch(() => {});
            node.construction.crash(new ImplementationError(`Node construction ${number} failed`));
        }
        return node;
    }

    get nodes() {
        return this.real.nodes;
    }
}

/** Hands out one known node for every device and counts the nodes it creates. */
class KnownNodeFactory extends ClientNodeFactory {
    created = 0;

    constructor(
        readonly real: ClientNodeFactory,
        readonly known: ClientNode,
    ) {
        super();
    }

    find() {
        return this.known;
    }

    create(options: ClientNode.Options, peerAddress?: PeerAddress) {
        this.created++;
        return this.real.create(options, peerAddress);
    }

    get nodes() {
        return this.real.nodes;
    }
}

function useFactory(node: ServerNode, factory: (real: ClientNodeFactory) => ClientNodeFactory) {
    node.env.set(ClientNodeFactory, factory(node.env.get(ClientNodeFactory)));
}

/** Records the nodes it creates, in order. */
class RecordingNodeFactory extends ClientNodeFactory {
    readonly created = new Array<ClientNode>();

    constructor(readonly real: ClientNodeFactory) {
        super();
    }

    find() {
        return undefined;
    }

    create(options: ClientNode.Options, peerAddress?: PeerAddress) {
        const node = this.real.create(options, peerAddress);
        this.created.push(node);
        return node;
    }

    get nodes() {
        return this.real.nodes;
    }
}

describe("DiscoveryError kinds", () => {
    beforeEach(() => {
        MockTime.init();
    });

    it("reports DeviceNotDiscoveredError when commissioning discovery finds no device", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, []);

            const discovery = new CommissioningDiscovery(node, {
                passcode: 12341234,
                discriminator: 1234,
                timeout: Seconds(5),
            });
            const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

            expect(error).instanceOf(DeviceNotDiscoveredError);
            expect(error).instanceOf(DiscoveryError);
        } finally {
            await node.close();
        }
    });

    it("reports DeviceNotDiscoveredError when instance discovery finds no node", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, []);

            const discovery = new InstanceDiscovery(node, { timeout: Seconds(5) });
            const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

            expect(error).instanceOf(DeviceNotDiscoveredError);
            expect(error).instanceOf(DiscoveryError);
        } finally {
            await node.close();
        }
    });

    it("reports DiscoveryIncompleteError when the timeout aborts an attempt in flight", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, [DEVICE]);

            const discovery = new TestDiscovery(node, { timeout: Seconds(5) }, (_win, signal) => untilAborted(signal));
            const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

            expect(error).instanceOf(DiscoveryIncompleteError);
            expect(error).instanceOf(DiscoveryError);
        } finally {
            await node.close();
        }
    });

    // Characterization: attempts that failed with their own errors were reported this way before the subtypes
    it("reports DiscoveryAggregateError when one attempt failed and the others were canceled", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, [DEVICE, DEVICE_B]);

            const discovery = new TestDiscovery(node, { timeout: Seconds(5) }, async (_win, signal, index) => {
                if (index === 0) {
                    throw new PeerCommunicationError("Device did not answer");
                }
                await untilAborted(signal);
            });
            const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

            expect(error).instanceOf(DiscoveryAggregateError);
        } finally {
            await node.close();
        }
    });

    it("rejects with NoDiscoveryTransportError when no scanner is installed for the requested transports", async () => {
        const node = await MockServerNode.createOnline();
        try {
            node.behaviors.require(ControllerBehavior);
            await node.act(agent => agent.load(ControllerBehavior));
            node.env.get(ScannerSet).clear();

            const discovery = new InstanceDiscovery(node, { timeout: Seconds(5) });
            const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

            expect(error).instanceOf(NoDiscoveryTransportError);
            expect(error).instanceOf(DiscoveryError);
        } finally {
            await node.close();
        }
    });

    describe("a found device that cannot be used", () => {
        it("reports the error of a node that could not be built", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);
                useFactory(node, real => new FailingNodeFactory(real));

                const discovery = new InstanceDiscovery(node, { timeout: Seconds(5) });
                const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

                expect(error).instanceOf(ImplementationError);
                expect(error).to.have.property("message", "Node construction 1 failed");
            } finally {
                await node.close();
            }
        });

        it("keeps the first node found when further devices finish their preparation later", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE, DEVICE_B]);
                const factory = new RecordingNodeFactory(node.env.get(ClientNodeFactory));
                node.env.set(ClientNodeFactory, factory);

                const discovery = new InstanceDiscovery(node, { timeout: Seconds(5) });
                const result = await MockTime.resolve(discovery, { macrotasks: true });

                expect(factory.created.length).equals(2);
                expect(result).equals(factory.created[0]);
            } finally {
                await node.close();
            }
        });

        it("waits for a device still being prepared when the scan ends", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);
                const real = node.env.get(ClientNodeFactory);
                const known = real.create({ environment: node.env, commissioning: { descriptor: DEVICE } });
                await known.construction.ready;
                node.env.set(ClientNodeFactory, new KnownNodeFactory(real, known));

                // Holding the commissioning state keeps the discovery's refresh of the known node waiting
                const release = deferred();
                const held = deferred();
                const holder = known.act(async agent => {
                    const { transaction } = agent.context;
                    await transaction.addResources(agent.commissioning);
                    await transaction.begin();
                    held.resolve();
                    await release.promise;
                });
                await MockTime.resolve(held.promise, { macrotasks: true });

                const discovery = new InstanceDiscovery(node, { timeout: Seconds(5) });
                let settled = false;
                const outcome = discovery.then(
                    result => {
                        settled = true;
                        return result;
                    },
                    (error: unknown) => {
                        settled = true;
                        return error;
                    },
                );
                await MockTime.resolve(Time.sleep("past the discovery timeout", Seconds(6)), { macrotasks: true });
                expect(settled).equals(false);

                release.resolve();
                await MockTime.resolve(holder, { macrotasks: true });
                expect(await MockTime.resolve(outcome, { macrotasks: true })).equals(known);
            } finally {
                await node.close();
            }
        });

        it("reports the error of a known node that could not be refreshed", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);
                const real = node.env.get(ClientNodeFactory);
                const known = real.create({ environment: node.env, commissioning: { descriptor: DEVICE } });
                Promise.resolve(known.construction.ready).catch(() => {});
                known.construction.crash(new ImplementationError("Known node is broken"));
                const factory = new KnownNodeFactory(real, known);
                node.env.set(ClientNodeFactory, factory);

                const discovery = new InstanceDiscovery(node, { timeout: Seconds(5) });
                const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

                expect(error).instanceOf(Error);
                expect(error).not.instanceOf(DiscoveryError);
                expect(factory.created).equals(0);
            } finally {
                await node.close();
            }
        });

        it("reports the first device's error when several cannot be used", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE, DEVICE_B]);
                useFactory(node, real => new FailingNodeFactory(real));

                const discovery = new InstanceDiscovery(node, { timeout: Seconds(5) });
                const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

                expect(error).to.have.property("message", "Node construction 1 failed");
            } finally {
                await node.close();
            }
        });

        it("keeps the attempts' own errors over the unusable device's error", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE, DEVICE_B]);
                useFactory(node, real => new FailingNodeFactory(real, 1));

                const discovery = new TestDiscovery(node, { timeout: Seconds(5) }, async () => {
                    throw new PeerCommunicationError("Device did not answer");
                });
                const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

                expect(error).instanceOf(DiscoveryAggregateError);
            } finally {
                await node.close();
            }
        });

        it("reports the error a subclass throws for the found node", async () => {
            const failure = new ImplementationError("Listener broke");
            class ThrowingDiscovery extends InstanceDiscovery {
                protected override onDiscovered() {
                    throw failure;
                }
            }

            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);

                const discovery = new ThrowingDiscovery(node, { timeout: Seconds(5) });

                expect(await MockTime.resolve(settle(discovery), { macrotasks: true })).equals(failure);
            } finally {
                await node.close();
            }
        });

        it("warns once per device and logs repeats at debug", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE, DEVICE]);
                useFactory(node, real => new FailingNodeFactory(real));
                using log = captureDiscoveryLog();

                await MockTime.resolve(settle(new InstanceDiscovery(node, { timeout: Seconds(5) })), {
                    macrotasks: true,
                });

                const about = log.messages.filter(({ text }) => text.includes("use device device-a"));
                expect(about.map(({ level }) => level)).deep.equals([LogLevel.WARN, LogLevel.DEBUG]);
            } finally {
                await node.close();
            }
        });
    });
});
