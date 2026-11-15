/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { EventsBehavior } from "#behavior/system/events/EventsBehavior.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { NetworkRuntime } from "#behavior/system/network/NetworkRuntime.js";
import { AccessControlServer } from "#behaviors/access-control";
import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { DescriptorBehavior } from "#behaviors/descriptor";
import { OnOffServer } from "#behaviors/on-off";
import { PumpConfigurationAndControlServer } from "#behaviors/pump-configuration-and-control";
import { WebRtcTransportProviderServer } from "#behaviors/web-rtc-transport-provider";
import { ColorTemperatureLightDevice } from "#devices/color-temperature-light";
import { ExtendedColorLightDevice } from "#devices/extended-color-light";
import { LightSensorDevice } from "#devices/light-sensor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { PumpDevice } from "#devices/pump";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointBehaviorsError, EndpointPartsError, IdentityConflictError } from "#endpoint/errors.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { LocalActorContext } from "#index.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { IdentityService } from "#node/server/IdentityService.js";
import { ServerEnvironment } from "#node/server/ServerEnvironment.js";
import { ServerNode } from "#node/ServerNode.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ServerEndpointStore } from "#storage/server/ServerEndpointStore.js";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { StoreClosedError } from "#storage/StoreLifecycle.js";
import {
    Bytes,
    CrashedDependencyError,
    createPromise,
    Crypto,
    DatafileRoot,
    Diagnostic,
    DiagnosticPresentation,
    DestroyedDependencyError,
    DiagnosticSource,
    DnsCodec,
    DnsMessage,
    DnsRecordType,
    Environment,
    ImplementationError,
    InternalError,
    Lifecycle,
    Instant,
    isObject,
    LogDestination,
    LogFormat,
    Logger,
    LogLevel,
    MemoryBlobStorageDriver,
    MemoryStorageDriver,
    MatterAggregateError,
    MdnsSocket,
    MockCrypto,
    MockFilesystem,
    MockNetwork,
    MockUdpSocket,
    Network,
    NetworkError,
    NetworkSimulator,
    Seconds,
    STANDARD_MATTER_PORT,
    StorageError,
    StorageManager,
    StorageService,
    Time,
    UdpSocketOptions,
} from "@matter/general";
import { AccessLevel, BasicInformation, ElementTag, FeatureMap } from "@matter/model";
import {
    CommissioningHelper,
    FAILSAFE_LENGTH_S,
    MockServerNode,
    MockSite,
    subscribedPeer,
    testFactoryReset,
} from "@matter/node/testing";
import {
    AttestationCertificateManager,
    CertificateAuthority,
    FabricAuthority,
    CertificationDeclaration,
    ClientSubscriptions,
    FabricManager,
    MdnsService,
    NodeSession,
    OccurrenceManager,
    PeerAddress,
    PeerSet,
    ProtocolMocks,
    SessionManager,
    Val,
} from "@matter/protocol";
import { EndpointNumber, FabricId, FabricIndex, NodeId, StreamUsage, VendorId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { BasicInformation as BasicInformationCluster } from "@matter/types/clusters/basic-information";
import { PumpConfigurationAndControl } from "@matter/types/clusters/pump-configuration-and-control";
import { captureWarningsOf } from "../endpoint/validation/validation-helpers.js";
import { HoldingStorageDriver, WriteHold } from "../storage/holding-storage-driver.js";

const commissioning = CommissioningHelper();

async function writeBlob(store: ServerNodeStore) {
    const driver = await store.bdxStore();
    await driver.writeBlobFromStream(
        [],
        "update.bin",
        new ReadableStream<Bytes>({
            start(controller) {
                controller.enqueue(Bytes.fromHex("00010203"));
                controller.close();
            },
        }),
    );
    return driver;
}
const CRASH_MESSAGE = "Intentional behavior crash";

class CrashingServer extends Behavior {
    static override readonly id = "crashing";
    static override readonly early = true;

    override initialize() {
        throw new InternalError(CRASH_MESSAGE);
    }
}

function storageKeysUnder(storage: Record<string, unknown>, context: string) {
    return Object.keys(storage).filter(key => key === context || key.startsWith(`${context}.`));
}

/** Commission {@link device} onto {@link controller}, entropy enabled as {@link MockSite} does for pairing. */
async function commissionOnto(controller: ServerNode, device: ServerNode) {
    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const deviceCrypto = device.env.get(Crypto) as MockCrypto;
    controllerCrypto.entropic = deviceCrypto.entropic = true;

    try {
        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });
    } finally {
        controllerCrypto.entropic = deviceCrypto.entropic = false;
    }
}

