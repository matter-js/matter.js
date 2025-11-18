/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorBehavior } from "#behaviors/descriptor";
import { PumpConfigurationAndControlServer } from "#behaviors/pump-configuration-and-control";
import { BasicInformationCluster } from "#clusters/basic-information";
import { PumpConfigurationAndControl } from "#clusters/pump-configuration-and-control";
import { ColorTemperatureLightDevice } from "#devices/color-temperature-light";
import { ExtendedColorLightDevice } from "#devices/extended-color-light";
import { LightSensorDevice } from "#devices/light-sensor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { PumpDevice } from "#devices/pump";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointBehaviorsError, EndpointPartsError } from "#endpoint/errors.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import {
    Bytes,
    CrashedDependenciesError,
    Crypto,
    DnsCodec,
    DnsMessage,
    DnsRecordType,
    Environment,
    isObject,
    MockCrypto,
    MockUdpChannel,
    NetworkSimulator,
    Seconds,
    StorageBackendMemory,
    StorageManager,
    StorageService,
} from "#general";
import { LocalActorContext } from "#index.js";
import { AccessLevel, BasicInformation, ElementTag, FeatureMap } from "#model";
import { ServerEnvironment } from "#node/server/ServerEnvironment.js";
import { ServerNode } from "#node/ServerNode.js";
import { AttestationCertificateManager, CertificationDeclaration, ProtocolMocks, Val } from "#protocol";
import { FabricIndex, VendorId } from "#types";
import { OccurrenceManager } from "@matter/protocol";
import { MockServerNode } from "./mock-server-node.js";
import { CommissioningHelper, FAILSAFE_LENGTH_S, testFactoryReset } from "./node-helpers.js";