describe("ServerNode", () => {
    beforeEach(() => {
        commissioning.fabricNumber = undefined;
    });

    describe("emits correct lifecycle changes", () => {
        function instrument(node: ServerNode) {
            const changes = new Array<[string, string?]>();

            node.lifecycle.changed.on((type, endpoint) => {
                changes.push([type, endpoint.toString()]);
            });

            for (const event of ["online", "offline", "ready", "partsReady"] as const) {
                node.lifecycle[event].on(() => {
                    changes.push([event]);
                });
            }

            return changes;
        }

        it("with part at startup", async () => {
            const node = new MockServerNode({ parts: [OnOffLightDevice] });

            const changes = instrument(node);

            await node.start();
            await node.close();

            expect(changes).deep.equals([
                ["ready", "node0"],
                ["ready"],
                ["idAssigned", "node0.part0"],
                ["numberAssigned", "node0.part0"],
                ["installed", "node0.part0"],
                ["ready", "node0.part0"],
                ["partsReady", "node0.part0"],
                ["partsReady", "node0"],
                ["partsReady"],
                ["online"],
                ["destroying", "node0"],
                ["offline"],
                ["destroying", "node0.part0"],
                ["destroyed", "node0.part0"],
                ["destroyed", "node0"],
            ]);
        });

        it("with part added before online", async () => {
            const node = new MockServerNode({});

            const changes = instrument(node);

            await node.add(OnOffLightDevice);
            await node.start();
            await node.close();

            expect(changes).deep.equals([
                ["ready", "node0"],
                ["ready"],
                ["partsReady", "node0"],
                ["partsReady"],
                ["idAssigned", "node0.part0"],
                ["numberAssigned", "node0.part0"],
                ["installed", "node0.part0"],
                ["ready", "node0.part0"],
                ["partsReady", "node0.part0"],
                ["online"],
                ["destroying", "node0"],
                ["offline"],
                ["destroying", "node0.part0"],
                ["destroyed", "node0.part0"],
                ["destroyed", "node0"],
            ]);
        });

        it("with part added after online", async () => {
            const node = new MockServerNode({});

            const changes = instrument(node);

            await node.start();
            await node.add(OnOffLightDevice);
            await node.close();

            expect(changes).deep.equals([
                ["ready", "node0"],
                ["ready"],
                ["partsReady", "node0"],
                ["partsReady"],
                ["online"],
                ["idAssigned", "node0.part0"],
                ["numberAssigned", "node0.part0"],
                ["installed", "node0.part0"],
                ["ready", "node0.part0"],
                ["partsReady", "node0.part0"],
                ["destroying", "node0"],
                ["offline"],
                ["destroying", "node0.part0"],
                ["destroyed", "node0.part0"],
                ["destroyed", "node0"],
            ]);
        });
    });

    it("announces and expires correctly", async () => {
        const simulator = new NetworkSimulator();

        const scannerChannel = new MockUdpSocket(simulator.addHost(2), {
            listeningPort: 5353,
            type: "udp6",
        });
        scannerChannel.addMembership("ff02::fb");

        const advertisementReceived = new Promise<Bytes>(resolve =>
            scannerChannel.onData((_netInterface, _peerAddress, _peerPort, data) => resolve(data)),
        );

        const node = await MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint,
            network: { port: 0 },
            commissioning: { discriminator: 2002 },
            basicInformation: { vendorId: VendorId(65501) },
            simulator,
        });

        const operationalPort = node.state.network.operationalPort;
        expect(operationalPort).greaterThan(0);
        expect(operationalPort).not.equal(5540);

        const advertisement = DnsCodec.decode(await advertisementReceived);

        expect(Seconds.of(advertisement?.answers[0]?.ttl)).equals(120);

        function answer(name: string) {
            for (const answer of (advertisement as DnsMessage).answers) {
                if (typeof answer.value === "string" && answer.value.startsWith(name)) {
                    return answer.value.split(".")[0].substring(name.length);
                }
            }
        }

        function record(recordType: DnsRecordType) {
            for (const record of (advertisement as DnsMessage).answers) {
                if (record.recordType === recordType) {
                    return record.value;
                }
            }
        }

        expect(answer("_L")).equals("2002");
        expect(answer("_S")).equals(`${2002 % 0xf}`);
        expect(answer("_V")).equals("65501");
        expect(answer("_T")).equals("256");
        expect(answer("_CM")).equals("");

        expect(record(DnsRecordType.AAAA)).equals("abcd::80");
        expect(record(DnsRecordType.A)).equals("10.10.10.128");
        expect(record(DnsRecordType.SRV)?.port).equals(operationalPort);

        const expirationReceived = new Promise<Bytes>(resolve =>
            scannerChannel.onData((_netInterface, _peerAddress, _peerPort, data) => resolve(data)),
        );

        await node.close();

        const expiration = DnsCodec.decode(await expirationReceived);
        expect(expiration?.answers[0]?.ttl).equals(0);
    });

    it("lists its peers in its diagnostics", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = controller.peers.get("peer1");
        if (peer === undefined) {
            expect.fail("No commissioned peer");
        }

        const text = LogFormat.formats.plain(Diagnostic.valueOf(controller));

        expect(text).contains(`${peer} ${peer.lifecycle.isOnline ? "online" : "offline"}`);
    });

    describe("delete", () => {
        function destroyingOf(node: ServerNode) {
            const destroying = new Array<string>();
            node.lifecycle.changed.on((type, endpoint) => {
                if (type === "destroying") {
                    destroying.push(endpoint.toString());
                }
            });
            return destroying;
        }

        it("emits Destroying once for an endpoint and its parts", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const aggregator = await node.add(AggregatorEndpoint, {
                id: "aggregator",
                parts: [{ type: OnOffLightDevice, id: "child" }],
            });
            const destroying = destroyingOf(node);

            await aggregator.delete();
            await aggregator.close();

            expect(destroying).deep.equals(["node0.aggregator", "node0.aggregator.child"]);
        });

        it("increases the ConfigurationVersion of the bridged endpoint above and only after removal", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const bridged = await aggregator.add(OnOffLightDevice.with(BridgedDeviceBasicInformationServer), {
                id: "bridged",
                bridgedDeviceBasicInformation: { configurationVersion: 5 },
                parts: [{ type: OnOffLightDevice, id: "child" }],
            });
            const child = bridged.parts.require("child");
            const childNumber = child.number;
            const rootBefore = node.state.basicInformation.configurationVersion;
            let listedWhenIncreased: boolean | undefined;
            node.events.basicInformation.configurationVersion$Changed.on(() => {
                listedWhenIncreased = bridged.state.descriptor.partsList.includes(childNumber);
            });

            await child.delete();

            expect(bridged.stateOf(BridgedDeviceBasicInformationServer).configurationVersion).equals(6);
            expect(node.state.basicInformation.configurationVersion).equals(rootBefore + 1);
            expect(listedWhenIncreased).equals(false);
        });

        it("joins a concurrent delete of an endpoint", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const light = await node.add(OnOffLightDevice, { id: "light" });
            const before = node.state.basicInformation.configurationVersion;

            await Promise.all([light.delete(), light.delete()]);

            expect(node.state.basicInformation.configurationVersion).equals(before + 1);
        });

        it("refuses deleting an endpoint while it closes", async () => {
            await using site = new MockSite();
            const id = "deleteWhileClosing";
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const light = await node.add(new Endpoint(OnOffLightDevice, { id: "light" }));
            const number = light.number;
            await light.set({ onOff: { onOff: true } });

            const closing = light.close();
            await expect(light.delete()).rejectedWith(DestroyedDependencyError, /is closing, so .* cannot be deleted/);
            await closing;
            await node.close();

            const reopened = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            const reAdded = await reopened.add(new Endpoint(OnOffLightDevice, { id: "light" }));
            expect(reAdded.number).equals(number);
            expect(reAdded.state.onOff.onOff).equals(true);
        });

        it("rejects when the reset of the endpoint fails and still removes it", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const light = await node.add(OnOffLightDevice, { id: "light" });
            light.lifecycle.reset.on(() => {
                throw new ImplementationError("Reset refused for test");
            });

            await expect(light.delete()).rejected;

            expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
            expect(node.endpoints.has(light)).equals(false);
        });

        it("rejects when the reset of a part fails and still removes the endpoint", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const aggregator = await node.add(AggregatorEndpoint, {
                id: "aggregator",
                parts: [{ type: OnOffLightDevice, id: "child" }],
            });
            aggregator.parts.require("child").lifecycle.reset.on(() => {
                throw new ImplementationError("Reset refused for test");
            });

            await expect(aggregator.delete()).rejected;

            expect(aggregator.construction.status).equals(Lifecycle.Status.Destroyed);
            expect(node.endpoints.has(aggregator)).equals(false);
        });

        it("waits for a delete in progress when closing", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const light = await node.add(OnOffLightDevice, { id: "light" });

            const deleting = light.delete();
            const closing = light.close();
            await deleting;
            await closing;

            expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
            expect(node.endpoints.has(light)).equals(false);
        });

        it("rejects delete when the reset of a ServerNode fails and still erases its storage", async () => {
            await using site = new MockSite();
            const id = "resetFailsOnDelete";
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            await node.add(new Endpoint(OnOffLightDevice, { id: "light", number: EndpointNumber(7) }));
            node.lifecycle.reset.on(() => {
                throw new ImplementationError("Reset refused for test");
            });

            await expect(node.delete()).rejected;

            const reopened = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            const light = await reopened.add(new Endpoint(OnOffLightDevice, { id: "light" }));
            expect(light.number).equals(1);
        });

        it("restores defaults and rejects on factory reset when the reset of the ServerNode fails", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const light = await node.add(OnOffLightDevice, { id: "light" });
            await light.set({ onOff: { onOff: true } });
            node.lifecycle.reset.on(() => {
                throw new ImplementationError("Reset refused for test");
            });

            await expect(node.erase()).rejectedWith(MatterAggregateError, /Error erasing node0/);

            expect(node.construction.status).equals(Lifecycle.Status.Active);
            expect(light.state.onOff.onOff).equals(false);
        });

        it("erases the storage of a deleted ServerNode", async () => {
            await using site = new MockSite();
            const id = "deletedNode";
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            await node.add(new Endpoint(OnOffLightDevice, { id: "light", number: EndpointNumber(7) }));

            await node.delete();

            const reopened = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            const light = await reopened.add(new Endpoint(OnOffLightDevice, { id: "light" }));
            expect(light.number).equals(1);
        });

        it("refuses deleting a ServerNode while it closes", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });

            const closing = node.close();
            await expect(node.delete()).rejectedWith(DestroyedDependencyError, /is closing, so it cannot be deleted/);
            await closing;
        });

        it("joins a second delete of a ServerNode", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });

            const first = node.delete();
            const second = node.delete();
            await first;
            await second;

            expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
        });

        it("increases the root ConfigurationVersion once", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const light = await node.add(OnOffLightDevice, { id: "light" });
            const before = node.state.basicInformation.configurationVersion;

            await light.delete();

            expect(node.state.basicInformation.configurationVersion).equals(before + 1);
        });

        it("of a ServerNode emits Destroying once and does not restart the node", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            await node.add(OnOffLightDevice, { id: "light" });

            const changes = new Array<string>();
            node.lifecycle.changed.on((type, endpoint) => {
                changes.push(`${type} ${endpoint}`);
            });
            for (const event of ["online", "offline", "ready"] as const) {
                node.lifecycle[event].on(() => {
                    changes.push(event);
                });
            }

            await node.delete();

            expect(changes.filter(change => change === "destroying node0")).deep.equals(["destroying node0"]);
            const afterDestroying = changes.slice(changes.indexOf("destroying node0"));
            expect(afterDestroying).not.contains("online");
            expect(afterDestroying).not.contains("ready");
            expect(afterDestroying.filter(change => change.startsWith("ready "))).deep.equals([]);
        });
    });

    describe("lifecycle verbs", () => {
        type Verb = "erase" | "delete" | "close";

        for (const verb of ["close", "delete"] as const) {
            it(`refuses to start a node after ${verb}`, async () => {
                const node = await MockServerNode.createOnline();

                await node[verb]();

                await expect(node.start()).rejectedWith(
                    DestroyedDependencyError,
                    verb === "close" ? /is closed, so it cannot start/ : /is deleted, so it cannot start/,
                );
            });
        }

        const cases: Array<{
            first: Verb;
            second: Verb;
            rejects: boolean;
            phases: [afterFirst: string, afterSecond: string, settled: string];
            destroyed: boolean;
        }> = [
            {
                first: "erase",
                second: "erase",
                rejects: false,
                phases: ["erasing", "erasing", "idle"],
                destroyed: false,
            },
            {
                first: "erase",
                second: "delete",
                rejects: false,
                phases: ["erasing", "deleting", "deleting"],
                destroyed: true,
            },
            {
                first: "erase",
                second: "close",
                rejects: false,
                phases: ["erasing", "closing", "closing"],
                destroyed: true,
            },
            {
                first: "delete",
                second: "erase",
                rejects: true,
                phases: ["deleting", "deleting", "deleting"],
                destroyed: true,
            },
            {
                first: "delete",
                second: "delete",
                rejects: false,
                phases: ["deleting", "deleting", "deleting"],
                destroyed: true,
            },
            {
                first: "delete",
                second: "close",
                rejects: false,
                phases: ["deleting", "deleting", "deleting"],
                destroyed: true,
            },
            {
                first: "close",
                second: "erase",
                rejects: true,
                phases: ["closing", "closing", "closing"],
                destroyed: true,
            },
            {
                first: "close",
                second: "delete",
                rejects: true,
                phases: ["closing", "closing", "closing"],
                destroyed: true,
            },
            {
                first: "close",
                second: "close",
                rejects: false,
                phases: ["closing", "closing", "closing"],
                destroyed: true,
            },
        ];

        for (const { first, second, rejects, phases, destroyed } of cases) {
            it(`${second} while ${first} runs ${rejects ? "throws" : "completes"}`, async () => {
                await using node = await MockServerNode.createOnline(undefined, { device: undefined });

                const firstDone = node[first]();
                expect(node.lifecycle.isTerminal).equals(phases[0] === "deleting" || phases[0] === "closing");
                const secondDone = node[second]();
                expect(node.lifecycle.isTerminal).equals(phases[1] === "deleting" || phases[1] === "closing");

                if (rejects) {
                    await expect(secondDone).rejectedWith(DestroyedDependencyError, /so it cannot be (erased|deleted)/);
                } else {
                    await secondDone;
                    if (destroyed && second !== "erase") {
                        expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
                    }
                }
                await firstDone;

                expect(node.lifecycle.isTerminal).equals(phases[2] === "deleting" || phases[2] === "closing");
                expect(node.construction.status).equals(
                    destroyed ? Lifecycle.Status.Destroyed : Lifecycle.Status.Active,
                );
            });
        }

        it("waits for a delete in progress when closing the node", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            let deleted = false;

            const deleting = node.delete().then(() => {
                deleted = true;
            });
            // Bypass the MockTime pump of MockServerNode.close, which would let the delete finish meanwhile
            await ServerNode.prototype.close.call(node);

            expect(deleted).equals(true);
            await deleting;
        });

        it("does not restart a node that is deleted while it is erased", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            let restarted = false;
            let deleting: Promise<void> | undefined;
            node.lifecycle.offline.on(() => {
                deleting ??= node.delete();
            });
            node.construction.change.on(status => {
                if (status === Lifecycle.Status.Active) {
                    restarted = true;
                }
            });

            await node.erase();
            await deleting;

            expect(deleting).not.undefined;
            expect(restarted).equals(false);
            expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
        });

        it("does not bring a node online again that is closed while it is erased", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            let online = false;

            const erasing = node.erase();
            const closing = node.close();
            node.lifecycle.online.on(() => {
                online = true;
            });
            await erasing;
            await closing;

            expect(online).equals(false);
            expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
        });
    });

    describe("operational port", () => {
        it("binds the standard Matter port for a commissionable node without an explicit port", async () => {
            const node = await MockServerNode.createOnline({
                type: MockServerNode.RootEndpoint,
                commissioning: { enabled: true },
            });

            expect(node.state.network.port).equals(STANDARD_MATTER_PORT);
            expect(node.state.network.operationalPort).equals(STANDARD_MATTER_PORT);

            await node.close();
        });

        it("uses an ephemeral operational port for a controller node without an explicit port", async () => {
            const node = await MockServerNode.createOnline({
                type: MockServerNode.RootEndpoint,
                commissioning: { enabled: false },
            });

            expect(node.state.network.port).equals(undefined);
            expect(node.state.network.operationalPort).greaterThan(0);
            expect(node.state.network.operationalPort).not.equals(STANDARD_MATTER_PORT);

            await node.close();
        });

        it("honors an explicit port on a commissionable node", async () => {
            const node = await MockServerNode.createOnline({
                type: MockServerNode.RootEndpoint,
                commissioning: { enabled: true },
                network: { port: 5555 },
            });

            expect(node.state.network.port).equals(5555);
            expect(node.state.network.operationalPort).equals(5555);

            await node.close();
        });

        it("honors an explicit port on a controller node", async () => {
            const node = await MockServerNode.createOnline({
                type: MockServerNode.RootEndpoint,
                commissioning: { enabled: false },
                network: { port: 5555 },
            });

            expect(node.state.network.port).equals(5555);
            expect(node.state.network.operationalPort).equals(5555);

            await node.close();
        });
    });

    it("commissions", async () => {
        const { node } = await commissioning.commission();

        await MockTime.resolve(node.stop());

        await node.close();
    });

    it("times out commissioning", async () => {
        const { node } = await commissioning.almostCommission();

        const opcreds = node.state.operationalCredentials;

        if (!opcreds.commissionedFabrics) {
            await MockTime.resolve(node.events.operationalCredentials.commissionedFabrics$Changed);
        }

        expect(opcreds.commissionedFabrics).equals(1);

        await MockTime.advance(FAILSAFE_LENGTH_S * 1000 + 1);

        if (opcreds.commissionedFabrics) {
            await MockTime.resolve(node.events.operationalCredentials.commissionedFabrics$Changed);
        }

        expect(opcreds.commissionedFabrics).equals(0);

        await node.close();
    });

    it("commissions with delayed provided certificates", async () => {
        const vendorId = VendorId(0xfff1);
        const productId = 0x8000;
        let commissioningServer2CertificateProviderCalled = false;
        const node = await MockServerNode.createOnline({
            type: MockServerNode.RootEndpoint,
            operationalCredentials: {
                certification: async () => {
                    const paa = await AttestationCertificateManager.create(MockCrypto(), vendorId);
                    const { keyPair: dacKeyPair, dac } = await paa.getDACert(productId);
                    const declaration = await CertificationDeclaration.generate(MockCrypto(), vendorId, productId);

                    commissioningServer2CertificateProviderCalled = true;
                    return {
                        privateKey: dacKeyPair.privateKey,
                        certificate: dac,
                        intermediateCertificate: await paa.getPAICert(),
                        declaration,
                    };
                },
            },
        });

        const exchange = new ProtocolMocks.Exchange();

        const contextOptions = { exchange, command: true };

        await node.online(contextOptions, async agent => {
            await agent.generalCommissioning.armFailSafe({
                expiryLengthSeconds: FAILSAFE_LENGTH_S,
                breadcrumb: 4,
            });
        });
        expect(commissioningServer2CertificateProviderCalled).equals(false);

        await node.online(contextOptions, async agent => {
            await agent.generalCommissioning.setRegulatoryConfig({
                newRegulatoryConfig: 2,
                countryCode: "XX",
                breadcrumb: 5,
            });
        });
        expect(commissioningServer2CertificateProviderCalled).equals(false);

        await node.online(contextOptions, async agent => {
            await agent.operationalCredentials.certificateChainRequest({ certificateType: 2 });
        });
        expect(commissioningServer2CertificateProviderCalled).equals(true);

        await node.close();
    });

    it("decommissions and recommissions", async () => {
        const { node, contextOptions } = await commissioning.commission();

        const fabricIndex = await node.online(
            contextOptions,
            async agent => agent.operationalCredentials.state.currentFabricIndex,
        );

        await node.online(contextOptions, async agent => {
            await agent.operationalCredentials.removeFabric({ fabricIndex });
        });

        // Node should decommission...
        if (node.lifecycle.isCommissioned) {
            await node.lifecycle.decommissioned;
        }

        // Simulate receiving the response to the removeFabric request which normally closes the underlying session
        // delayed
        await (contextOptions.exchange.session as NodeSession).handlePeerClose();
        await contextOptions.exchange.close();

        // ...then go offline...
        if (node.lifecycle.isOnline) {
            await MockTime.resolve(node.lifecycle.offline);
        }

        // ...then go back online
        if (!node.lifecycle.isOnline) {
            await MockTime.resolve(node.lifecycle.online);
        }

        await commissioning.commission(node);

        await node.close();
    });

    describe("removes a fabric while another session holds the fail-safe", () => {
        function captureCommissioningLogs() {
            const logged = new Array<{ level: LogLevel; text: string }>();
            Logger.destinations.capture = LogDestination({
                format: LogFormat.formats.plain,
                write(text, message) {
                    if (message.level >= LogLevel.WARN && message.facility === "Commissioning") {
                        logged.push({ level: message.level, text });
                    }
                },
            });
            return {
                logged,
                [Symbol.dispose]() {
                    delete Logger.destinations.capture;
                },
            };
        }

        /** Records the factory resets of `node`; each entry settles when its reset is done. */
        function watchErase(node: MockServerNode) {
            const erase = node.erase.bind(node);
            const resets = new Array<Promise<void>>();
            node.erase = () => {
                const reset = erase();
                resets.push(reset);
                return reset;
            };
            return resets;
        }

        async function armFailsafe(node: MockServerNode, expiryLengthSeconds = FAILSAFE_LENGTH_S) {
            const exchange = await node.createExchange();
            await node.online({ exchange, command: true }, async agent => {
                await agent.generalCommissioning.armFailSafe({ expiryLengthSeconds, breadcrumb: 1 });
            });
            return exchange;
        }

        const OPERATIONAL_SESSION_ID = 50;

        /** Opens a session that is not PASE and belongs to no fabric, so the pending reset waits for it. */
        async function openOperationalSession(node: MockServerNode) {
            await node.createExchange({
                id: OPERATIONAL_SESSION_ID,
                peerSessionId: OPERATIONAL_SESSION_ID,
                peerNodeId: NodeId(OPERATIONAL_SESSION_ID),
            });
        }

        async function closeOperationalSession(node: MockServerNode) {
            for (const session of node.env.get(SessionManager).sessions) {
                if (session.id === OPERATIONAL_SESSION_ID) {
                    await session.handlePeerClose();
                }
            }
        }

        async function removeFabric(node: MockServerNode, contextOptions: { exchange: ProtocolMocks.Exchange }) {
            const fabricIndex = await node.online(
                contextOptions,
                async agent => agent.operationalCredentials.state.currentFabricIndex,
            );
            const changes = new Array<[FabricIndex, string]>();
            node.events.commissioning.fabricsChanged.on((index, action) => void changes.push([index, action]));

            await node.online(contextOptions, async agent => {
                await agent.operationalCredentials.removeFabric({ fabricIndex });
            });

            expect(changes).deep.equals([[fabricIndex, "deleted"]]);
        }

        it("decommissions on the last fabric and resets once the fail-safe ends", async () => {
            const { node, contextOptions } = await commissioning.commission();
            const resets = watchErase(node);
            const commissionerExchange = await armFailsafe(node);

            await removeFabric(node, contextOptions);
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            expect(node.state.commissioning.commissioned).false;
            expect(node.lifecycle.isCommissioned).false;
            expect(resets.length).equals(0);

            await node.online({ exchange: commissionerExchange, command: true }, async agent => {
                await agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: 0, breadcrumb: 0 });
            });

            expect(resets.length).equals(1);
            await MockTime.resolve(resets[0], { macrotasks: true });

            await node.close();
        });

        it("keeps a commissioning that completes under the fail-safe after the last fabric left", async () => {
            const { node, contextOptions } = await commissioning.commission();
            const resets = watchErase(node);
            const commissionerExchange = await armFailsafe(node);

            await removeFabric(node, contextOptions);
            await commissioning.commission(node, 2, commissionerExchange);
            for (const session of [...node.env.get(SessionManager).sessions]) {
                await session.handlePeerClose();
            }
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            expect(node.state.commissioning.commissioned).true;
            expect(node.env.get(FabricManager).fabrics.length).equals(1);
            expect(resets.length).equals(0);

            await node.close();
        });

        it("resets when the fail-safe rolls back a fabric it added after the last fabric left", async () => {
            const { node, contextOptions } = await commissioning.commission();
            const resets = watchErase(node);
            const commissionerExchange = await armFailsafe(node);

            await removeFabric(node, contextOptions);
            await commissioning.almostCommission(node, 2, commissionerExchange);
            await openOperationalSession(node);
            await closeOperationalSession(node);
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            expect(resets.length).equals(0);

            await node.online({ exchange: commissionerExchange, command: true }, async agent => {
                await agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: 0, breadcrumb: 0 });
            });

            expect(node.env.get(FabricManager).fabrics.length).equals(0);
            expect(resets.length).equals(1);
            await MockTime.resolve(resets[0], { macrotasks: true });

            await node.close();
        });

        it("waits for a fail-safe armed after the last fabric left", async () => {
            const { node, contextOptions } = await commissioning.commission();
            const resets = watchErase(node);
            await openOperationalSession(node);

            await removeFabric(node, contextOptions);
            const commissionerExchange = await armFailsafe(node);
            await closeOperationalSession(node);
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            expect(resets.length).equals(0);

            await node.online({ exchange: commissionerExchange, command: true }, async agent => {
                await agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: 0, breadcrumb: 0 });
            });

            expect(resets.length).equals(1);
            await MockTime.resolve(resets[0], { macrotasks: true });

            await node.close();
        });

        it("does not reset a node that closes while it waits for its last session", async () => {
            const { node, contextOptions } = await commissioning.commission();
            const resets = watchErase(node);
            let reset = false;
            node.lifecycle.reset.on(() => {
                reset = true;
            });
            await openOperationalSession(node);
            await removeFabric(node, contextOptions);
            using capture = captureCommissioningLogs();

            await node.close();
            await Promise.allSettled(resets);

            expect(resets.length).equals(0);
            expect(reset).equals(false);
            expect(capture.logged).deep.equals([]);
        });

        it("keeps the runtime running when the reset after the last fabric fails but the node restarts", async () => {
            const { node, contextOptions } = await commissioning.commission();
            const resets = watchErase(node);
            const commissionerExchange = await armFailsafe(node);
            let crashes = 0;
            node.env.runtime.crashed.on(() => {
                crashes++;
            });
            node.lifecycle.reset.on(() => {
                throw new ImplementationError("Reset refused for test");
            });
            using capture = captureCommissioningLogs();

            await removeFabric(node, contextOptions);
            await node.online({ exchange: commissionerExchange, command: true }, async agent => {
                await agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: 0, breadcrumb: 0 });
            });
            expect(resets.length).equals(1);
            await expect(MockTime.resolve(resets[0], { macrotasks: true })).rejectedWith(MatterAggregateError);
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            expect(crashes).equals(0);
            expect(node.construction.status).equals(Lifecycle.Status.Active);
            expect(capture.logged.map(({ level }) => level)).deep.equals([LogLevel.WARN]);

            await node.close();
        });

        it("logs no warning when the node closes during a failing reset after the last fabric", async () => {
            const { node, contextOptions } = await commissioning.commission();
            const resets = watchErase(node);
            const commissionerExchange = await armFailsafe(node);
            let closing: Promise<void> | undefined;
            node.lifecycle.reset.on(() => {
                closing ??= node.close();
                throw new ImplementationError("Reset refused for test");
            });
            using capture = captureCommissioningLogs();

            await removeFabric(node, contextOptions);
            await node.online({ exchange: commissionerExchange, command: true }, async agent => {
                await agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: 0, breadcrumb: 0 });
            });
            expect(resets.length).equals(1);
            await expect(MockTime.resolve(resets[0], { macrotasks: true })).rejectedWith(MatterAggregateError);
            await MockTime.resolve(closing!, { macrotasks: true });

            expect(capture.logged).deep.equals([]);
        });

        it("crashes the runtime when the reset after the last fabric leaves the node crashed", async () => {
            const { node, contextOptions } = await commissioning.commission();
            const resets = watchErase(node);
            const commissionerExchange = await armFailsafe(node);
            let crashes = 0;
            node.env.runtime.crashed.on(() => {
                crashes++;
            });
            node.env.get(FabricManager).clear = async () => {
                throw new ImplementationError("Storage erase refused for test");
            };
            using capture = captureCommissioningLogs();

            await removeFabric(node, contextOptions);
            await node.online({ exchange: commissionerExchange, command: true }, async agent => {
                await agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: 0, breadcrumb: 0 });
            });
            expect(resets.length).equals(1);
            await expect(MockTime.resolve(resets[0], { macrotasks: true })).rejectedWith(MatterAggregateError);
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            expect(crashes).equals(1);
            expect(capture.logged.map(({ level }) => level)).deep.equals([LogLevel.ERROR]);
        });

        it("stays commissioned when another fabric remains", async () => {
            const { node, contextOptions } = await commissioning.commission();
            (node.env.get(Crypto) as MockCrypto).index++;
            await commissioning.commission(node, 2);
            const resets = watchErase(node);
            await armFailsafe(node);

            await removeFabric(node, contextOptions);
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            expect(node.state.commissioning.commissioned).true;
            expect(resets.length).equals(0);

            await node.close();
        });
    });

    it("factory resets when offline after commission", async () => {
        await testFactoryReset("offline-after-commission");
    });

    it("factory resets when online after commission", async () => {
        await testFactoryReset("online");
    });

    it("factory resets when offline without commission", async () => {
        await testFactoryReset("offline");
    });

    it("handles factory resets when online but in parallel offline is called correctly", async () => {
        await testFactoryReset("offline-during-reset");
    });

    it("keeps node services across a factory reset and releases them on close", async () => {
        const node = await MockServerNode.createOnline();
        const { env } = node;

        const store = env.get(ServerNodeStore);
        const mdns = env.get(MdnsService);
        const identity = env.get(IdentityService);
        const initializer = env.get(EndpointInitializer);
        const changes = env.get(ChangeNotificationService);

        const address = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) });
        identity.reservePeerAddress(address);

        await MockTime.resolve(node.erase(), { macrotasks: true });

        expect(env.get(ServerNodeStore)).equals(store);
        expect(env.get(MdnsService)).equals(mdns);
        expect(env.get(IdentityService)).equals(identity);
        expect(env.get(EndpointInitializer)).equals(initializer);
        expect(env.get(ChangeNotificationService)).equals(changes);
        expect(identity.peerAddressInUse(address)).equals(false);

        await node.close();

        expect(env.has(ServerNodeStore)).equals(false);
        expect(env.root.has(MdnsService)).equals(false);
    });

    it("sanitizes fabric-scoped data once per fabric removal after a factory reset", async () => {
        const { node } = await commissioning.commission();

        await MockTime.resolve(node.erase(), { macrotasks: true });
        await commissioning.commission(node);

        let sanitized = 0;
        const observer = () => void sanitized++;
        ServerEnvironment.fabricScopedDataSanitized.on(observer);

        const [fabric] = node.env.get(FabricManager).fabrics;
        try {
            await MockTime.resolve(fabric.delete(), { macrotasks: true });
        } finally {
            ServerEnvironment.fabricScopedDataSanitized.off(observer);
        }

        expect(sanitized).equals(1);

        await node.close();
    });

    it("releases storage a node opened before its construction failed", async () => {
        let closes = 0;

        class FailingDriver extends MemoryStorageDriver {
            override contexts(contexts: string[]): string[] {
                // The store opens storage, then reads this as it loads peer stores
                throw new ImplementationError(`Cannot enumerate ${contexts.join(".")}`);
            }

            override async close() {
                closes++;
                await super.close();
            }
        }

        await using site = new MockSite({ createStorageDriver: store => new FailingDriver(store) });

        await expect(site.addNode(undefined, { id: "doomed", device: undefined, commissioning: { enabled: false } }))
            .rejected;

        expect(closes).equals(1);
    });

    it("releases the storage lock when an earlier service fails to close", async () => {
        let bufferClosed = false;
        class FailingBuffer extends ClientCacheBuffer {
            override async close() {
                bufferClosed = true;
                throw new ImplementationError("Cannot flush client cache");
            }
        }

        await using site = new MockSite();
        const node = await site.addNode(undefined, { device: undefined, commissioning: { enabled: false } });
        node.env.set(ClientCacheBuffer, new FailingBuffer(new MemoryStorageDriver(), Instant));
        const lock = installLock(node);

        await MockTime.resolve(node.close(), { macrotasks: true });

        expect(bufferClosed).equals(true);
        expect(lock.released).equals(true);
    });

    it("refuses the client cache buffer once its services closed", async () => {
        await using site = new MockSite();
        const node = await site.addNode(undefined, { device: undefined, commissioning: { enabled: false } });
        const buffer = ServerEnvironment.clientCacheBufferOf(node);
        expect(ServerEnvironment.clientCacheBufferOf(node)).equals(buffer);

        await MockTime.resolve(node.close(), { macrotasks: true });

        expect(() => ServerEnvironment.clientCacheBufferOf(node)).throws(DestroyedDependencyError);
    });

    it("releases the storage lock when an endpoint fails to close", async () => {
        await using site = new MockSite();
        const node = await site.addNode(undefined, { device: undefined, commissioning: { enabled: false } });
        const light = await node.add(OnOffLightDevice);
        const initializer = node.env.get(EndpointInitializer);
        const deactivate = initializer.deactivateDescendant.bind(initializer);
        initializer.deactivateDescendant = async endpoint => {
            if (endpoint === light) {
                throw new ImplementationError("Cannot deactivate light");
            }
            await deactivate(endpoint);
        };
        const lock = installLock(node);

        await MockTime.resolve(node.close(), { macrotasks: true });

        expect(lock.released).equals(true);
        expect(DiagnosticSource[DiagnosticPresentation.value]).not.include(node);
    });

    it("releases the storage lock when taking the node offline fails", async () => {
        await using site = new MockSite();
        const node = await site.addNode(undefined, { device: undefined, commissioning: { enabled: false } });
        node.lifecycle.goingOffline.on(() => {
            throw new ImplementationError("Cannot go offline");
        });
        const lock = installLock(node);

        await expect(MockTime.resolve(node.close(), { macrotasks: true })).rejected;

        expect(node.lifecycle.isOnline).equals(false);
        expect(lock.released).equals(true);
    });

    function installLock(node: ServerNode) {
        const lock = { released: false };
        node.env.set(
            DatafileRoot.Lock,
            new DatafileRoot.Lock(new MockFilesystem().directory(node.id), async () => {
                lock.released = true;
            }),
        );
        return lock;
    }

    it("starts a node after an earlier node could not open the mDNS socket", async () => {
        class MdnsBlockingNetwork extends MockNetwork {
            blocked = true;

            override createUdpSocket(options: UdpSocketOptions) {
                if (this.blocked && options.listeningPort === MdnsSocket.BROADCAST_PORT) {
                    return Promise.reject(new NetworkError("mDNS port unavailable"));
                }
                return super.createUdpSocket(options);
            }
        }

        const environment = new Environment("mdns-retry");
        const network = new MdnsBlockingNetwork(new NetworkSimulator(), "00:11:22:33:44:f0", [
            "abcd::f0",
            "10.10.10.240",
        ]);
        environment.set(Network, network);

        await using site = new MockSite();
        const options = { environment, device: undefined, commissioning: { enabled: false } };

        const error = await site.addNode(undefined, { ...options, id: "blocked" }).then(
            () => undefined,
            (e: unknown) => e,
        );
        expect(error).instanceOf(CrashedDependencyError);
        expect(error).has.nested.property("cause.message", "mDNS port unavailable");

        expect(environment.has(MdnsService)).equals(false);
        await MockTime.resolve(environment.runtime.inactive);

        network.blocked = false;
        const node = await site.addNode(undefined, { ...options, id: "recovered" });

        expect(node.lifecycle.isOnline).equals(true);
        expect(environment.get(MdnsService).construction.status).equals(Lifecycle.Status.Active);

        await MockTime.resolve(node.close(), { macrotasks: true });
    });

    it("frees the endpoint numbers a factory reset erases", async () => {
        await using site = new MockSite();
        const id = "renumbering";

        const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
        await node.add(new Endpoint(OnOffLightDevice, { id: "first", number: EndpointNumber(1) }));
        await node.add(new Endpoint(OnOffLightDevice, { id: "second", number: EndpointNumber(2) }));
        await node.close();

        // Only the first endpoint is present this session, so the second's number stays held by its stored endpoint
        const rebooted = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
        await rebooted.add(new Endpoint(OnOffLightDevice, { id: "first" }));

        await MockTime.resolve(rebooted.erase(), { macrotasks: true });

        const added = new Endpoint(OnOffLightDevice, { id: "third" });
        await rebooted.add(added);

        expect(added.number).equals(2);
    });

    describe("a preset number a stored endpoint holds", () => {
        async function storeHolder(site: MockSite, id: string) {
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const holder = await node.add(new Endpoint(OnOffLightDevice, { id: "holder" }));
            const storedNumber = holder.number;
            await node.close();
            return storedNumber;
        }

        // Characterization
        it("goes to the preset endpoint when it constructs before the stored endpoint", async () => {
            await using site = new MockSite();
            const id = "storedNumbers";
            const storedNumber = await storeHolder(site, id);

            const claimant = new Endpoint(OnOffLightDevice, { id: "claimant", number: storedNumber });
            const holder = new Endpoint(OnOffLightDevice, { id: "holder" });
            await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
                parts: [claimant, holder],
            });

            expect(claimant.number).equals(storedNumber);
            expect(holder.number).not.equals(storedNumber);
        });

        // Characterization
        it("is refused when the stored endpoint is installed first", async () => {
            await using site = new MockSite();
            const id = "storedNumbers";
            const storedNumber = await storeHolder(site, id);

            const holder = new Endpoint(OnOffLightDevice, { id: "holder" });
            const claimant = new Endpoint(OnOffLightDevice, {
                id: "claimant",
                number: storedNumber,
                isEssential: false,
            });
            await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
                parts: [holder, claimant],
            });

            expect(holder.number).equals(storedNumber);
            expect(claimant.construction.error).instanceOf(IdentityConflictError);
        });

        // Characterization
        it("ignores a stored number outside the range of a part", async () => {
            await using site = new MockSite();
            const id = "storedNumbers";
            await storeHolder(site, id);
            const storage = site.storageFor(id);
            const holderContext = Object.keys(storage).find(key => key.endsWith(".parts.holder"));
            storage[holderContext!].__number__ = 0;

            const restarted = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            const holder = await restarted.add(new Endpoint(OnOffLightDevice, { id: "holder" }));

            expect(holder.number).equals(2);
        });

        it("starts over from 1 when the next number in storage is corrupt", async () => {
            await using site = new MockSite();
            const id = "storedNumbers";
            await storeHolder(site, id);
            const storage = site.storageFor(id);
            const rootContext = Object.keys(storage).find(key => "__nextNumber__" in storage[key]);
            storage[rootContext!].__nextNumber__ = "corrupt";

            const restarted = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            const added = await restarted.add(new Endpoint(OnOffLightDevice, { id: "added" }));

            expect(added.number).equals(2);
        });

        it("is taken over when the stored endpoint is not part of the node", async () => {
            await using site = new MockSite();
            const id = "storedNumbers";
            const storedNumber = await storeHolder(site, id);

            const warnings = new Array<string>();
            Logger.destinations.capture = LogDestination({
                format: LogFormat.formats.plain,
                write(text, message) {
                    if (message.level === LogLevel.WARN) {
                        warnings.push(text);
                    }
                },
            });
            let claimant, holder;
            try {
                const rebooted = await site.addNode(undefined, {
                    id,
                    device: undefined,
                    commissioning: { enabled: false },
                });
                claimant = await rebooted.add(new Endpoint(OnOffLightDevice, { id: "claimant", number: storedNumber }));
                holder = await rebooted.add(new Endpoint(OnOffLightDevice, { id: "holder" }));
            } finally {
                delete Logger.destinations.capture;
            }

            expect(claimant.number).equals(storedNumber);
            expect(holder.number).not.equals(storedNumber);
            expect(warnings.join("\n")).contains(`takes endpoint number ${storedNumber} from stored endpoint holder`);
        });

        // Characterization
        it("is taken over from an endpoint closed in the same run", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const closed = await node.add(OnOffLightDevice, { id: "closed" });
            const number = closed.number;
            await closed.close();

            const claimant = await node.add(OnOffLightDevice, { id: "claimant", number });
            const returned = await node.add(OnOffLightDevice, { id: "closed" });

            expect(claimant.number).equals(number);
            expect(returned.number).not.equals(number);
        });

        it("clears the stored number of the endpoint it took over", async () => {
            await using site = new MockSite();
            const id = "storedNumbers";
            const storedNumber = await storeHolder(site, id);

            const rebooted = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            await rebooted.add(new Endpoint(OnOffLightDevice, { id: "claimant", number: storedNumber }));
            await rebooted.close();

            const restarted = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            const holder = await restarted.add(new Endpoint(OnOffLightDevice, { id: "holder" }));
            const claimant = await restarted.add(
                new Endpoint(OnOffLightDevice, { id: "claimant", number: storedNumber }),
            );

            expect(holder.number).not.equals(storedNumber);
            expect(claimant.number).equals(storedNumber);
        });

        // Characterization; guards that a store gives up its previous number
        it("keeps both numbers across a restart when a returning endpoint changes its preset", async () => {
            for (const order of ["claimant first", "holder first"]) {
                await using site = new MockSite();
                const id = "storedNumbers";
                const storedNumber = await storeHolder(site, id);

                const parts = () => {
                    const claimant = new Endpoint(OnOffLightDevice, { id: "claimant", number: storedNumber });
                    const holder = new Endpoint(OnOffLightDevice, { id: "holder", number: storedNumber + 10 });
                    return {
                        claimant,
                        holder,
                        list: order === "claimant first" ? [claimant, holder] : [holder, claimant],
                    };
                };

                const warnings = new Array<string>();
                Logger.destinations.capture = LogDestination({
                    format: LogFormat.formats.plain,
                    write(text, message) {
                        if (message.level === LogLevel.WARN) {
                            warnings.push(text);
                        }
                    },
                });
                try {
                    const first = parts();
                    const node = await site.addNode(undefined, {
                        id,
                        device: undefined,
                        commissioning: { enabled: false },
                        parts: first.list,
                    });
                    await node.close();
                } finally {
                    delete Logger.destinations.capture;
                }
                if (order === "holder first") {
                    expect(warnings.join("\n"), order).not.contains("takes endpoint number");
                }

                const second = parts();
                await site.addNode(undefined, {
                    id,
                    device: undefined,
                    commissioning: { enabled: false },
                    parts: second.list,
                });

                expect(second.claimant.number, order).equals(storedNumber);
                expect(second.holder.number, order).equals(storedNumber + 10);
            }
        });

        // Characterization
        it("gives a number two stored endpoints record to the first that returns", async () => {
            for (const first of ["holder", "twin"]) {
                await using site = new MockSite();
                const id = "storedNumbers";
                const storedNumber = await storeHolder(site, id);
                const storage = site.storageFor(id);
                const holderContext = Object.keys(storage).find(key => key.endsWith(".parts.holder"));
                expect(holderContext).not.undefined;
                storage[holderContext!.replace(/holder$/, "twin")] = { ...storage[holderContext!] };

                const restarted = await site.addNode(undefined, {
                    id,
                    device: undefined,
                    commissioning: { enabled: false },
                });
                const second = first === "holder" ? "twin" : "holder";
                const winner = await restarted.add(new Endpoint(OnOffLightDevice, { id: first }));
                const loser = await restarted.add(new Endpoint(OnOffLightDevice, { id: second }));

                expect(winner.number, first).equals(storedNumber);
                expect(loser.number, first).not.equals(storedNumber);
            }
        });
    });

    // Characterization; guards the release of the subtree's numbers on erase
    it("frees the numbers of a deleted subtree", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, {
            id: "aggregator",
            parts: [{ type: OnOffLightDevice, id: "child" }],
        });
        const childNumber = aggregator.parts.require("child").number;

        await aggregator.delete();

        const warnings = new Array<string>();
        Logger.destinations.capture = LogDestination({
            format: LogFormat.formats.plain,
            write(text, message) {
                if (message.level === LogLevel.WARN) {
                    warnings.push(text);
                }
            },
        });
        let reused;
        try {
            reused = await node.add(OnOffLightDevice, { id: "reused", number: childNumber });
        } finally {
            delete Logger.destinations.capture;
        }

        expect(reused.number).equals(childNumber);
        expect(warnings.join("\n")).not.match(/takes (endpoint )?number/);
    });

    it("continues new endpoint numbers after the highest preset number", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        await node.add(OnOffLightDevice, { id: "preset", number: 10 });

        const automatic = await node.add(OnOffLightDevice, { id: "automatic" });

        expect(automatic.number).equals(11);
    });

    it("wraps new endpoint numbers to the lowest free number", async () => {
        await using site = new MockSite();
        const id = "wrapping";
        const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
        const first = await node.add(new Endpoint(OnOffLightDevice, { id: "first" }));
        expect(first.number).equals(1);
        await node.close();

        const storage = site.storageFor(id);
        const rootContext = Object.keys(storage).find(key => "__nextNumber__" in storage[key]);
        expect(rootContext).not.undefined;
        storage[rootContext!].__nextNumber__ = 0xfffe;

        const restarted = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
        await restarted.add(new Endpoint(OnOffLightDevice, { id: "first" }));
        const last = await restarted.add(new Endpoint(OnOffLightDevice, { id: "last" }));
        const wrapped = await restarted.add(new Endpoint(OnOffLightDevice, { id: "wrapped" }));
        await wrapped.delete();
        const next = await restarted.add(new Endpoint(OnOffLightDevice, { id: "next" }));

        expect(last.number).equals(0xfffe);
        expect(wrapped.number).equals(2);
        expect(next.number).equals(3);
    });

    it("keeps the holder's number when a refused endpoint is erased", async () => {
        await using node = new MockServerNode();
        const holder = new Endpoint(OnOffLightDevice, { id: "holder", number: EndpointNumber(4) });
        const refused = new Endpoint(OnOffLightDevice, {
            id: "refused",
            number: EndpointNumber(4),
            isEssential: false,
        });
        node.parts.add(holder);
        node.parts.add(refused);
        await node.start();
        expect(refused.construction.error).instanceOf(IdentityConflictError);

        await expect(refused.erase()).rejectedWith(MatterAggregateError, /Error erasing/);

        const added = new Array<number>();
        for (let i = 0; i < 4; i++) {
            added.push((await node.add(OnOffLightDevice)).number);
        }
        expect(added).not.contains(4);
        expect(node.endpoints.for(4)).equals(holder);
    });

    it("erases the persisted store of a part that crashes before number assignment", async () => {
        await using site = new MockSite();
        const id = "crash-before-number";

        class FailingOnOffServer extends OnOffServer {
            override initialize() {
                throw new ImplementationError("Initialization refused for test");
            }
        }

        {
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const child = new Endpoint(OnOffLightDevice, { id: "child" });
            const parent = new Endpoint(OnOffLightDevice, {
                id: "parent",
                isEssential: false,
                parts: [child],
            });
            await node.add(parent);
            await child.set({ onOff: { onOff: true } });
            await node.close();
        }

        // The part's storage from the prior session loads at startup independent of the crashed part ever reaching
        // number assignment
        {
            const rebooted = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            const crashedChild = new Endpoint(OnOffLightDevice, { id: "child" });
            const crashedParent = new Endpoint(OnOffLightDevice.with(FailingOnOffServer), {
                id: "parent",
                isEssential: false,
                parts: [crashedChild],
            });
            await expect(rebooted.add(crashedParent)).rejectedWith(EndpointBehaviorsError);
            expect(crashedChild.maybeId).equals("child");
            expect(crashedChild.lifecycle.hasNumber).equals(false);

            await crashedChild.erase();
            await rebooted.close();
        }

        {
            const healthy = await site.addNode(undefined, {
                id,
                device: undefined,
                commissioning: { enabled: false },
            });
            const child = new Endpoint(OnOffLightDevice, { id: "child" });
            const parent = new Endpoint(OnOffLightDevice, {
                id: "parent",
                isEssential: false,
                parts: [child],
            });
            await healthy.add(parent);

            expect(child.state.onOff.onOff).equals(false);

            await healthy.close();
        }
    });

    it("factory reset erases blobs an earlier session left behind", async () => {
        // A driver whose backing store outlives the handle, as a Web Storage or AsyncStorage driver does
        const persisted = new MemoryBlobStorageDriver();

        const node = await MockServerNode.createOnline();
        node.env.get(StorageService).registerBlobDriver({
            id: "persistent-blob",
            create: () => persisted,
        });
        node.env.get(StorageService).defaultBlobDriver = "persistent-blob";

        await writeBlob(node.env.get(ServerNodeStore));
        expect(await persisted.keys([])).deep.equals(["update.bin"]);

        // A store with no handle open must still find the namespace an earlier session wrote
        const store = await ServerNodeStore.create(node.env, "later-session");
        await store.erase();

        expect(await persisted.keys([])).deep.equals([]);

        await store.close();
        await node.close();
    });

    it("gives a restarted node new, unblocked client subscriptions", async () => {
        const node = await MockServerNode.createOnline();
        const before = node.env.get(ClientSubscriptions);

        await MockTime.resolve(node.stop());
        await MockTime.resolve(node.start());

        const after = node.env.get(ClientSubscriptions);
        expect(after).not.equal(before);
        expect(after.isBlocked).false;

        await node.close();
    });

    it("factory reset erases the blobs a transfer left behind", async () => {
        const node = await MockServerNode.createOnline();

        const driver = await writeBlob(node.env.get(ServerNodeStore));
        expect(await driver.keys([])).deep.equals(["update.bin"]);

        await MockTime.resolve(node.erase(), { macrotasks: true });

        expect(await driver.keys([])).deep.equals([]);

        await node.close();
    });

    it("factory reset of a controller erases peers and CA key material", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const storage = site.storageFor(controller.id);
        expect(storageKeysUnder(storage, "nodes")).not.deep.equals([]);
        expect(storageKeysUnder(storage, "certificates")).not.deep.equals([]);

        const ca = controller.env.get(CertificateAuthority);
        expect(ca.rootCert).not.equals(undefined);

        await MockTime.resolve(controller.erase(), { macrotasks: true });

        expect(storageKeysUnder(storage, "nodes")).deep.equals([]);
        expect(storageKeysUnder(storage, "certificates")).deep.equals([]);
        expect([...controller.peers].length).equals(0);

        // The authority caches the erased key material, so a holder that kept a reference must fail rather than sign
        expect(() => ca.rootCert).throws();
        const { publicKey } = await controller.env.get(Crypto).createKeyPair();
        await expect(ca.generateNoc(publicKey, FabricId(1), NodeId(1))).rejected;
    });

    it("crashes and erases nothing when it cannot go offline for a factory reset", async () => {
        await using node = await MockServerNode.createOnline();
        let resets = 0;
        node.lifecycle.reset.on(() => {
            resets++;
        });
        node.lifecycle.goingOffline.on(() => {
            throw new ImplementationError("Going offline refused for test");
        });

        await expect(MockTime.resolve(node.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);

        expect(resets).equals(0);
        expect(node.construction.status).not.equals(Lifecycle.Status.Active);
    });

    it("reports an auto-start only if it changes the intent and keeps a target a call asked for", async () => {
        await using node = await MockServerNode.createOnline(undefined, { online: false });
        let changes = 0;
        node.lifecycle.intentChanged.on(() => {
            changes++;
        });

        node.lifecycle.autoStart();
        node.lifecycle.autoStart();
        expect(changes).equals(1);

        node.lifecycle.request({ target: "offline" });
        node.lifecycle.autoStart();

        expect(changes).equals(2);
        expect(node.lifecycle.intent.target).equals("offline");
    });

    it("recovers on start() after a factory reset whose storage erase failed", async () => {
        await using node = await MockServerNode.createOnline(undefined, { online: false });
        const store = node.env.get(ServerNodeStore);
        const erase = store.erase.bind(store);
        store.erase = async () => {
            throw new ImplementationError("Storage erase refused for test");
        };
        await expect(MockTime.resolve(node.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);
        expect(node.construction.status).equals(Lifecycle.Status.Crashed);
        store.erase = erase;

        await MockTime.resolve(node.start(), { macrotasks: true });

        expect(node.construction.status).equals(Lifecycle.Status.Active);
        expect(node.lifecycle.isOnline).equals(true);
    });

    it("finishes a factory reset that failed to erase the fabrics before start() brings it online", async () => {
        await using site = new MockSite();
        const { device: commissioned } = await site.addCommissionedPair();
        const { id } = commissioned;
        await MockTime.resolve(commissioned.close(), { macrotasks: true });

        // A node that runs as a worker of the runtime closes when it crashes, so the reset runs before the first start
        const device = await site.addNode(undefined, { id, device: OnOffLightDevice, online: false });
        const storage = site.storageFor(id);
        const fabrics = device.env.get(FabricManager);
        expect(fabrics.length).equals(1);

        const clear = fabrics.clear.bind(fabrics);
        fabrics.clear = async () => {
            throw new ImplementationError("Fabric erase refused for test");
        };
        await expect(MockTime.resolve(device.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);
        expect(device.construction.status).equals(Lifecycle.Status.Crashed);
        expect(storageKeysUnder(storage, "fabrics")).not.deep.equals([]);
        fabrics.clear = clear;

        let fabricsWhenOnline: number | undefined;
        let fabricKeysWhenOnline: string[] | undefined;
        device.lifecycle.online.once(() => {
            fabricsWhenOnline = fabrics.length;
            fabricKeysWhenOnline = storageKeysUnder(storage, "fabrics");
        });
        let resets = 0;
        let joined: Promise<void> | undefined;
        device.lifecycle.reset.on(() => {
            resets++;
            joined ??= device.erase();
        });

        await MockTime.resolve(device.start(), { macrotasks: true });
        if (joined === undefined) {
            expect.fail("The recovery did not reset the node");
        }
        await MockTime.resolve(joined);

        expect(fabricsWhenOnline).equals(0);
        expect(fabricKeysWhenOnline).deep.equals([]);
        expect(resets).equals(1);
        expect(device.lifecycle.isOnline).equals(true);
    });

    it("rejects start() of a node whose failed factory reset waits to run again and lets that reset finish", async () => {
        await using node = await MockServerNode.createOnline(undefined, { online: false });
        const fabrics = node.env.get(FabricManager);
        const clear = fabrics.clear.bind(fabrics);
        let clears = 0;
        fabrics.clear = async () => {
            clears++;
            if (clears === 1) {
                throw new ImplementationError("Fabric erase refused for test");
            }
            await clear();
        };
        await expect(MockTime.resolve(node.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);
        expect(node.construction.status).equals(Lifecycle.Status.Crashed);

        const started = node.start();
        const erased = node.erase();

        await expect(MockTime.resolve(started, { macrotasks: true })).rejectedWith(CrashedDependencyError);
        await MockTime.resolve(erased, { macrotasks: true });
        expect(clears).equals(2);
        expect(node.construction.status).equals(Lifecycle.Status.Active);
    });

    it("finishes a factory reset that fails to erase the fabrics on a start() queued behind it", async () => {
        await using node = await MockServerNode.createOnline(undefined, { online: false });
        const fabrics = node.env.get(FabricManager);
        const clear = fabrics.clear.bind(fabrics);
        let clears = 0;
        fabrics.clear = async () => {
            clears++;
            if (clears === 1) {
                throw new ImplementationError("Fabric erase refused for test");
            }
            await clear();
        };
        let clearsWhenOnline: number | undefined;
        node.lifecycle.online.once(() => {
            clearsWhenOnline = clears;
        });

        const erasing = node.erase().then(
            () => undefined,
            (e: unknown) => e,
        );
        const starting = node.start().then(
            () => undefined,
            (e: unknown) => e,
        );
        await MockTime.resolve(Promise.all([erasing, starting]), { macrotasks: true });

        expect(await erasing).instanceOf(MatterAggregateError);
        expect(await starting).equals(undefined);
        expect(clearsWhenOnline).equals(2);
    });

    it("clears the endpoint storage on start() after a factory reset whose clear and reload failed", async () => {
        await using node = await MockServerNode.createOnline(undefined, { online: false });
        const defaultLabel = node.state.basicInformation.nodeLabel;
        await node.set({ basicInformation: { nodeLabel: "before the reset" } });
        const driver = node.env.get(ServerNodeStore).storage.driver;
        const clearAll = driver.clearAll.bind(driver);
        driver.clearAll = contexts => {
            if (contexts[0] === "root") {
                driver.clearAll = clearAll;
                throw new StorageError("Clear refused for test");
            }
            return clearAll(contexts);
        };
        const loadNextNumber = ServerEndpointStore.loadNextNumber;
        ServerEndpointStore.loadNextNumber = () => {
            ServerEndpointStore.loadNextNumber = loadNextNumber;
            throw new StorageError("Load refused for test");
        };
        try {
            await expect(MockTime.resolve(node.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);
        } finally {
            driver.clearAll = clearAll;
            ServerEndpointStore.loadNextNumber = loadNextNumber;
        }
        expect(node.construction.status).equals(Lifecycle.Status.Crashed);

        await MockTime.resolve(node.start(), { macrotasks: true });

        expect(node.state.basicInformation.nodeLabel).equals(defaultLabel);
        expect(node.env.get(FabricManager).length).equals(0);
    });

    it("closes after a factory reset whose restart a close interrupts once the node is ready", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
        await aggregator.add(OnOffLightDevice, { id: "light" });
        let resetDone = false;
        node.lifecycle.reset.on(() => {
            resetDone = true;
        });
        let closing: Promise<void> | undefined;
        node.lifecycle.ready.on(() => {
            if (resetDone) {
                closing ??= node.close();
            }
        });

        const erased = await MockTime.resolve(node.erase(), { macrotasks: true }).then(
            () => undefined,
            (e: unknown) => e,
        );
        if (closing === undefined) {
            expect.fail("The restart of the factory reset did not reach ready");
        }
        await MockTime.resolve(closing, { macrotasks: true });

        expect(erased).equals(undefined);
        expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("closes after a factory reset whose restart a close interrupts once a part is ready", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
        const light = await aggregator.add(OnOffLightDevice, { id: "light" });
        let resetDone = false;
        node.lifecycle.reset.on(() => {
            resetDone = true;
        });
        let closing: Promise<void> | undefined;
        light.lifecycle.ready.on(() => {
            if (resetDone) {
                closing ??= node.close();
            }
        });

        const erased = await MockTime.resolve(node.erase(), { macrotasks: true }).then(
            () => undefined,
            (e: unknown) => e,
        );
        if (closing === undefined) {
            expect.fail("The restart of the factory reset did not reach a ready part");
        }
        await MockTime.resolve(closing, { macrotasks: true });

        expect(erased).equals(undefined);
        expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("does not report ready when a close interrupts the restart of a factory reset before it is ready", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        await node.add(OnOffLightDevice, { id: "light" });
        let resetDone = false;
        node.lifecycle.reset.on(() => {
            resetDone = true;
        });
        let closing: Promise<void> | undefined;
        node.construction.change.on(status => {
            if (resetDone && status === Lifecycle.Status.Initializing) {
                closing ??= node.close();
            }
        });
        let readyAfterClose = false;
        node.lifecycle.ready.on(() => {
            readyAfterClose ||= closing !== undefined;
        });

        await MockTime.resolve(node.erase(), { macrotasks: true });
        if (closing === undefined) {
            expect.fail("The restart of the factory reset did not begin");
        }
        await MockTime.resolve(closing, { macrotasks: true });

        expect(readyAfterClose).equals(false);
        expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("rejects a failed factory reset with its failures listed at one level", async () => {
        await using node = await MockServerNode.createOnline(undefined, { online: false });
        node.env.get(FabricManager).clear = async () => {
            throw new ImplementationError("Fabric erase refused for test");
        };

        const error = await MockTime.resolve(node.erase(), { macrotasks: true }).then(
            () => undefined,
            (e: unknown) => e,
        );

        if (!(error instanceof MatterAggregateError)) {
            expect.fail(`Expected a MatterAggregateError, got ${error}`);
        }
        expect(error.message).equals("Error erasing node0");
        expect(error.errors.map(e => (e instanceof Error ? e.message : String(e)))).deep.equals([
            "Fabric erase refused for test",
        ]);
    });

    it("recovers a crash after a factory reset that finished again without another reset", async () => {
        await using node = await MockServerNode.createOnline(undefined, { online: false });
        const fabrics = node.env.get(FabricManager);
        const clear = fabrics.clear.bind(fabrics);
        let clears = 0;
        fabrics.clear = async () => {
            clears++;
            if (clears === 1) {
                throw new ImplementationError("Fabric erase refused for test");
            }
            await clear();
        };
        await expect(MockTime.resolve(node.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);
        await MockTime.resolve(node.erase(), { macrotasks: true });
        expect(clears).equals(2);

        node.construction.crash();
        await MockTime.resolve(node.start(), { macrotasks: true });

        expect(clears).equals(2);
        expect(node.lifecycle.isOnline).equals(true);
    });

    it("should not be online once its close was requested", async () => {
        await using node = await MockServerNode.createOnline();

        const closing = node.close();

        expect(node.lifecycle.shouldBeOnline).equals(false);
        expect(node.lifecycle.shouldBeOffline).equals(true);
        await MockTime.resolve(closing, { macrotasks: true });
    });

    it("crashes when it cannot go online again after a factory reset", async () => {
        await using node = await MockServerNode.createOnline();
        let erased = false;
        node.lifecycle.reset.on(() => {
            erased = true;
        });
        node.lifecycle.online.on(() => {
            if (erased) {
                throw new ImplementationError("Going online refused for test");
            }
        });

        await expect(MockTime.resolve(node.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);

        expect(node.construction.status).not.equals(Lifecycle.Status.Active);
    });

    it("reports a failed reset of a factory reset in one error", async () => {
        await using node = await MockServerNode.createOnline();
        node.lifecycle.reset.on(() => {
            throw new ImplementationError("Reset refused for test");
        });

        const error = await MockTime.resolve(node.erase(), { macrotasks: true }).then(
            () => undefined,
            (e: unknown) => e,
        );

        if (!(error instanceof MatterAggregateError)) {
            expect.fail(`Expected a MatterAggregateError, got ${error}`);
        }
        expect(error.message).equals("Error erasing node0");
        expect(error.errors.map(e => (e instanceof Error ? e.message : String(e)))).not.contains("Error erasing node0");
    });

    it("factory resets a node that is still initializing", async () => {
        const node = new MockServerNode();
        expect(node.construction.status).equals(Lifecycle.Status.Initializing);

        await MockTime.resolve(node.erase(), { macrotasks: true });

        expect(node.construction.status).equals(Lifecycle.Status.Active);
        await node.close();
    });

    it("does nothing when stopping a closed node", async () => {
        const node = await MockServerNode.createOnline();
        await node.close();

        await node.stop();

        expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("stays down when a factory reset cannot erase the storage", async () => {
        await using node = await MockServerNode.createOnline();
        node.env.get(FabricManager).clear = async () => {
            throw new ImplementationError("Storage erase refused for test");
        };

        const error = await MockTime.resolve(node.erase(), { macrotasks: true }).then(
            () => undefined,
            (e: unknown) => e,
        );

        const messages = (e: unknown): string[] =>
            e instanceof MatterAggregateError
                ? e.errors.flatMap(messages)
                : [e instanceof Error ? e.message : String(e)];
        expect(error).instanceOf(MatterAggregateError);
        expect(messages(error)).deep.equals(["Storage erase refused for test"]);
        expect(node.construction.status).not.equals(Lifecycle.Status.Active);
        expect(node.lifecycle.isOnline).equals(false);
    });

    it("factory reset closes the fabric authority the node owns", async () => {
        const node = await MockServerNode.createOnline();

        // As the OTA and WebRTC behaviors obtain it
        const authority = await node.env.load(FabricAuthority);
        expect(node.env.owns(FabricAuthority)).equals(true);

        await MockTime.resolve(node.erase(), { macrotasks: true });

        expect(authority.construction.status).equals(Lifecycle.Status.Destroyed);

        await node.close();
    });

    it("completes factory reset when a peer cannot be torn down", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const storage = site.storageFor(controller.id);
        const peer = [...controller.peers][0];
        const address = peer.peerAddress!;

        // Fail inside delete() rather than replacing it, so its own teardown guarantees still apply
        peer.erase = async () => {
            throw new ImplementationError("Cannot erase");
        };

        await MockTime.resolve(controller.erase(), { macrotasks: true });

        expect(storageKeysUnder(storage, "nodes")).deep.equals([]);
        expect([...controller.peers].length).equals(0);
        expect(peer.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(controller.env.get(PeerSet).get(address)).equals(undefined);
        expect(controller.construction.status).equals(Lifecycle.Status.Active);
        expect(controller.lifecycle.isOnline).equals(true);
    });

    it("completes factory reset when removing the protocol peer fails", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer = [...controller.peers][0];
        const protocolPeer = controller.env.get(PeerSet).get(peer.peerAddress!)!;
        protocolPeer.delete = async () => {
            throw new ImplementationError("Cannot remove peer");
        };

        await MockTime.resolve(controller.erase(), { macrotasks: true });

        expect([...controller.peers].length).equals(0);
        expect(controller.lifecycle.isOnline).equals(true);
    });

    it("deletes its peers and their storage when it is deleted", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = [...controller.peers][0];
        const peerSet = controller.env.get(PeerSet);
        const address = peer.peerAddress!;
        const storage = site.storageFor(controller.id);
        expect(storageKeysUnder(storage, "nodes")).not.deep.equals([]);
        let peerKeysWhenDestroyed: string[] | undefined;
        peer.lifecycle.destroyed.once(() => {
            peerKeysWhenDestroyed = storageKeysUnder(storage, "nodes");
        });

        await MockTime.resolve(controller.delete(), { macrotasks: true });

        expect(peer.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(peerKeysWhenDestroyed).deep.equals([]);
        expect(peerSet.get(address)).equals(undefined);
        expect(storageKeysUnder(storage, "nodes")).deep.equals([]);
    });

    it("rejects a start queued behind an erase when a close follows", async () => {
        const node = new MockServerNode({});
        await node.construction;

        const erasing = node.erase();
        const starting = expect(node.start()).rejectedWith(DestroyedDependencyError);
        const closing = node.close();

        await MockTime.resolve(Promise.all([erasing, starting, closing]));

        expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("ends online after a start, a stop and a start in a row", async () => {
        const node = new MockServerNode({});
        await node.construction;

        await MockTime.resolve(Promise.all([node.start(), node.stop(), node.start()]));

        expect(node.lifecycle.isOnline).equals(true);
        await MockTime.resolve(node.close());
    });

    it("ends online after a stop and a start of an online node in a row", async () => {
        const node = new MockServerNode({});
        await MockTime.resolve(node.start());

        await MockTime.resolve(Promise.all([node.stop(), node.start()]));

        expect(node.lifecycle.isOnline).equals(true);
        await MockTime.resolve(node.close());
    });

    it("is online when the first of two starts that waited for its mutex resolves", async () => {
        const node = new MockServerNode({});
        await node.construction;
        const { promise: entered, resolver: enter } = createPromise<void>();
        const { promise: released, resolver: release } = createPromise<void>();
        const blocking = node.lifecycle.mutex.hold("blocking", async () => {
            enter();
            await released;
        });
        await entered;

        let onlineWhenFirstResolved: boolean | undefined;
        const first = node.start().then(() => {
            onlineWhenFirstResolved = node.lifecycle.isOnline;
        });
        const second = node.start();
        release();
        await MockTime.resolve(Promise.all([blocking, first, second]));

        expect(onlineWhenFirstResolved).equals(true);
        await MockTime.resolve(node.close());
    });

    it("stays meant to be online when a start fails while another start waits", async () => {
        class NodeFailingFirstStart extends MockServerNode {
            failures = 1;

            protected override async startWithMutex() {
                if (this.failures-- > 0) {
                    throw new NetworkError("Start failed");
                }
                await super.startWithMutex();
            }
        }
        const node = new NodeFailingFirstStart({});
        await node.construction;

        const failing = expect(node.start()).rejectedWith(NetworkError);
        await MockTime.resolve(Promise.all([failing, node.start()]));

        expect(node.lifecycle.isOnline).equals(true);
        expect(node.lifecycle.shouldBeOnline).equals(true);
        await MockTime.resolve(node.close());
    });

    it("starts again right after a start that failed inside an activity", async () => {
        const node = new MockServerNode({});
        await node.construction;
        let failures = 1;
        node.lifecycle.online.on(() => {
            if (failures-- > 0) {
                throw new NetworkError("Start failed after the interaction server registered");
            }
        });

        {
            using _commissioning = node.env.get(NodeActivity).begin("commissioning");
            await expect(MockTime.resolve(node.start())).rejectedWith(NetworkError);
            await MockTime.resolve(node.start());
        }

        expect(node.lifecycle.isOnline).equals(true);
        await MockTime.resolve(node.close());
    });

    it("closes the runtime of a start that failed inside an activity before its environment goes away", async () => {
        const node = new MockServerNode({});
        await node.construction;
        let runtime: NetworkRuntime | undefined;
        node.lifecycle.online.once(() => {
            runtime = node.env.get(NetworkRuntime);
            throw new NetworkError("Start failed after the network runtime started");
        });

        {
            using _commissioning = node.env.get(NodeActivity).begin("commissioning");
            await expect(MockTime.resolve(node.start())).rejectedWith(NetworkError);
            await MockTime.resolve(node.close());
        }

        expect(runtime?.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    describe("waits for a peer that is closing before it erases its storage", () => {
        class SlowCloseBehavior extends Behavior {
            static override readonly id = "slowClose";

            override async [Symbol.asyncDispose]() {
                await Time.sleep("slow peer close", Seconds(1));
            }
        }

        async function offlineControllerWithClosingPeer(site: MockSite) {
            const { controller } = await site.addCommissionedPair();
            const peer = [...controller.peers][0];
            peer.behaviors.require(SlowCloseBehavior);
            await MockTime.resolve(
                peer.act(agent => agent.get(SlowCloseBehavior)),
                { macrotasks: true },
            );
            await MockTime.resolve(controller.stop(), { macrotasks: true });

            const order = new Array<string>();
            peer.lifecycle.destroyed.once(() => {
                order.push("peer destroyed");
            });
            const store = controller.env.get(ServerNodeStore);
            const eraseStore = store.erase.bind(store);
            store.erase = async () => {
                order.push("storage erased");
                await eraseStore();
            };
            const address = peer.peerAddress!;
            const closing = peer.close();

            return { controller, order, closing, address };
        }

        it("on erase", async () => {
            await using site = new MockSite();
            const { controller, order, closing } = await offlineControllerWithClosingPeer(site);

            await MockTime.resolve(controller.erase(), { macrotasks: true });
            await MockTime.resolve(closing, { macrotasks: true });

            expect(order).deep.equals(["peer destroyed", "storage erased"]);
        });

        it("and forgets the peer on erase", async () => {
            await using site = new MockSite();
            const { controller, closing, address } = await offlineControllerWithClosingPeer(site);

            await MockTime.resolve(controller.erase(), { macrotasks: true });
            await MockTime.resolve(closing, { macrotasks: true });

            expect(controller.env.get(PeerSet).has(address)).equals(false);
        });

        it("on delete", async () => {
            await using site = new MockSite();
            const { controller, order, closing } = await offlineControllerWithClosingPeer(site);

            await MockTime.resolve(controller.delete(), { macrotasks: true });
            await MockTime.resolve(closing, { macrotasks: true });

            expect(order).deep.equals(["peer destroyed", "storage erased"]);
        });
    });

    describe("erases while a peer starts", () => {
        async function offlineControllerWithStartingPeer(site: MockSite) {
            const { controller } = await site.addCommissionedPair();
            const peer = [...controller.peers][0];
            await MockTime.resolve(controller.stop(), { macrotasks: true });

            const erasing = controller.erase();
            const starting = expect(peer.start()).rejectedWith(DestroyedDependencyError);

            return { peer, erasing, starting };
        }

        it("and rejects the start of the peer", async () => {
            await using site = new MockSite();
            const { erasing, starting } = await offlineControllerWithStartingPeer(site);

            await MockTime.resolve(Promise.all([erasing, starting]), { macrotasks: true });
        });

        it("and rejects the start of the peer while the peer closes", async () => {
            await using site = new MockSite();
            const { peer, erasing, starting } = await offlineControllerWithStartingPeer(site);
            const closing = peer.close();

            await MockTime.resolve(Promise.all([erasing, closing, starting]), { macrotasks: true });
        });
    });

    describe("closes with a peer", () => {
        for (const verb of ["erase", "delete"] as const) {
            it(`and rejects ${verb} of the peer`, async () => {
                await using site = new MockSite();
                const { controller } = await site.addCommissionedPair();
                const peer = [...controller.peers][0];
                const closing = controller.close();

                await expect(peer[verb]()).rejectedWith(
                    DestroyedDependencyError,
                    /controller1 is closing, so .* cannot be (erased|deleted)/,
                );

                await MockTime.resolve(closing, { macrotasks: true });
            });
        }

        it("and rejects an erase of the peer that follows a finished erase", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = [...controller.peers][0];
            await MockTime.resolve(peer.erase(), { macrotasks: true });
            const closing = controller.close();

            await expect(peer.erase()).rejectedWith(
                DestroyedDependencyError,
                /controller1 is closing, so .* cannot be erased/,
            );

            await MockTime.resolve(closing, { macrotasks: true });
        });

        // Characterization
        it("and takes its peers offline when it goes offline", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            let peerRunningWhenOffline: boolean | undefined;
            controller.lifecycle.offline.once(() => {
                peerRunningWhenOffline = peer.behaviors.internalsOf(NetworkClient).runtime !== undefined;
            });

            await MockTime.resolve(controller.close(), { macrotasks: true });

            expect(peerRunningWhenOffline).equals(false);
        });

        it("and lets a peer stop while the close waits for the server node mutex", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");
            const { promise: entered, resolver: enter } = createPromise<void>();
            const { promise: released, resolver: release } = createPromise<void>();
            const blocking = controller.lifecycle.mutex.hold("blocking", async () => {
                enter();
                await released;
            });
            await entered;
            const closing = ServerNode.prototype.close.call(controller);

            await MockTime.resolve(peer.stop(), { macrotasks: true });
            const runningAfterStop = peer.behaviors.internalsOf(NetworkClient).runtime !== undefined;
            release();
            await MockTime.resolve(Promise.all([blocking, closing]), { macrotasks: true });

            expect(runningAfterStop).equals(false);
        });

        it("and stops at once a node that closes", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const { promise: entered, resolver: enter } = createPromise<void>();
            const { promise: released, resolver: release } = createPromise<void>();
            const blocking = node.lifecycle.mutex.hold("blocking", async () => {
                enter();
                await released;
            });
            await entered;
            const closing = ServerNode.prototype.close.call(node);
            let stopped = false;

            const stopping = node.stop().then(() => {
                stopped = true;
            });
            await MockTime.yield3();
            const stoppedWhileBlocked = stopped;
            release();
            await MockTime.resolve(Promise.all([blocking, closing, stopping]), { macrotasks: true });

            expect(stoppedWhileBlocked).equals(true);
        });

        // Characterization: the stop of a peer runs while its server node closes instead of being refused
        it("and closes an online peer without warnings", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = [...controller.peers][0];

            const warnings = await captureWarningsOf(() => MockTime.resolve(controller.close(), { macrotasks: true }));

            expect(warnings).deep.equals([]);
            expect(peer.construction.status).equals(Lifecycle.Status.Destroyed);
        });

        // Characterization: guards that the delete of a peer runs while its server node is deleted
        it("and deletes an online peer with the server node without warnings", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = [...controller.peers][0];
            const address = peer.peerAddress!;
            const peers = controller.env.get(PeerSet);

            const warnings = await captureWarningsOf(() => MockTime.resolve(controller.delete(), { macrotasks: true }));

            expect(warnings).deep.equals([]);
            expect(peer.construction.status).equals(Lifecycle.Status.Destroyed);
            expect(peers.has(address)).equals(false);
        });
    });

    it("erases CA key material the node never loaded", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const id = controller.id;
        const storage = site.storageFor(id);

        await controller.close();
        expect(storageKeysUnder(storage, "certificates")).not.deep.equals([]);

        // A node that has not commissioned this session never instantiates the authority
        const rebooted = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
        expect(rebooted.env.has(CertificateAuthority)).equals(false);

        await MockTime.resolve(rebooted.erase(), { macrotasks: true });

        expect(storageKeysUnder(storage, "certificates")).deep.equals([]);
    });

    it("does not restore a deleted peer from a commit that writes while the peer is deleted", async () => {
        const hold = new WriteHold("endpoints.0.network");
        await using site = new MockSite({ createStorageDriver: store => new HoldingStorageDriver(store, hold) });
        const { controller } = await site.addCommissionedPair();
        const peer = [...controller.peers][0];
        const storage = site.storageFor(controller.id);

        // Without a runtime nothing drains the transactions of the peer before it is deleted
        await MockTime.resolve(peer.stop(), { macrotasks: true });
        hold.arm();
        const setting = peer.set({ network: { autoSubscribe: !peer.state.network.autoSubscribe } });
        await MockTime.resolve(hold.writing.promise);
        const deleting = peer.delete();
        await MockTime.resolve(Time.sleep("delete runs", Seconds(1)), { macrotasks: true });
        hold.write.resolver();
        await MockTime.resolve(Promise.allSettled([setting, deleting]), { macrotasks: true });

        expect(storageKeysUnder(storage, `nodes.${peer.id}`)).deep.equals([]);
    });

    it("does not restore a value of a server node from a commit that writes while the node is erased", async () => {
        const hold = new WriteHold("root.basicInformation");
        await using site = new MockSite({ createStorageDriver: store => new HoldingStorageDriver(store, hold) });
        const node = await site.addController();
        const storage = site.storageFor(node.id);

        hold.arm();
        const setting = node.set({ basicInformation: { nodeLabel: "written during erase" } });
        await MockTime.resolve(hold.writing.promise);
        const erasing = node.erase();
        await MockTime.resolve(Time.sleep("erase runs", Seconds(1)), { macrotasks: true });
        hold.write.resolver();
        await MockTime.resolve(Promise.allSettled([setting, erasing]), { macrotasks: true });

        expect(storage["root.basicInformation"]?.nodeLabel).not.equals("written during erase");
        expect(node.state.basicInformation.nodeLabel).not.equals("written during erase");
    });

    it("persists later endpoint numbers after a queued number save of a deleted endpoint", async () => {
        const hold = new WriteHold("root.parts.first");
        await using site = new MockSite({ createStorageDriver: store => new HoldingStorageDriver(store, hold) });
        const node = await site.addController();

        hold.arm();
        await node.add(OnOffLightDevice, { id: "first" });
        await MockTime.resolve(hold.writing.promise);
        const second = await node.add(OnOffLightDevice, { id: "second" });
        await MockTime.resolve(second.delete());
        hold.write.resolver();
        await MockTime.resolve(Time.sleep("numbers persist", Seconds(1)), { macrotasks: true });
        const third = await node.add(OnOffLightDevice, { id: "third" });
        await MockTime.resolve(node.close());

        expect(site.storageFor(node.id)["root.parts.third"]?.__number__).equals(third.number);
    });

    describe("after a storage erase that fails", () => {
        /** A memory driver that refuses the next clear of the context {@link failClear} names */
        class ClearRefusingStorageDriver extends MemoryStorageDriver {
            static failClear?: string;

            override clearAll(contexts: string[]) {
                if (contexts.join(".") === ClearRefusingStorageDriver.failClear) {
                    ClearRefusingStorageDriver.failClear = undefined;
                    throw new ImplementationError("Clear refused for test");
                }
                super.clearAll(contexts);
            }
        }

        const clearRefusingSite = () =>
            new MockSite({ createStorageDriver: store => new ClearRefusingStorageDriver(store) });

        afterEach(() => {
            ClearRefusingStorageDriver.failClear = undefined;
        });

        it("persists the state of a part added again after its store failed to erase", async () => {
            await using site = clearRefusingSite();
            const node = await site.addController();
            const light = await node.add(OnOffLightDevice, { id: "light" });

            ClearRefusingStorageDriver.failClear = "root.parts.light";
            await expect(MockTime.resolve(light.delete())).rejectedWith(MatterAggregateError);
            const again = await node.add(OnOffLightDevice, { id: "light" });
            await again.set({ onOff: { onOff: true } });

            expect(site.storageFor(node.id)["root.parts.light.onOff"]?.onOff).equals(true);
        });

        it("releases the number of a part whose store failed to erase", async () => {
            await using site = clearRefusingSite();
            const node = await site.addController();
            const light = await node.add(OnOffLightDevice, { id: "light" });
            const number = light.number;

            ClearRefusingStorageDriver.failClear = "root.parts.light";
            await expect(MockTime.resolve(light.delete())).rejectedWith(MatterAggregateError);

            const warnings = new Array<string>();
            Logger.destinations.capture = LogDestination({
                format: LogFormat.formats.plain,
                write(text, message) {
                    if (message.level === LogLevel.WARN) {
                        warnings.push(text);
                    }
                },
            });
            let claimant;
            try {
                claimant = await node.add(OnOffLightDevice, { id: "claimant", number });
            } finally {
                delete Logger.destinations.capture;
            }

            expect(claimant.number).equals(number);
            expect(warnings.join("\n")).not.contains("takes endpoint number");
        });

        it("persists writes of a node whose factory reset failed to clear the endpoint storage", async () => {
            await using site = clearRefusingSite();
            const node = await site.addController();

            ClearRefusingStorageDriver.failClear = "root";
            await expect(MockTime.resolve(node.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);
            const store = node.env.get(ServerNodeStore).storeForEndpoint(node);
            await store.set({ basicInformation: { nodeLabel: "after failed erase" } });

            expect(site.storageFor(node.id)["root.basicInformation"]?.nodeLabel).equals("after failed erase");
        });
    });

    it("ends the endpoint stores of a server node when it closes", async () => {
        await using site = new MockSite();
        const node = await site.addController();
        const store = node.env.get(ServerNodeStore).storeForEndpoint(node);

        await MockTime.resolve(node.close());

        await expect(store.set({ basicInformation: { nodeLabel: "after close" } })).rejectedWith(StoreClosedError);
    });

    it("keeps the store of a node it adds during a factory reset", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const { fabricIndex } = controller.env.get(FabricManager).fabrics[0];
        const sessions = controller.env.get(SessionManager);
        const clear = sessions.clear.bind(sessions);
        const clearing = createPromise<void>();
        const cleared = createPromise<void>();
        sessions.clear = async () => {
            clearing.resolver();
            await cleared.promise;
            await clear();
        };

        const erasing = controller.erase();
        await MockTime.resolve(clearing.promise, { macrotasks: true });
        const adding = controller.peers.forAddress(PeerAddress({ fabricIndex, nodeId: NodeId(77) }));
        await MockTime.resolve(Time.sleep("add runs", Seconds(1)), { macrotasks: true });
        cleared.resolver();
        await MockTime.resolve(erasing, { macrotasks: true });
        const node = await MockTime.resolve(adding, { macrotasks: true });

        expect(controller.env.get(ServerNodeStore).clientStores.knownIds).contains(node.id);
    });

    it("erases the storage of a closing peer that a removal deletes while the server node store closes", async () => {
        class SlowCloseBehavior extends Behavior {
            static override readonly id = "slowClose";

            override async [Symbol.asyncDispose]() {
                await Time.sleep("slow peer close", Seconds(1));
            }
        }
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = [...controller.peers][0];
        peer.behaviors.require(SlowCloseBehavior);
        await MockTime.resolve(
            peer.act(agent => agent.get(SlowCloseBehavior)),
            { macrotasks: true },
        );
        await MockTime.resolve(controller.stop(), { macrotasks: true });
        const storage = site.storageFor(controller.id);

        const closing = peer.close();
        const removing = peer.deleteDespiteServerTeardown();
        const storeClosing = controller.env.get(ServerNodeStore).close();
        await MockTime.resolve(Promise.allSettled([closing, removing, storeClosing]), { macrotasks: true });

        expect(storageKeysUnder(storage, `nodes.${peer.id}`)).deep.equals([]);
    });

    it("erases every peer endpoint store when one fails", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer = [...controller.peers][0];
        const store = controller.env.get(ServerNodeStore).clientStores.storeForNode(peer.id);
        const [failing, ...rest] = [...store.endpointStores];
        expect(rest.length).greaterThan(0);

        failing.erase = async () => {
            throw new ImplementationError("Cannot erase endpoint");
        };

        let erased = 0;
        for (const endpointStore of rest) {
            const erase = endpointStore.erase.bind(endpointStore);
            endpointStore.erase = async () => {
                erased++;
                await erase();
            };
        }

        await MockTime.resolve(controller.erase(), { macrotasks: true });

        expect(erased).equals(rest.length);
        expect([...controller.peers].length).equals(0);
    });

    it("erases remaining areas when one fails during factory reset", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const storage = site.storageFor(controller.id);
        const events = controller.env.get(OccurrenceManager);
        events.clear = async () => {
            throw new ImplementationError("Cannot clear events");
        };

        await MockTime.resolve(expect(controller.erase()).rejectedWith("Error erasing controller1"), {
            macrotasks: true,
        });

        // Areas sequenced after the failure must still be erased or key material outlives the reset
        expect(storageKeysUnder(storage, "certificates")).deep.equals([]);
        expect(storageKeysUnder(storage, "nodes")).deep.equals([]);
    });

    it("keeps serving events from the one event manager across factory reset", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const before = controller.env.get(OccurrenceManager);
        expect(controller.protocol.eventHandler).equals(before);

        await MockTime.resolve(controller.erase(), { macrotasks: true });

        expect(controller.env.get(OccurrenceManager)).equals(before);
        expect(controller.protocol.eventHandler).equals(before);
    });

    it("leaves its own event manager open when it creates a peer", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        await controller.start();
        const events = controller.env.get(OccurrenceManager);
        let closed = false;
        const close = events.close.bind(events);
        events.close = async () => {
            closed = true;
            await close();
        };

        await commissionOnto(controller, device);

        expect(controller.peers.commissioned.length).equals(1);
        expect(closed).equals(false);
    });

    it("commissions again on the same controller instance after factory reset", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        await MockTime.resolve(controller.erase(), { macrotasks: true });

        await commissionOnto(controller, await site.addDevice());

        expect(controller.peers.commissioned.length).equals(1);
        expect(controller.env.owns(CertificateAuthority)).equals(true);
    });

    it("commissions again after factory reset of a controller with commissioned peers", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const id = controller.id;

        await MockTime.resolve(controller.erase(), { macrotasks: true });
        await controller.close();

        // Boot a new node on the storage the erased controller left behind
        const rebooted = await site.addController({ id });
        expect([...rebooted.peers].length).equals(0);
        await rebooted.start();

        await commissionOnto(rebooted, await site.addDevice());

        expect(rebooted.peers.commissioned.length).equals(1);
    });

    it("commissions twice", async () => {
        const { node } = await commissioning.commission();

        let lastCommissionedFabricCount;
        node.events.operationalCredentials.commissionedFabrics$Changed.on(commissionedFabrics => {
            lastCommissionedFabricCount = commissionedFabrics;
        });

        let lastCommissionedFabricIndex;
        node.events.commissioning.fabricsChanged.on(fabricIndex => {
            lastCommissionedFabricIndex = fabricIndex;
        });

        let lastFabricsCount;
        node.events.operationalCredentials.fabrics$Changed.on(fabrics => {
            lastFabricsCount = fabrics.length;
        });

        (node.env.get(Crypto) as MockCrypto).index++;
        await commissioning.commission(node, 2);

        expect(node.state.operationalCredentials.nocs.length).equals(2);
        expect(Object.keys(node.state.commissioning.fabrics).length).equals(2);

        expect(lastCommissionedFabricCount).equals(2);
        expect(lastCommissionedFabricIndex).equals(2);
        expect(lastFabricsCount).equals(2);

        await node.close();
    });

    it("removes the entries of a removed fabric from a fabric-sensitive list", async () => {
        const camera = new Endpoint(OnOffLightDevice.with(WebRtcTransportProviderServer), { id: "camera" });
        const node = await MockServerNode.createOnline(undefined, { device: camera });
        const { contextOptions } = await commissioning.commission(node);
        (node.env.get(Crypto) as MockCrypto).index++;
        await commissioning.commission(node, 2);

        const session = (id: number, fabricIndex: number) => ({
            id,
            peerNodeId: NodeId(id),
            peerEndpointId: EndpointNumber(1),
            streamUsage: StreamUsage.LiveView,
            videoStreams: [10],
            metadataEnabled: false,
            fabricIndex: FabricIndex(fabricIndex),
        });
        await camera.set({ webRtcTransportProvider: { currentSessions: [session(1, 1), session(2, 2)] } });

        const sanitized = Promise.resolve(ServerEnvironment.fabricScopedDataSanitized);
        await node.online(contextOptions, async agent => {
            await agent.operationalCredentials.removeFabric({ fabricIndex: FabricIndex(1) });
        });
        await sanitized;

        expect(
            camera
                .stateOf(WebRtcTransportProviderServer)
                .currentSessions.map(({ id, fabricIndex }) => [id, fabricIndex]),
        ).deep.equals([[2, 2]]);

        await node.close();
    });

    it("commissions twice and removes first including fabric scoped data", async () => {
        const { node, contextOptions } = await commissioning.commission();

        (node.env.get(Crypto) as MockCrypto).index++;
        await commissioning.commission(node, 2);

        //Verify that each fabric has some fabric scoped data in common places like nocs and acl
        expect(node.state.operationalCredentials.nocs.filter(({ fabricIndex }) => fabricIndex === 1).length).equals(1);
        expect(node.state.operationalCredentials.nocs.filter(({ fabricIndex }) => fabricIndex === 2).length).equals(1);
        expect(node.state.accessControl.acl.filter(({ fabricIndex }) => fabricIndex === 1).length).equals(1);
        expect(node.state.accessControl.acl.filter(({ fabricIndex }) => fabricIndex === 2).length).equals(1);
        expect(Object.keys(node.state.commissioning.fabrics).length).equals(2);
        expect(node.state.commissioning.fabrics[FabricIndex(1)]).to.be.ok;
        expect(node.state.commissioning.fabrics[FabricIndex(2)]).to.be.ok;

        const occurrences = node.env.get(OccurrenceManager);
        const occurrencesPerFabric = new Map<FabricIndex, number>();
        for await (const { payload } of occurrences.get()) {
            if (isObject(payload) && "fabricIndex" in payload) {
                const fabricIndex = FabricIndex(payload.fabricIndex as number);
                occurrencesPerFabric.set(fabricIndex, (occurrencesPerFabric.get(fabricIndex) ?? 0) + 1);
            }
        }
        expect(occurrencesPerFabric.get(FabricIndex(1))).equals(1);
        expect(occurrencesPerFabric.get(FabricIndex(2))).equals(1);

        const sanitized = Promise.resolve(ServerEnvironment.fabricScopedDataSanitized);

        await node.online(contextOptions, async agent => {
            await agent.operationalCredentials.removeFabric({ fabricIndex: FabricIndex(1) });
        });

        await sanitized;

        // Verify that the fabric scoped data are gone for the removed fabricIndex 1, but still exist for Index 2
        expect(node.state.operationalCredentials.nocs.filter(({ fabricIndex }) => fabricIndex === 1).length).equals(0);
        expect(node.state.operationalCredentials.nocs.filter(({ fabricIndex }) => fabricIndex === 2).length).equals(1);
        expect(node.state.accessControl.acl.filter(({ fabricIndex }) => fabricIndex === 1).length).equals(0);
        expect(node.state.accessControl.acl.filter(({ fabricIndex }) => fabricIndex === 2).length).equals(1);
        expect(Object.keys(node.state.commissioning.fabrics).length).equals(1);
        expect(node.state.commissioning.fabrics[FabricIndex(1)]).to.be.not.ok;
        expect(node.state.commissioning.fabrics[FabricIndex(2)]).to.be.ok;

        occurrencesPerFabric.clear();
        for await (const event of occurrences.get()) {
            const { payload, clusterId, eventId } = event;
            // count events but ignore the leave event, which is not fabric scoped
            if (isObject(payload) && "fabricIndex" in payload && clusterId !== 0x28 && eventId !== 0x2) {
                const fabricIndex = FabricIndex(payload.fabricIndex as number);
                occurrencesPerFabric.set(fabricIndex, (occurrencesPerFabric.get(fabricIndex) ?? 0) + 1);
            }
        }
        expect(occurrencesPerFabric.get(FabricIndex(1))).equals(undefined);
        expect(occurrencesPerFabric.get(FabricIndex(2))).equals(1);

        await node.close();
    });

    it("sanitizes orphaned fabric-scoped data at startup", async () => {
        const environment = new Environment("test");
        const service = environment.get(StorageService);

        // Configure storage that survives node replacement
        const storage = new StorageManager(new MemoryStorageDriver());
        storage.close = () => {};
        await storage.initialize();
        service.open = () => Promise.resolve(storage);

        // Commission a single fabric, then inject an ACL entry referencing a fabric that does not exist and persist it
        {
            const node = new MockServerNode({ id: "node0", environment });
            await node.start();
            await commissioning.commission(node);

            const acl = node.state.accessControl.acl;
            expect(acl.length).equals(1);
            expect(acl[0].fabricIndex).equals(FabricIndex(1));

            await node.set({
                accessControl: { acl: [...acl, { ...acl[0], fabricIndex: FabricIndex(2) }] },
            });
            expect(node.state.accessControl.acl.length).equals(2);

            await node.close();
        }

        // Reopen: startup sanitization must strip the orphaned fabric-2 entry without requiring an active endpoint
        {
            const node = new MockServerNode({ id: "node0", environment });
            await node.start();

            const acl = node.state.accessControl.acl;
            expect(acl.filter(({ fabricIndex }) => fabricIndex === 2).length).equals(0);
            expect(acl.filter(({ fabricIndex }) => fabricIndex === 1).length).equals(1);

            await node.close();
        }
    });

    it("properly deploys aggregator", async () => {
        const aggregator = new Endpoint(AggregatorEndpoint);

        const light = new Endpoint(OnOffLightDevice, { owner: aggregator });

        // Hrm always fun to configure pumps
        const pump = new Endpoint(
            PumpDevice.with(
                PumpConfigurationAndControlServer.with("ConstantPressure").set({
                    effectiveControlMode: PumpConfigurationAndControl.ControlMode.ConstantPressure,
                    effectiveOperationMode: PumpConfigurationAndControl.OperationMode.Normal,
                }),
            ),
            { owner: aggregator },
        );

        const node = await MockServerNode.createOnline(undefined, { device: aggregator });

        await commissioning.commission(node);

        expect(node.stateOf(DescriptorBehavior).partsList).deep.equals([aggregator.number, light.number, pump.number]);
        expect(aggregator.stateOf(DescriptorBehavior).partsList).deep.equals([light.number, pump.number]);

        expect(light.stateOf(DescriptorBehavior).serverList).deep.equals([3, 4, 6, 98, 29]);
        expect(pump.stateOf(DescriptorBehavior).serverList).deep.equals([3, 6, 512, 29]);

        await node.close();
    });

    describe("crashes gracefully", () => {
        const CrashingRoot = MockServerNode.RootEndpoint.with(CrashingServer);
        const CrashingDevice = LightSensorDevice.with(CrashingServer);

        describe("during behavior error on creation", () => {
            it("from root behavior error", async () => {
                await expect(MockServerNode.create(CrashingRoot)).rejectedWith(EndpointBehaviorsError);
            });

            it("from behavior error on child during node create", async () => {
                await expect(
                    MockServerNode.create(MockServerNode.RootEndpoint, {
                        parts: [new Endpoint(CrashingDevice)],
                    }),
                ).rejectedWith(EndpointPartsError);
            });

            it("from behavior on child after node create", async () => {
                await using node = await MockServerNode.create(MockServerNode.RootEndpoint);
                await expect(node.add(new Endpoint(CrashingDevice))).rejectedWith(EndpointBehaviorsError);
            });
        });

        describe("when coming online", () => {
            it("from root behavior error", async () => {
                await expect(
                    MockServerNode.createOnline({
                        type: CrashingRoot,
                        device: undefined,
                    }),
                ).rejectedWith(EndpointBehaviorsError);
            });

            it("from behavior error on child during startup", async () => {
                await expect(
                    MockServerNode.createOnline({
                        type: MockServerNode.RootEndpoint,
                        id: "foo",
                        device: CrashingDevice,
                    }),
                ).rejectedWith(EndpointBehaviorsError);
            });

            it("from behavior error on child added after startup", async () => {
                await using node = await MockServerNode.createOnline({
                    type: MockServerNode.RootEndpoint,
                    device: undefined,
                });
                await expect(node.add(CrashingDevice)).rejectedWith(EndpointBehaviorsError);
            });
        });
    });

    it("is resilient to conformance changes that affect persisted data", async () => {
        const environment = new Environment("test");
        const service = environment.get(StorageService);

        // Configure storage that will survive node replacement
        const storage = new StorageManager(new MemoryStorageDriver());
        storage.close = () => {};
        await storage.initialize();
        service.open = () => Promise.resolve(storage);

        // Initialize a node with extended color light, ensure levelX persists
        {
            const node = new MockServerNode({ id: "node0", environment });

            await node.construction.ready;

            const originalEndpoint = await node.add(ExtendedColorLightDevice, {
                id: "foo",
                number: 1,
                colorControl: {
                    colorMode: 0,
                    colorTempPhysicalMinMireds: 1,
                    colorTempPhysicalMaxMireds: 65279,
                    startUpColorTemperatureMireds: 1,
                    coupleColorTempToLevelMinMireds: 1,
                },
            });

            await originalEndpoint.set({ colorControl: { currentX: 12 } });

            await node.close();
        }

        // Initialize a node with color temp light, levelX won't be supported
        {
            const node = new MockServerNode({ id: "node0", environment });

            await node.construction.ready;

            await node.add(ColorTemperatureLightDevice, {
                id: "foo",
                number: 1,
                colorControl: {
                    colorTempPhysicalMinMireds: 1,
                    colorTempPhysicalMaxMireds: 65279,
                    startUpColorTemperatureMireds: 1,
                    coupleColorTempToLevelMinMireds: 1,
                },
            });

            await node.close();
        }
    });

    it("keeps the access control list when a newer default root endpoint adds a feature", async () => {
        const environment = new Environment("test");
        const service = environment.get(StorageService);

        // Configure storage that will survive node replacement
        const storage = new StorageManager(new MemoryStorageDriver());
        storage.close = () => {};
        await storage.initialize();
        service.open = () => Promise.resolve(storage);

        const acl = [
            {
                privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                authMode: AccessControl.AccessControlEntryAuthMode.Case,
                subjects: [NodeId(0x1234)],
                targets: null,
                auxiliaryType: undefined,
                fabricIndex: FabricIndex(1),
            },
        ];

        {
            const node = new MockServerNode(MockServerNode.RootEndpoint.with(AccessControlServer.with("Extension")), {
                id: "node0",
                environment,
            });
            await node.construction.ready;
            await node.setStateOf(AccessControlServer, { acl });
            await node.close();
        }

        {
            const node = new MockServerNode({ id: "node0", environment });
            await node.construction.ready;
            expect(node.stateOf(AccessControlServer).acl.map(entry => ({ ...entry }))).deep.equals(acl);
            await node.close();
        }
    });

    it("validates the event buffers of a subclass of the events behavior", async () => {
        class CustomEvents extends EventsBehavior {}

        const node = new MockServerNode(MockServerNode.RootEndpoint.with(CustomEvents));
        try {
            await node.construction.ready;
            const { buffers } = node.stateOf(CustomEvents);
            await expect(
                node.setStateOf(CustomEvents, { buffers: { ...buffers, minEventAllowance: -1 } }),
            ).rejectedWith("state.buffers");
        } finally {
            await node.close();
        }
    });

    it("restores persisted attribute values after restart", async () => {
        const environment = new Environment("test");
        const service = environment.get(StorageService);

        // Configure storage that will survive node replacement
        const storage = new StorageManager(new MemoryStorageDriver());
        storage.close = () => {};
        await storage.initialize();
        service.open = () => Promise.resolve(storage);

        const colorControl = {
            colorMode: 0,
            colorTempPhysicalMinMireds: 1,
            colorTempPhysicalMaxMireds: 65279,
            startUpColorTemperatureMireds: 1,
            coupleColorTempToLevelMinMireds: 1,
        };

        {
            const node = new MockServerNode({ id: "node0", environment });
            await node.construction.ready;
            const endpoint = await node.add(ExtendedColorLightDevice, { id: "foo", number: 1, colorControl });
            await endpoint.set({ colorControl: { currentX: 12 } });
            await node.close();
        }

        {
            const node = new MockServerNode({ id: "node0", environment });
            await node.construction.ready;
            const endpoint = await node.add(ExtendedColorLightDevice, { id: "foo", number: 1, colorControl });

            // The datasource drops its store seed after construction; the persisted value must still load.
            expect(endpoint.state.colorControl.currentX).equals(12);

            await node.close();
        }
    });

    describe("initializes protocol", () => {
        it("with part at startup", async () => {
            const node = new MockServerNode({ parts: [OnOffLightDevice] });

            await node.start();
            const { protocol } = node;

            expect(protocol).has.property("0");
            expect(protocol).has.property("1");
            expect([...protocol]).length(2);

            const ep0 = protocol[0]!;
            expect(typeof ep0 === "object");
            expect(ep0.id).equals(0);
            expect(ep0.deviceTypes).deep.equals([22]);
            expect(ep0.wildcardPathFlags).equals(0x1);
            expect([...ep0]).length(
                [...node.behaviors].filter(behavior => behavior.schema.tag === ElementTag.Cluster).length,
            );

            const ep1 = protocol[1]!;
            expect(ep1.id).equals(1);
            expect(ep1.deviceTypes).deep.equals([256]);
            expect(ep1.wildcardPathFlags).equals(0);
            expect([...ep1]).length(
                [...[...node.parts][0].behaviors].filter(behavior => behavior.schema.tag === ElementTag.Cluster).length,
            );

            const id = BasicInformation.id as number;
            expect(ep0).has.property(`${id}`);
            const bi = ep0[id]!;
            expect(typeof bi).equals("object");

            expect(bi.version).equals(0x80808081);
            expect(bi.type.id).equals(BasicInformation.id);
            expect([...bi.type.attributes].length).equals(22);
            expect([...bi.type.events].length).equals(3);

            expect(bi.type.attributes).has.property(`${FeatureMap.id}`);
            const fm = bi.type.attributes[FeatureMap.id]!;
            expect(typeof fm).equals("object");

            expect(typeof fm.tlv.encode).equals("function");
            expect(typeof fm.limits).equals("object");
            expect(fm.limits.writable).equals(false);
            expect(fm.limits.readLevel).equals(AccessLevel.View);

            const readState = bi.readState(LocalActorContext.ReadOnly);
            expect((readState as Val.Struct).vendorName).equals("Matter.js Test Vendor");
            expect((readState as Val.Struct)[BasicInformationCluster.attributes.vendorName.id]).equals(
                "Matter.js Test Vendor",
            );

            await expect(bi.openForWrite(LocalActorContext.ReadOnly)).rejectedWith("This view is read-only");

            await node.close();

            expect([...protocol]).length(0);
        });
    });
});