const commissioning = CommissioningHelper();

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
                ["installed", "node0.?"],
                ["idAssigned", "node0.part0"],
                ["numberAssigned", "node0.part0"],
                ["ready", "node0.part0"],
                ["partsReady", "node0.part0"],
                ["partsReady", "node0"],
                ["partsReady"],
                ["online"],
                ["offline"],
                ["destroying", "node0"],
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
                ["installed", "node0.?"],
                ["idAssigned", "node0.part0"],
                ["numberAssigned", "node0.part0"],
                ["ready", "node0.part0"],
                ["partsReady", "node0.part0"],
                ["online"],
                ["offline"],
                ["destroying", "node0"],
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
                ["installed", "node0.?"],
                ["idAssigned", "node0.part0"],
                ["numberAssigned", "node0.part0"],
                ["ready", "node0.part0"],
                ["partsReady", "node0.part0"],
                ["offline"],
                ["destroying", "node0"],
                ["destroying", "node0.part0"],
                ["destroyed", "node0.part0"],
                ["destroyed", "node0"],
            ]);
        });
    });

    it("announces and expires correctly", async () => {
        const simulator = new NetworkSimulator();

        const scannerChannel = new MockUdpChannel(simulator.addHost(2), {
            listeningPort: 5353,
            type: "udp6",
        });
        scannerChannel.addMembership("ff02::fb");

        const advertisementReceived = new Promise<Bytes>(resolve =>
            scannerChannel.onData((_netInterface, _peerAddress, _peerPort, data) => resolve(data)),
        );

        const node = await MockServerNode.createOnline({
            type: ServerNode.RootEndpoint,
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
                if (answer.value.startsWith(name)) {
                    return answer.value.split(".")[0].substring(name.length);
                }
            }
        }

        function additional(recordType: DnsRecordType) {
            for (const additional of (advertisement as DnsMessage).additionalRecords) {
                if (additional.recordType === recordType) {
                    return additional.value;
                }
            }
        }

        expect(answer("_L")).equals("2002");
        expect(answer("_S")).equals(`${2002 % 0xf}`);
        expect(answer("_V")).equals("65501");
        expect(answer("_T")).equals("256");
        expect(answer("_CM")).equals("");

        expect(additional(DnsRecordType.AAAA)).equals("1111:2222:3333:4444:5555:6666:7777:8880");
        expect(additional(DnsRecordType.A)).equals("10.10.10.128");
        expect(additional(DnsRecordType.SRV)?.port).equals(operationalPort);

        const expirationReceived = new Promise<Bytes>(resolve =>
            scannerChannel.onData((_netInterface, _peerAddress, _peerPort, data) => resolve(data)),
        );

        await node.close();

        const expiration = DnsCodec.decode(await expirationReceived);
        expect(expiration?.answers[0]?.ttl).equals(0);
    });

    it("commissions", async () => {
        const { node } = await commissioning.commission();

        await MockTime.resolve(node.cancel());

        await node.close();
    });

    it("times out commissioning", async () => {
        const { node } = await commissioning.almostCommission();

        // Somewhere there is another promise left that updates the fabrics correctly, so give that time to be fullfilled
        await MockTime.yield();

        const opcreds = node.state.operationalCredentials;

        expect(opcreds.commissionedFabrics).equals(1);

        await MockTime.advance(FAILSAFE_LENGTH_S * 1000 + 1);

        if (opcreds.commissionedFabrics > 0) {
            await node.events.operationalCredentials.commissionedFabrics$Changed;
        }

        expect(opcreds.commissionedFabrics).equals(0);

        await node.close();
    });

    it("commissions with delayed provided certificates", async () => {
        const vendorId = VendorId(0xfff1);
        const productId = 0x8000;
        let commissioningServer2CertificateProviderCalled = false;
        const node = await MockServerNode.createOnline({
            type: ServerNode.RootEndpoint,
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
        await contextOptions.exchange.session.destroy(false, false);

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

        await node.online(contextOptions, async agent => {
            await agent.operationalCredentials.removeFabric({ fabricIndex: FabricIndex(1) });
        });

        await ServerEnvironment.fabricScopedDataSanitized;

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

        expect(light.stateOf(DescriptorBehavior).serverList).deep.equals([3, 4, 98, 6, 29]);
        expect(pump.stateOf(DescriptorBehavior).serverList).deep.equals([6, 3, 512, 29]);

        await node.close();
    });

    describe("crashes gracefully", () => {
        const badNodeEnv = new Environment("test");
        badNodeEnv.vars.set("behaviors.basicInformation.vendorId", "not a number");

        const badEndpointEnv = new Environment("test");
        badEndpointEnv.vars.set("behaviors.illuminancemeasurement.diet", "duck food");

        describe("during behavior error on creation", () => {
            it("from root behavior error", async () => {
                await expect(
                    MockServerNode.create(MockServerNode.RootEndpoint, { environment: badNodeEnv }),
                ).rejectedWith(EndpointBehaviorsError);
            });

            it("from behavior error on child during node create", async () => {
                await expect(
                    MockServerNode.create(MockServerNode.RootEndpoint, {
                        environment: badEndpointEnv,
                        parts: [new Endpoint(LightSensorDevice)],
                    }),
                ).rejectedWith(EndpointPartsError);
            });

            it("from behavior on child after node create", async () => {
                const node = await MockServerNode.create(MockServerNode.RootEndpoint, { environment: badEndpointEnv });
                await expect(node.add(new Endpoint(LightSensorDevice))).rejectedWith(EndpointBehaviorsError);
            });
        });

        describe("when coming online", () => {
            it("from root behavior error", async () => {
                await expect(
                    MockServerNode.createOnline({
                        type: MockServerNode.RootEndpoint,
                        environment: badNodeEnv,
                        device: undefined,
                    }),
                ).rejectedWith(EndpointBehaviorsError, 'Cannot convert "not a number" to an integer');
            });

            it("from behavior error on child during startup", async () => {
                await expect(
                    MockServerNode.createOnline({
                        type: MockServerNode.RootEndpoint,
                        environment: badEndpointEnv,
                        id: "foo",
                        device: LightSensorDevice,
                    }),
                ).rejectedWith(EndpointBehaviorsError, 'Property "diet" is unsupported');
            });

            it("from behavior error on child added after startup", async () => {
                const node = await MockServerNode.createOnline({
                    type: MockServerNode.RootEndpoint,
                    environment: badEndpointEnv,
                    device: undefined,
                });
                await expect(node.add(LightSensorDevice)).rejectedWith(
                    CrashedDependenciesError,
                    'Property "diet" is unsupported',
                );
            });
        });
    });

    it("is resilient to conformance changes that affect persisted data", async () => {
        const environment = new Environment("test");
        const service = environment.get(StorageService);

        // Configure storage that will survive node replacement
        const storage = new StorageManager(new StorageBackendMemory());
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
