/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { DiscoveryError } from "#behavior/system/controller/discovery/DiscoveryError.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { AccessControlClient } from "#behaviors/access-control";
import { BasicInformationBehavior, BasicInformationServer } from "#behaviors/basic-information";
import {
    BooleanStateConfigurationClient,
    BooleanStateConfigurationServer,
} from "#behaviors/boolean-state-configuration";
import { IdentifyClient, IdentifyServer } from "#behaviors/identify";
import { OnOffClient } from "#behaviors/on-off";
import { WindowCoveringClient, WindowCoveringServer } from "#behaviors/window-covering";
import { ContactSensorDevice } from "#devices/contact-sensor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { WindowCoveringDevice } from "#devices/window-covering";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import type { ClientEndpointInitializer } from "#node/client/ClientEndpointInitializer.js";
import { ClientNodeFactory } from "#node/client/ClientNodeFactory.js";
import { ClientStructureEvents } from "#node/client/ClientStructureEvents.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { ServerNode } from "#node/ServerNode.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import {
    b$,
    Bytes,
    Crypto,
    deepCopy,
    Entropy,
    MatterAggregateError,
    Minutes,
    MockCrypto,
    Observable,
    Seconds,
    ServerAddress,
    ServerAddressIp,
    Time,
    Timestamp,
} from "@matter/general";
import {
    AcceptedCommandList,
    AttributeList,
    ClusterRevision,
    FeatureMap,
    GeneratedCommandList,
    Specification,
} from "@matter/model";
import {
    CommissioningError,
    ControllerCommissioner,
    FabricAuthority,
    FabricManager,
    PeerSet,
    Read,
    ReadResult,
    Val,
    ValidateError,
} from "@matter/protocol";
import {
    AttributeId,
    ClusterId,
    EndpointNumber,
    FabricIndex,
    NodeId,
    Status,
    StatusResponseError,
    TlvAny,
} from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { Descriptor } from "@matter/types/clusters/descriptor";
import { OnOff } from "@matter/types/clusters/on-off";
import { WindowCovering } from "@matter/types/clusters/window-covering";
import { MyBehavior } from "../behavior/cluster/cluster-behavior-test-util.js";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

describe("ClientNode", () => {
    before(() => {
        MockTime.init();
    });

    it("starts controller automatically when commissioning with controller offline", async () => {
        await using site = new MockSite();
        const controller = await site.addNode(undefined, { online: false, device: undefined });
        await MockTime.resolve(
            expect(
                controller.peers.commission({ passcode: 12341234, discriminator: 1234, timeout: Seconds(1) }),
            ).rejectedWith("No commissionable device was discovered"),
        );
    });

    it("times out commissioning discovery", async () => {
        await using site = new MockSite();
        const controller = await site.addNode(undefined, { online: false, device: undefined });
        await controller.start();
        await MockTime.resolve(
            expect(
                controller.peers.commission({ passcode: 12341234, discriminator: 1234, timeout: Seconds(90) }),
            ).rejectedWith(DiscoveryError),
        );
    });

    it("times out continuous discovery", async () => {
        await using site = new MockSite();

        const controller = await site.addNode(undefined, { online: false, device: undefined });
        const discovered = await MockTime.resolve(
            controller.peers.discover({ longDiscriminator: 1234, timeout: Seconds(90) }),
        );

        expect(discovered.length).equals(0);
    });

    it("discovers", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        const { discriminator } = device.state.commissioning;
        const discovered = await MockTime.resolve(
            controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(90) }),
            { macrotasks: true },
        );

        expect(discovered.length).equals(1);
        expect(discovered[0].state.commissioning.discriminator === device.state.commissioning.discriminator);
    });

    it("commissions and initializes endpoints after commissioning and restart", async () => {
        // *** COMMISSIONING ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        expect(device.state.commissioning.commissioned).equals(true);
        expect(controller.peers.size).equals(1);

        // *** INITIAL STATE ***

        // Get a client view of the device
        const peer1 = await subscribedPeer(controller, "peer1");

        // Verify commissioning addresses were stored correctly
        const addresses = peer1.state.commissioning.addresses;
        expect(addresses).not.undefined;
        const ipAddresses = addresses!.filter(a => ServerAddress.isIp(a));
        expect(ipAddresses.length).equals(1 /*2*/); // Currently we only store "last known good" address
        // Device is index 2, so should have 10.10.10.2 and ...8802
        //expect(ipAddresses.some(a => a.ip === "10.10.10.2")).true;
        expect(ipAddresses.some(a => (a as ServerAddressIp).ip === "abcd::2")).true;

        // Validate the root endpoint
        expect(Object.keys(peer1.state).sort()).deep.equals(Object.keys(PEER1_STATE).sort());
        for (const key in peer1.state) {
            const actual = (peer1.state as Record<string, unknown>)[key] as Val.Struct;
            const expected = (PEER1_STATE as Record<string, unknown>)[key];
            expect(deepCopy(actual)).deep.equals(expected);
        }
        const expectedPeer1State = deepCopy(peer1.state);

        // Validate the light endpoint
        expect(peer1.parts.size).equals(1);
        const ep1 = peer1.parts.get("ep1")!;
        expect(ep1).not.undefined;
        const expectedEp1State = deepCopy(ep1.state);
        expect(expectedEp1State).deep.equals(EP1_STATE);

        // *** STATE AFTER RESTART ***

        // Close all nodes
        await site.close();

        // Recreate the controller
        const controllerB = await site.addNode(undefined, { id: "controller1", index: 1 });

        // Retrieve the client view of the device that should have been recreated from cache
        const peer1b = controllerB.peers.get("peer1")!;
        expect(peer1b).not.undefined;

        // Client nodes should fully initialize on the initial load.  We could initialize asynchronously during ServerNode
        // initialization, but currently we don't
        expect(peer1b.construction.status).equals("active");

        // Validate the root endpoint
        expect(peer1b.state).deep.equals(expectedPeer1State);

        // Validate the light endpoint
        expect(peer1b.parts.size).equals(1);
        const ep1b = peer1b.parts.get("ep1")!;
        expect(ep1b).not.undefined;
        expect(ep1b.construction.status).equals("active");
        expect(ep1b.state).deep.equals(expectedEp1State);
    });

    it("commissions and initializes endpoints even with a leave event in initial subscription data", async () => {
        // *** COMMISSIONING ***

        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;

        // We end up with session collisions without entropy so enable during pairing
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await device.act(agent =>
            agent.endpoint.eventsOf(BasicInformationServer).leave.emit({ fabricIndex: FabricIndex(1) }, agent.context),
        );

        await controller.start();
        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });

        controllerCrypto.entropic = deviceCrypto.entropic = false;

        expect(device.state.commissioning.commissioned).equals(true);
        expect(controller.peers.size).equals(1);

        // *** INITIAL STATE ***

        // Obtain client view of the device
        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Validate the root endpoint
        expect(Object.keys(peer1.state).sort()).deep.equals(Object.keys(PEER1_STATE).sort());
    });

    it("commissions with a short numeric passcode", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        const device = await site.addDevice({
            commissioning: {
                passcode: 1,
            },
        });

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();
        const { passcode, discriminator } = device.state.commissioning;
        expect(passcode).equals(1);
        await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });

        controllerCrypto.entropic = deviceCrypto.entropic = false;

        expect(device.state.commissioning.commissioned).equals(true);
        expect(controller.peers.size).equals(1);
    });

    it("initializes a newly-commissioned node with autoSubscribe:false without a manual reconnect", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();
        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(
            controller.peers.commission({ passcode, discriminator, timeout: Seconds(90), autoSubscribe: false }),
            { macrotasks: true },
        );
        controllerCrypto.entropic = deviceCrypto.entropic = false;

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;
        expect(peer1.stateOf(NetworkClient).autoSubscribe).equals(false);

        // The one-time post-commission read populated cluster state and endpoint structure without a manual reconnect
        expect(peer1.maybeStateOf(BasicInformationBehavior)?.vendorName).equals("Matter.js Test Vendor");
        expect(peer1.parts.size).equals(1);
    });

    it("skips the post-commission read when autoStateInitialize is false", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();
        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(
            controller.peers.commission({
                passcode,
                discriminator,
                timeout: Seconds(90),
                autoSubscribe: false,
                autoStateInitialize: false,
            }),
            { macrotasks: true },
        );
        controllerCrypto.entropic = deviceCrypto.entropic = false;

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Opting out leaves the node uninitialized: no post-commission read, so no cluster state and no endpoint structure
        expect(peer1.maybeStateOf(BasicInformationBehavior)).equals(undefined);
        expect(peer1.parts.size).equals(0);
    });

    it("commissions with an explicit id and restores the peer under that id after restart", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        const device = await site.addDevice();

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();
        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(
            controller.peers.commission({ id: "device", passcode, discriminator, timeout: Seconds(90) }),
            { macrotasks: true },
        );

        controllerCrypto.entropic = deviceCrypto.entropic = false;

        expect(device.state.commissioning.commissioned).equals(true);
        expect(controller.peers.size).equals(1);
        expect([...controller.peers].map(n => n.id)).deep.equals(["device"]);
        expect(controller.peers.get("device")).not.undefined;

        // *** RESTART controller (models the two-process commission-then-toggle flow) ***
        await site.close();
        const controllerB = await site.addNode(undefined, { id: "controller1", index: 1 });

        expect(controllerB.peers.size).equals(1);
        expect([...controllerB.peers].map(n => n.id)).deep.equals(["device"]);
        expect(controllerB.peers.get("device")).not.undefined;
    });

    it("assigns an unused node ID when commissioning after a restart with existing peers", async () => {
        await using site = new MockSite();

        // Commission a first device, which receives node ID 1
        const { controller } = await site.addCommissionedPair();
        expect(controller.peers.size).equals(1);
        expect([...controller.peers][0].state.commissioning.peerAddress?.nodeId).equals(NodeId(1));

        // *** RESTART controller ***
        await site.close();
        const controllerB = await site.addNode(undefined, { id: "controller1", index: 1 });
        expect(controllerB.peers.size).equals(1);

        // Commission a second device without an explicit node ID.  The allocator must skip the restored
        // peer's node ID rather than offer it and later reject it as already commissioned.
        const device2 = await site.addDevice();
        const controllerCrypto = controllerB.env.get(Crypto) as MockCrypto;
        const device2Crypto = device2.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = device2Crypto.entropic = true;

        const { passcode, discriminator } = device2.state.commissioning;
        await MockTime.resolve(controllerB.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });
        controllerCrypto.entropic = device2Crypto.entropic = false;

        expect(controllerB.peers.size).equals(2);
        const nodeIds = [...controllerB.peers].map(n => n.state.commissioning.peerAddress?.nodeId);
        expect(nodeIds).contains(NodeId(1));
        expect(nodeIds).contains(NodeId(2));
    });

    it("rejects node-level commissioning without known addresses", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        const { passcode, discriminator } = device.state.commissioning;
        const discovered = await MockTime.resolve(
            controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(30) }),
            { macrotasks: true },
        );
        const candidate = discovered[0];
        expect(candidate).not.undefined;

        await candidate.set({
            commissioning: {
                addresses: undefined,
            },
        });

        await MockTime.resolve(
            expect(candidate.commission({ passcode, discriminator })).rejectedWith("has not been located"),
        );
    });

    it("establishes a PASE session via discovery (PaseDiscovery)", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        const wrongPasscodeDevice = await site.addDevice({
            commissioning: {
                discriminator: 1234,
                passcode: 20202021,
            },
        });
        const matchingPasscodeDevice = await site.addDevice({
            commissioning: {
                discriminator: 1234,
                passcode: 22223333,
            },
        });

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const wrongDeviceCrypto = wrongPasscodeDevice.env.get(Crypto) as MockCrypto;
        const matchingDeviceCrypto = matchingPasscodeDevice.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = wrongDeviceCrypto.entropic = matchingDeviceCrypto.entropic = true;

        await controller.start();
        await controller.act(agent => agent.load(ControllerBehavior));

        // PaseDiscovery discovers both devices but only the one with matching passcode establishes PASE.
        const paseSession = await MockTime.resolve(
            controller.peers.pase({
                passcode: 22223333,
                longDiscriminator: 1234,
                timeout: Seconds(30),
            }),
            { macrotasks: true },
        );

        await paseSession.initiateForceClose({ cause: new Error("test cleanup") });

        controllerCrypto.entropic = wrongDeviceCrypto.entropic = matchingDeviceCrypto.entropic = false;

        expect(paseSession).not.undefined;
    });

    it("commissions the correct node with same-discriminator devices and mixed passcodes", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        const wrongPasscodeDevice = await site.addDevice({
            commissioning: {
                discriminator: 1234,
                passcode: 20202021,
            },
        });
        const matchingPasscodeDevice = await site.addDevice({
            commissioning: {
                discriminator: 1234,
                passcode: 22223333,
            },
        });

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const wrongDeviceCrypto = wrongPasscodeDevice.env.get(Crypto) as MockCrypto;
        const matchingDeviceCrypto = matchingPasscodeDevice.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = wrongDeviceCrypto.entropic = matchingDeviceCrypto.entropic = true;

        await controller.start();
        const commissioned = await MockTime.resolve(
            controller.peers.commission({
                passcode: 22223333,
                discriminator: 1234,
                timeout: Seconds(90),
            }),
            { macrotasks: true },
        );

        controllerCrypto.entropic = wrongDeviceCrypto.entropic = matchingDeviceCrypto.entropic = false;

        expect(commissioned).not.undefined;
        expect(wrongPasscodeDevice.state.commissioning.commissioned).equals(false);
        expect(matchingPasscodeDevice.state.commissioning.commissioned).equals(true);
        expect(controller.peers.size).at.least(1);
    });

    it("commissions same-discriminator devices with an explicit node ID without a peer-address conflict", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        const wrongPasscodeDevice = await site.addDevice({
            commissioning: {
                discriminator: 1234,
                passcode: 20202021,
            },
        });
        const matchingPasscodeDevice = await site.addDevice({
            commissioning: {
                discriminator: 1234,
                passcode: 22223333,
            },
        });

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const wrongDeviceCrypto = wrongPasscodeDevice.env.get(Crypto) as MockCrypto;
        const matchingDeviceCrypto = matchingPasscodeDevice.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = wrongDeviceCrypto.entropic = matchingDeviceCrypto.entropic = true;

        await controller.start();

        // A caller-supplied node ID is shared by every parallel candidate.  Allocation must happen only after a
        // candidate wins PASE, otherwise the losing candidate reserves the ID first and the winner fails with an
        // identity conflict before it can commission.
        const explicitNodeId = NodeId(88n);
        const commissioned = await MockTime.resolve(
            controller.peers.commission({
                passcode: 22223333,
                discriminator: 1234,
                nodeId: explicitNodeId,
                timeout: Seconds(90),
            }),
            { macrotasks: true },
        );

        controllerCrypto.entropic = wrongDeviceCrypto.entropic = matchingDeviceCrypto.entropic = false;

        expect(commissioned).not.undefined;
        expect(wrongPasscodeDevice.state.commissioning.commissioned).equals(false);
        expect(matchingPasscodeDevice.state.commissioning.commissioned).equals(true);
        expect(commissioned.state.commissioning.peerAddress?.nodeId).equals(explicitNodeId);
    });

    it("rejects commissioning with an explicit node ID that is already in use before establishing PASE", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const device = await site.addDevice({
            commissioning: {
                discriminator: 999,
                passcode: 22223333,
            },
        });

        // The node ID already assigned to the commissioned peer is reserved and must be refused.
        const usedNodeId = controller.peers.get("peer1")!.peerAddress!.nodeId;

        const discovered = await MockTime.resolve(
            controller.peers.discover({ longDiscriminator: 999, timeout: Seconds(30) }),
            { macrotasks: true },
        );
        const candidate = discovered[0];
        expect(candidate).not.undefined;

        // Use a wrong passcode: the conflict must be reported before PASE, so we expect "already in use"
        // rather than a PASE failure that would result if the check ran only at post-PASE allocation.
        await MockTime.resolve(
            expect(candidate.commission({ passcode: 11112222, discriminator: 999, nodeId: usedNodeId })).rejectedWith(
                /already in use/i,
            ),
        );

        expect(device.state.commissioning.commissioned).equals(false);
    });

    it("commissions via known-address flow even when first address has invalid credentials", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        const wrongPasscodeDevice = await site.addDevice({
            commissioning: {
                discriminator: 1234,
                passcode: 20202021,
            },
        });
        const matchingPasscodeDevice = await site.addDevice({
            commissioning: {
                discriminator: 1234,
                passcode: 22223333,
            },
        });

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const wrongDeviceCrypto = wrongPasscodeDevice.env.get(Crypto) as MockCrypto;
        const matchingDeviceCrypto = matchingPasscodeDevice.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = wrongDeviceCrypto.entropic = matchingDeviceCrypto.entropic = true;

        await controller.start();
        await controller.act(agent => agent.load(ControllerBehavior));
        const fabricConfig = await controller.act(agent => agent.get(ControllerBehavior).fabricAuthorityConfig);
        const fabric = await controller.env.get(FabricAuthority).defaultFabric(fabricConfig);

        const commissioner = controller.env.get(ControllerCommissioner);
        await MockTime.resolve(
            commissioner.commission({
                fabric,
                passcode: 22223333,
                addresses: [
                    { ip: "abcd::2", port: 5540 },
                    { ip: "abcd::3", port: 5540 },
                ],
            }),
            { macrotasks: true },
        );

        controllerCrypto.entropic = wrongDeviceCrypto.entropic = matchingDeviceCrypto.entropic = false;

        expect(wrongPasscodeDevice.state.commissioning.commissioned).equals(false);
        expect(matchingPasscodeDevice.state.commissioning.commissioned).equals(true);
    });

    it("invokes, receives state updates and emits changed events", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = await subscribedPeer(controller, "peer1");

        const ep1 = peer1.parts.get("ep1")!;
        expect(ep1).not.undefined;

        const receivedUpdate = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));

        // *** INVOCATION ***

        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());

        // *** UPDATE ***

        await MockTime.resolve(receivedUpdate);

        // *** Test another command also in the feature-set ***
        await MockTime.resolve(ep1.commandsOf(OnOffClient).offWithEffect({ effectIdentifier: 0, effectVariant: 0 }));
    });

    it("decommissions", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        expect(controller.peers.size).equals(1);
        expect(device.lifecycle.isCommissioned).is.true;

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;
        const peerAddress = peer1.peerAddress!;
        expect(peerAddress).not.undefined;

        // *** DECOMMISSION ***

        await MockTime.resolve(controller.peers.get("peer1")!.decommission());

        expect(controller.peers.size).equals(0);
        expect(device.lifecycle.isCommissioned).is.false;

        expect(controller.env.get(PeerSet).has(peerAddress)).false;

        // *** RESTART controller ***

        // Close all nodes
        await site.close();

        // Recreate the controller
        const controllerB = await site.addNode(undefined, { index: 1 });

        // Verify that the decommissioned device was not recreated from cache after restart
        expect(controllerB.peers.size).equals(0);

        const peer1b = controllerB.peers.get("peer1")!;
        expect(peer1b).undefined;
    });

    it("rejects delete after destroyed", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;

        await MockTime.resolve(peer1.decommission());

        await expect(MockTime.resolve(peer1.delete())).rejectedWith("is closed");
    });

    it("writes attributes on commit", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        // *** WRITE ***

        const peer1 = controller.peers.get("peer1")!;
        const ep1Client = peer1.parts.get("ep1")!;
        await MockTime.resolve(
            ep1Client.act(agent => {
                agent.get(OnOffClient).state.onTime = 20;
                agent.get(IdentifyClient).state.identifyTime = 5;
            }),
        );

        // *** VALIDATE ***

        const ep1Server = device.parts.get(1) as Endpoint<OnOffLightDevice>;
        expect(ep1Server.state.onOff.onTime).equals(20);
        expect(ep1Server.state.identify.identifyTime).equals(5);
    });

    it("writes nullable attribute: null, 0 and 2", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const ep1Client = peer1.parts.get("ep1")!;
        const ep1Server = device.parts.get(1) as Endpoint<OnOffLightDevice>;

        await MockTime.resolve(
            ep1Client.act(agent => {
                agent.get(OnOffClient).state.startUpOnOff = null;
            }),
        );
        expect(ep1Server.state.onOff.startUpOnOff).equals(null);

        await MockTime.resolve(
            ep1Client.act(agent => {
                agent.get(OnOffClient).state.startUpOnOff = OnOff.StartUpOnOff.Off;
            }),
        );
        expect(ep1Server.state.onOff.startUpOnOff).equals(OnOff.StartUpOnOff.Off);

        await MockTime.resolve(
            ep1Client.act(agent => {
                agent.get(OnOffClient).state.startUpOnOff = OnOff.StartUpOnOff.Toggle;
            }),
        );
        expect(ep1Server.state.onOff.startUpOnOff).equals(OnOff.StartUpOnOff.Toggle);
    });

    it("writes nullable attribute via setStateOf: null, 0 and 2", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const ep1Client = peer1.parts.get("ep1")!;
        const ep1Server = device.parts.get(1) as Endpoint<OnOffLightDevice>;

        await MockTime.resolve(ep1Client.setStateOf("onOff", { startUpOnOff: null }));
        expect(ep1Server.state.onOff.startUpOnOff).equals(null);

        await MockTime.resolve(ep1Client.setStateOf("onOff", { startUpOnOff: OnOff.StartUpOnOff.Off }));
        expect(ep1Server.state.onOff.startUpOnOff).equals(OnOff.StartUpOnOff.Off);

        await MockTime.resolve(ep1Client.setStateOf("onOff", { startUpOnOff: OnOff.StartUpOnOff.Toggle }));
        expect(ep1Server.state.onOff.startUpOnOff).equals(OnOff.StartUpOnOff.Toggle);
    });

    describe("writes attribute whose constraint references a sibling attribute", () => {
        // currentSensitivityLevel has constraint "max supportedSensitivityLevels - 1"; with
        // supportedSensitivityLevels = 3, value 2 must be accepted via every client commit path.

        const BscWithSensLevel = BooleanStateConfigurationServer.with("SensitivityLevel").set({
            supportedSensitivityLevels: 3,
            currentSensitivityLevel: 0,
            defaultSensitivityLevel: 0,
        });
        const ContactSensorWithSensLevel = ContactSensorDevice.with(BscWithSensLevel);

        async function setup() {
            const site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    device: ContactSensorWithSensLevel,
                },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            const ep1Client = peer1.parts.get("ep1")!;
            const ep1Server = device.parts.get(1)!;

            return { site, ep1Client, ep1Server };
        }

        it("via agent.state assignment", async () => {
            const { site, ep1Client, ep1Server } = await setup();
            await using _site = site;

            await MockTime.resolve(
                ep1Client.act(agent => {
                    agent.get(BooleanStateConfigurationClient).state.currentSensitivityLevel = 2;
                }),
            );

            expect(ep1Server.stateOf(BscWithSensLevel).currentSensitivityLevel).equals(2);
        });

        it("via setStateOf", async () => {
            const { site, ep1Client, ep1Server } = await setup();
            await using _site = site;

            await MockTime.resolve(
                ep1Client.setStateOf(BooleanStateConfigurationClient, { currentSensitivityLevel: 2 }),
            );

            expect(ep1Server.stateOf(BscWithSensLevel).currentSensitivityLevel).equals(2);
        });

        it("via endpoint.set", async () => {
            const { site, ep1Client, ep1Server } = await setup();
            await using _site = site;

            const typedClient = ep1Client as Endpoint<typeof ContactSensorWithSensLevel>;
            await MockTime.resolve(
                typedClient.set({
                    booleanStateConfiguration: { currentSensitivityLevel: 2 },
                }),
            );

            expect(ep1Server.stateOf(BscWithSensLevel).currentSensitivityLevel).equals(2);
        });
    });

    class DecliningBsc extends BooleanStateConfigurationServer.with("SensitivityLevel") {
        override initialize() {
            super.initialize();
            this.reactTo(this.events.currentSensitivityLevel$Changing, () => {
                throw new StatusResponseError("currentSensitivityLevel write declined", Status.ConstraintError);
            });
        }
    }

    const DecliningBscWithLevels = DecliningBsc.set({
        supportedSensitivityLevels: 3,
        currentSensitivityLevel: 0,
        defaultSensitivityLevel: 0,
    });

    class DecliningIdentify extends IdentifyServer {
        override initialize() {
            super.initialize();
            this.reactTo(this.events.identifyTime$Changing, () => {
                throw new StatusResponseError("identifyTime write declined", Status.ResourceExhausted);
            });
        }
    }

    async function captureRejection(write: () => unknown) {
        let caught: unknown;
        try {
            await MockTime.resolve(Promise.resolve(write() as Promise<unknown>));
        } catch (e) {
            caught = e;
        }
        return caught;
    }

    describe("surfaces a server-side write rejection to the caller", () => {
        // A server-side $Changing listener throws StatusResponseError so the remote write returns a
        // failure status.  The client's setStateOf / agent.state / endpoint.set must reject with a
        // StatusResponseError carrying the device's code, not the generic transaction
        // FinalizationError that previously hid it.

        const DecliningContactSensor = ContactSensorDevice.with(DecliningBscWithLevels);

        async function setup() {
            const site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    device: DecliningContactSensor,
                },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            const ep1Client = peer1.parts.get("ep1")!;
            const ep1Server = device.parts.get(1)!;

            return { site, ep1Client, ep1Server };
        }

        it("via agent.state assignment", async () => {
            const { site, ep1Client, ep1Server } = await setup();
            await using _site = site;

            const caught = await captureRejection(() =>
                ep1Client.act(agent => {
                    agent.get(BooleanStateConfigurationClient).state.currentSensitivityLevel = 1;
                }),
            );

            expect(caught).instanceOf(StatusResponseError);
            expect((caught as StatusResponseError).code).equals(Status.ConstraintError);
            expect(ep1Server.stateOf(DecliningBscWithLevels).currentSensitivityLevel).equals(0);
        });

        it("via setStateOf", async () => {
            const { site, ep1Client, ep1Server } = await setup();
            await using _site = site;

            const caught = await captureRejection(() =>
                ep1Client.setStateOf(BooleanStateConfigurationClient, { currentSensitivityLevel: 1 }),
            );

            expect(caught).instanceOf(StatusResponseError);
            expect((caught as StatusResponseError).code).equals(Status.ConstraintError);
            expect(ep1Server.stateOf(DecliningBscWithLevels).currentSensitivityLevel).equals(0);
        });

        it("via endpoint.set", async () => {
            const { site, ep1Client, ep1Server } = await setup();
            await using _site = site;

            const typedClient = ep1Client as Endpoint<typeof DecliningContactSensor>;
            const caught = await captureRejection(() =>
                typedClient.set({
                    booleanStateConfiguration: { currentSensitivityLevel: 1 },
                }),
            );

            expect(caught).instanceOf(StatusResponseError);
            expect((caught as StatusResponseError).code).equals(Status.ConstraintError);
            expect(ep1Server.stateOf(DecliningBscWithLevels).currentSensitivityLevel).equals(0);
        });

        it("via local ServerNode set surfaces the listener's StatusResponseError", async () => {
            const { site, ep1Server } = await setup();
            await using _site = site;

            const caught = await captureRejection(() =>
                ep1Server.act(agent => {
                    agent.get(DecliningBsc).state.currentSensitivityLevel = 1;
                }),
            );

            expect(caught).instanceOf(StatusResponseError);
            expect((caught as StatusResponseError).code).equals(Status.ConstraintError);
            expect(ep1Server.stateOf(DecliningBscWithLevels).currentSensitivityLevel).equals(0);
        });
    });

    describe("forwards a model-invalid write so the peer device adjudicates", () => {
        // A value the local model rejects on conformance/spec grounds (here an enum value not defined in the model) is
        // forwarded to the peer rather than rejected during local validation.  The device declines it via its own
        // validation, the rejection surfaces to the caller as the device's status, and the local cache is rolled back.

        it("device rejects the value and the local cache is compensated", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");
            const ep1Client = peer1.parts.get("ep1")!;
            const ep1Server = device.parts.get(1) as Endpoint<OnOffLightDevice>;

            const before = ep1Server.state.onOff.startUpOnOff;

            const caught = await captureRejection(() =>
                ep1Client.setStateOf(OnOffClient, { startUpOnOff: 99 as OnOff.StartUpOnOff }),
            );

            // The rejection is the device's write-response status, not a local ValidateError, proving the value was
            // forwarded to the device rather than rejected during local validation (which would throw before any
            // exchange and never contact the device).
            expect(caught).instanceOf(StatusResponseError);
            expect(caught).not.instanceOf(ValidateError);
            expect((caught as StatusResponseError).code).equals(Status.ConstraintError);

            // The device did not apply the value and the local cache was rolled back to match.
            expect(ep1Server.state.onOff.startUpOnOff).equals(before);
            expect(ep1Client.stateOf(OnOffClient).startUpOnOff).equals(before);
        });
    });

    describe("aggregates multiple write rejections in one transaction", () => {
        // Two writes in a single transaction, declined on the server via $Changing listeners on
        // attributes from different clusters.  Verifies the caller's view:
        //  - one of two declined: WriteResult throws a single PathError → caller sees a
        //    StatusResponseError carrying that attribute's status code
        //  - both declined: WriteResult throws a MatterAggregateError carrying both PathErrors

        const PartialDeclineDevice = ContactSensorDevice.with(DecliningBscWithLevels);
        const FullDeclineDevice = ContactSensorDevice.with(DecliningBscWithLevels, DecliningIdentify);

        async function setup(deviceType: typeof PartialDeclineDevice | typeof FullDeclineDevice) {
            const site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    device: deviceType,
                },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            const ep1Client = peer1.parts.get("ep1")!;
            const ep1Server = device.parts.get(1)!;

            return { site, ep1Client, ep1Server };
        }

        it("when one of two writes is declined, surfaces only that rejection", async () => {
            const { site, ep1Client, ep1Server } = await setup(PartialDeclineDevice);
            await using _site = site;

            const caught = await captureRejection(() =>
                ep1Client.act(agent => {
                    agent.get(BooleanStateConfigurationClient).state.currentSensitivityLevel = 1;
                    agent.get(IdentifyClient).state.identifyTime = 5;
                }),
            );

            expect(caught).instanceOf(StatusResponseError);
            expect((caught as StatusResponseError).code).equals(Status.ConstraintError);

            // The accepted write committed on the server; the rejected one did not.
            expect(ep1Server.stateOf(DecliningBscWithLevels).currentSensitivityLevel).equals(0);
            expect(ep1Server.stateOf(IdentifyServer).identifyTime).equals(5);
        });

        it("when both writes are declined, surfaces a MatterAggregateError with each per-attribute error", async () => {
            const { site, ep1Client, ep1Server } = await setup(FullDeclineDevice);
            await using _site = site;

            const caught = await captureRejection(() =>
                ep1Client.act(agent => {
                    agent.get(BooleanStateConfigurationClient).state.currentSensitivityLevel = 1;
                    agent.get(IdentifyClient).state.identifyTime = 5;
                }),
            );

            expect(caught).instanceOf(MatterAggregateError);
            const aggregate = caught as MatterAggregateError;
            expect(aggregate.errors).lengthOf(2);
            for (const inner of aggregate.errors) {
                expect(inner).instanceOf(StatusResponseError);
            }
            const codes = (aggregate.errors as StatusResponseError[]).map(e => e.code);
            expect(codes).contains(Status.ConstraintError);
            expect(codes).contains(Status.ResourceExhausted);

            expect(ep1Server.stateOf(DecliningBscWithLevels).currentSensitivityLevel).equals(0);
            expect(ep1Server.stateOf(IdentifyServer).identifyTime).equals(0);
        });
    });

    describe("rolls local cache back when a remote write is declined", () => {
        // After a declined remote write, the local cache must NOT keep the value the user attempted to
        // write.  Compensation restores the pre-write value via the same path subscription updates
        // use, so the client mirror stays consistent with the server.

        const PartialDeclineDevice = ContactSensorDevice.with(DecliningBscWithLevels);
        const FullDeclineDevice = ContactSensorDevice.with(DecliningBscWithLevels, DecliningIdentify);

        async function setup(deviceType: typeof PartialDeclineDevice | typeof FullDeclineDevice) {
            const site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    device: deviceType,
                },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            const ep1Client = peer1.parts.get("ep1")!;
            const ep1Server = device.parts.get(1)!;

            return { site, ep1Client, ep1Server };
        }

        async function readClientCurrentSensitivityLevel(ep1Client: Endpoint) {
            let value: number | undefined;
            await ep1Client.act(agent => {
                value = agent.get(BooleanStateConfigurationClient).state.currentSensitivityLevel;
            });
            return value;
        }

        async function readClientIdentifyTime(ep1Client: Endpoint) {
            let value: number | undefined;
            await ep1Client.act(agent => {
                value = agent.get(IdentifyClient).state.identifyTime;
            });
            return value;
        }

        it("restores the pre-write value when the only write is declined", async () => {
            const { site, ep1Client } = await setup(PartialDeclineDevice);
            await using _site = site;

            const caught = await captureRejection(() =>
                ep1Client.setStateOf(BooleanStateConfigurationClient, { currentSensitivityLevel: 1 }),
            );

            expect(caught).instanceOf(StatusResponseError);
            expect(await readClientCurrentSensitivityLevel(ep1Client)).equals(0);
        });

        it("restores only the declined attribute when one of two writes is declined", async () => {
            const { site, ep1Client, ep1Server } = await setup(PartialDeclineDevice);
            await using _site = site;

            const caught = await captureRejection(() =>
                ep1Client.act(agent => {
                    agent.get(BooleanStateConfigurationClient).state.currentSensitivityLevel = 1;
                    agent.get(IdentifyClient).state.identifyTime = 5;
                }),
            );

            expect(caught).instanceOf(StatusResponseError);
            // Declined: client and server both back at 0
            expect(await readClientCurrentSensitivityLevel(ep1Client)).equals(0);
            expect(ep1Server.stateOf(DecliningBscWithLevels).currentSensitivityLevel).equals(0);
            // Accepted: client and server both at 5
            expect(await readClientIdentifyTime(ep1Client)).equals(5);
            expect(ep1Server.stateOf(IdentifyServer).identifyTime).equals(5);
        });

        it("restores both attributes when both writes are declined", async () => {
            const { site, ep1Client } = await setup(FullDeclineDevice);
            await using _site = site;

            const caught = await captureRejection(() =>
                ep1Client.act(agent => {
                    agent.get(BooleanStateConfigurationClient).state.currentSensitivityLevel = 1;
                    agent.get(IdentifyClient).state.identifyTime = 5;
                }),
            );

            expect(caught).instanceOf(MatterAggregateError);
            expect(await readClientCurrentSensitivityLevel(ep1Client)).equals(0);
            expect(await readClientIdentifyTime(ep1Client)).equals(0);
        });
    });

    describe("writes a fabric-scoped struct attribute via setStateOf", () => {
        // Matter §7.13.6: callers pass OMIT_FABRIC for the mandatory FabricIndex field; the validator
        // substitutes the peer's assigned index (or skips on a relaxed remote-write context).

        it("accepts FabricIndex.OMIT_FABRIC as the mandatory placeholder", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const newSubject = NodeId(BigInt(0x55));

            await MockTime.resolve(
                peer1.setStateOf(AccessControlClient, {
                    acl: [
                        {
                            privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                            authMode: AccessControl.AccessControlEntryAuthMode.Case,
                            subjects: [newSubject],
                            targets: null,
                            fabricIndex: FabricIndex.OMIT_FABRIC,
                        },
                    ],
                }),
            );

            const aclOnServer = device.state.accessControl.acl;
            const written = aclOnServer.find(entry => entry.subjects?.[0] === newSubject);
            expect(written, "server-side ACL entry written by peer is missing").to.be.ok;
            expect(written!.fabricIndex).greaterThan(0);
            expect(written!.fabricIndex).lessThan(255);

            const aclOnPeerCache = peer1.stateOf(AccessControlClient).acl;
            const cached = aclOnPeerCache.find(entry => entry.subjects?.[0] === newSubject);
            expect(cached, "local ClientNode cache is missing the written ACL entry").to.be.ok;
            expect(cached!.fabricIndex).equals(written!.fabricIndex);
        });

        it("rejects FabricIndex.NO_FABRIC (0)", async () => {
            // Matter §7.5.2: fabric-scoped data SHALL NOT use fabric-index 0.  Caller bug surface preserved.

            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const caught = await captureRejection(() =>
                peer1.setStateOf(AccessControlClient, {
                    acl: [
                        {
                            privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                            authMode: AccessControl.AccessControlEntryAuthMode.Case,
                            subjects: [NodeId(BigInt(0x56))],
                            targets: null,
                            fabricIndex: FabricIndex.NO_FABRIC,
                        },
                    ],
                }),
            );

            expect((caught as Error)?.message).match(/Constraint .*Value 0 is not within bounds/);
        });

        it("does not relax server-side fabricIndex validation", async () => {
            // Guards against leakage of `underClientNode` onto server-rooted contexts.

            await using site = new MockSite();
            const { device } = await site.addCommissionedPair();

            const caught = await captureRejection(() =>
                device.setStateOf("accessControl", {
                    acl: [
                        {
                            privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                            authMode: AccessControl.AccessControlEntryAuthMode.Case,
                            subjects: [NodeId(BigInt(0x57))],
                            targets: null,
                            fabricIndex: FabricIndex.OMIT_FABRIC,
                        },
                    ],
                }),
            );

            expect((caught as Error)?.message).match(/Value -1 is below the uint8 minimum/);
        });
    });

    describe("captures and backfills the peer-assigned fabric index", () => {
        it("captures fabricIndexOnPeer at commissioning", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = controller.peers.get("peer1")!;

            const captured = peer1.state.commissioning.fabricIndexOnPeer;
            expect(captured).is.a("number");
            expect(captured).greaterThan(0);
            expect(captured).lessThan(255);
        });

        it("backfills fabricIndexOnPeer from operational credentials on reload when state was cleared", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");
            const captured = peer1.state.commissioning.fabricIndexOnPeer;
            expect(captured).is.a("number");

            // Simulate a peer commissioned before this field existed: clear and persist.
            await peer1.setStateOf(CommissioningClient, { fabricIndexOnPeer: undefined });
            expect(peer1.state.commissioning.fabricIndexOnPeer).equals(undefined);

            // Close + reload — partsReady triggers backfill from OperationalCredentialsClient.currentFabricIndex.
            await site.close();
            const controllerB = await site.addNode(undefined, { id: "controller1", index: 1 });
            const peer1b = controllerB.peers.get("peer1")!;

            expect(peer1b.state.commissioning.fabricIndexOnPeer).equals(captured);
        });
    });

    it("emits Matter events", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;

        // *** TEST ***

        const startUp = new Promise(resolve =>
            peer1.eventsOf(BasicInformationBehavior).startUp.on(payload => {
                resolve(payload);
            }),
        );
        device.act(agent => agent.basicInformation.events.startUp.emit({ softwareVersion: 12 }, agent.context));
        const payload = await MockTime.resolve(startUp);

        // *** VALIDATE ***

        expect(payload).deep.equals({ softwareVersion: 12 });
    });

    it("handles endpoints that appear and disappear", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                parts: [
                    {
                        id: "aggregator",
                        type: AggregatorEndpoint,
                    },
                ],
            },
        });
        const peer1 = controller.peers.get("peer1")!;

        const aggregatorServer = device.parts.get("aggregator")!;
        expect(aggregatorServer).not.undefined;
        expect(aggregatorServer.parts.size).equals(0);

        const aggregatorClient = peer1.parts.get("ep1")!;
        expect(aggregatorClient).not.undefined;
        expect(aggregatorClient.type.deviceType).equals(AggregatorEndpoint.deviceType);
        expect(aggregatorClient.parts.size).equals(0);

        // *** ADD ENDPOINT ***

        const added = Promise.resolve(aggregatorClient.parts.added);
        const lightServer = new Endpoint(OnOffLightDevice);
        await aggregatorServer.add(lightServer);

        const lightClient = await MockTime.resolve(added);
        expect(lightClient.number).equals(lightServer.number);
        expect(lightClient.type.deviceType).equals(OnOffLightDevice.deviceType);

        // *** DELETE ENDPOINT ***

        const deleted = Promise.resolve(lightClient.lifecycle.destroyed);
        await lightServer.delete();
        await MockTime.resolve(deleted);
        expect(aggregatorClient.parts.size).equals(0);
    });

    it("erases node after leave event", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        // *** CONFIRM FABRIC IDENTITY ***

        const deviceFabric = device.env.get(FabricManager).fabrics[0];
        expect(deviceFabric).not.undefined;
        const controllerFabric = controller.env.get(FabricManager).fabrics[0];
        expect(controllerFabric).not.undefined;
        expect(deviceFabric.fabricId).equals(controllerFabric.fabricId);

        // *** LEAVE FABRIC ON PEER ***

        const deleted = Promise.resolve(peer1.lifecycle.destroyed);
        await MockTime.resolve(deviceFabric.leave());

        // *** NOTE DELETION ON CONTROLLER ***

        await MockTime.resolve(deleted);
        expect(controller.peers.size).equals(0);
    });

    it("invokes command on an undiscovered peer", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const peerAddress = peer1.peerAddress;
        expect(peerAddress).not.undefined;

        await MockTime.resolve(controller.peers.get("peer1")!.delete());
        expect(controller.peers.size).equals(0);

        const peer = await controller.peers.forAddress(peerAddress!);
        const ep1 = peer.endpoints.require(1);
        ep1.behaviors.require(OnOffClient);

        // *** INVOCATION ***

        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());

        await MockTime.resolve(ep1.commandsOf(OnOffClient).offWithEffect({ effectIdentifier: 0, effectVariant: 0 }));
    });

    it("forAddress returns the same node for concurrent calls", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peerAddress = controller.peers.get("peer1")!.peerAddress!;
        expect(peerAddress).not.undefined;

        await MockTime.resolve(controller.peers.get("peer1")!.delete());
        expect(controller.peers.size).equals(0);

        const [a, b] = await MockTime.resolve(
            Promise.all([controller.peers.forAddress(peerAddress), controller.peers.forAddress(peerAddress)]),
            { macrotasks: true },
        );

        expect(a).equals(b);
        expect(controller.peers.size).equals(1);
    });

    it("refuses to allocate a peer address whose NodeId is already in use", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const { fabricIndex, nodeId } = controller.peers.get("peer1")!.peerAddress!;

        await expect(
            controller.act(agent => agent.get(ControllerBehavior).allocatePeerAddress(fabricIndex, nodeId)),
        ).rejectedWith(/already in use/i);
    });

    it("properly supports unknown clusters", async () => {
        // *** SETUP ***

        // Create a List attribute with 5x500byte data which will be transferred chunked in any case to ensure correct decoding
        const crypto = MockCrypto();
        const optList = new Array<Bytes>();
        for (let i = 0; i < 5; i++) {
            optList.push(crypto.randomBytes(500));
        }

        await using site = new MockSite();
        let { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint.with(MyBehavior),
                myCluster: {
                    optList,
                },
            },
        });

        // *** VERIFY STRUCTURE ***

        verifyStructure();

        // *** RECREATE CONTROLLER ***

        await MockTime.resolve(controller.close());
        controller = await site.addController({ index: 1 });

        // *** REVERIFY STRUCTURE ***

        verifyStructure();

        function verifyStructure() {
            const peer = controller.peers.get("peer1")!;

            const behavior = peer.behaviors.supported.cluster$1234fc01;
            expect(typeof behavior).equals("function");
            expect((behavior as ClusterBehavior.Type).schema.id).equals(0x1234_fc01);
            expect((behavior as ClusterBehavior.Type).cluster.id).equals(0x1234_fc01);

            const state = peer.maybeStateOf("cluster$1234fc01");
            expect(typeof state).equals("object");
            expect((state as Val.Struct)[1]).equals("hello");
            expect((state as Val.Struct).attr$1).equals("hello");
            expect((state as Val.Struct)[20]).deep.equals(optList); // by numeric attribute ID
            expect((state as Val.Struct).attr$14).deep.equals(optList); // by name (ID 20 = 0x14)

            const stateById = (peer.state as Record<number, Val.Struct>)[0x1234_fc01];
            expect(typeof stateById).equals("object");
            expect(stateById[20]).deep.equals(optList);
            expect(stateById.attr$14).deep.equals(optList);
        }
    });

    it("correctly replaces behavior", async () => {
        // *** SETUP ***

        const LiftWc = WindowCoveringServer.with("Lift", "PositionAwareLift").set({
            currentPositionLiftPercent100ths: 0,
        });

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: WindowCoveringDevice.with(LiftWc),
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const clientEp1 = peer1.parts.get("ep1")!;
        expect(clientEp1).not.undefined;

        const liftChanged = new Observable<[value: number | null]>();
        const lift$Changed = clientEp1.eventsOf(WindowCoveringClient).currentPositionLiftPercent100ths$Changed!;
        expect(lift$Changed).not.undefined;
        lift$Changed.on(value => liftChanged.emit(value));

        // *** VALIDATE SETUP ***

        const serverEp1 = device.parts.get("part0")!;
        expect(serverEp1).not.undefined;

        let sawChange = new Promise<number | null>(resolve => liftChanged.once(resolve));
        await serverEp1.setStateOf(WindowCoveringClient, { currentPositionLiftPercent100ths: 600 });

        let newValue = await MockTime.resolve(sawChange);
        expect(newValue).equals(600);

        // *** REPLACE CLUSTER ***

        await MockTime.resolve(device.stop());

        await serverEp1.erase();

        const LiftTiltWc = WindowCoveringServer.with("Lift", "PositionAwareLift", "Tilt", "PositionAwareTilt").set({
            type: WindowCovering.WindowCoveringType.Unknown,
            currentPositionLiftPercent100ths: 0,
            currentPositionTiltPercent100ths: 0,
        });

        // Nudge so version number changes, otherwise new endpoint won't sync
        device.env.set(Entropy, MockCrypto(0x20));

        const serverEp1b = await device.add({
            type: WindowCoveringDevice.with(LiftTiltWc),
            number: 1,
            id: "part0b",
        });

        const replaced = new Promise(resolve => peer1.env.get(ClientStructureEvents).clusterReplaced.on(resolve));

        await MockTime.resolve(device.start());

        // *** VALIDATE ***

        await MockTime.resolve(replaced);

        expect(clientEp1.globalsOf(WindowCoveringClient).featureMap).deep.equals({
            lift: true,
            positionAwareLift: true,
            tilt: true,
            positionAwareTilt: true,
        });

        // featuresOf reflects the installed behavior's schema, so a stale rebuild seeded from the bind-time
        // snapshot would still report the old Lift-only feature set here even though the featureMap value updated.
        const features = clientEp1.featuresOf(WindowCoveringClient);
        expect(features.lift).equals(true);
        expect(features.positionAwareLift).equals(true);
        expect(features.tilt).equals(true);
        expect(features.positionAwareTilt).equals(true);

        sawChange = new Promise<number | null>(resolve => liftChanged.once(resolve));
        await serverEp1b.setStateOf(WindowCoveringClient, { currentPositionLiftPercent100ths: 1200 });

        newValue = await MockTime.resolve(sawChange);
        expect(newValue).equals(1200);
    });

    it("exposes attributes added by a behavior replace", async () => {
        // *** SETUP ***

        const LiftWc = WindowCoveringServer.with("Lift", "PositionAwareLift").set({
            currentPositionLiftPercent100ths: 0,
        });

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: WindowCoveringDevice.with(LiftWc),
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        const clientEp1 = peer1.parts.get("ep1")!;
        expect(clientEp1).not.undefined;

        const serverEp1 = device.parts.get("part0")!;
        expect(serverEp1).not.undefined;

        // Tilt attribute is not part of the Lift-only schema, so reading it must fail before the replace
        await expect(
            MockTime.resolve(clientEp1.getStateOf(WindowCoveringClient, ["currentPositionTiltPercent100ths"])),
        ).rejectedWith(/currentPositionTiltPercent100ths/);

        // *** REPLACE CLUSTER ADDING TILT ***

        await MockTime.resolve(device.stop());
        await serverEp1.erase();

        const LiftTiltWc = WindowCoveringServer.with("Lift", "PositionAwareLift", "Tilt", "PositionAwareTilt").set({
            type: WindowCovering.WindowCoveringType.Unknown,
            currentPositionLiftPercent100ths: 0,
            currentPositionTiltPercent100ths: 0,
        });

        // Nudge so version number changes, otherwise new endpoint won't sync
        device.env.set(Entropy, MockCrypto(0x20));

        await device.add({
            type: WindowCoveringDevice.with(LiftTiltWc),
            number: 1,
            id: "part0b",
        });

        const replaced = new Promise(resolve => peer1.env.get(ClientStructureEvents).clusterReplaced.on(resolve));

        await MockTime.resolve(device.start());
        await MockTime.resolve(replaced);

        // *** VALIDATE ***

        // The attribute added by the Tilt feature must now be readable rather than reported absent
        const tilt = await MockTime.resolve(
            clientEp1.getStateOf(WindowCoveringClient, ["currentPositionTiltPercent100ths"]),
        );
        expect(tilt).deep.equals({ currentPositionTiltPercent100ths: 0 });

        // The local featureMap view must reflect the new feature set, not the stale Lift-only one
        expect(clientEp1.globalsOf(WindowCoveringClient).featureMap).deep.equals({
            lift: true,
            positionAwareLift: true,
            tilt: true,
            positionAwareTilt: true,
        });

        // The local state view must include the attribute added by the Tilt feature
        expect(clientEp1.stateOf(WindowCoveringClient).currentPositionTiltPercent100ths).equals(0);
    });

    it("propagates global attribute changes to the change notification service", async () => {
        // *** SETUP ***

        const LiftWc = WindowCoveringServer.with("Lift", "PositionAwareLift").set({
            currentPositionLiftPercent100ths: 0,
        });

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: WindowCoveringDevice.with(LiftWc),
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        const serverEp1 = device.parts.get("part0")!;

        const globalUpdates = new Array<{ properties?: string[] }>();
        const changeService = controller.env.get(ChangeNotificationService);
        changeService.change.on(change => {
            if (
                change.kind === "update" &&
                ClusterBehavior.is(change.behavior) &&
                change.behavior.cluster.id === WindowCoveringClient.cluster.id &&
                change.properties?.some(p => p === "featureMap" || p === "attributeList")
            ) {
                globalUpdates.push({ properties: change.properties });
            }
        });

        // *** REPLACE CLUSTER ADDING TILT ***

        await MockTime.resolve(device.stop());
        await serverEp1.erase();

        const LiftTiltWc = WindowCoveringServer.with("Lift", "PositionAwareLift", "Tilt", "PositionAwareTilt").set({
            type: WindowCovering.WindowCoveringType.Unknown,
            currentPositionLiftPercent100ths: 0,
            currentPositionTiltPercent100ths: 0,
        });

        device.env.set(Entropy, MockCrypto(0x20));

        await device.add({
            type: WindowCoveringDevice.with(LiftTiltWc),
            number: 1,
            id: "part0b",
        });

        const replaced = new Promise(resolve => peer1.env.get(ClientStructureEvents).clusterReplaced.on(resolve));

        await MockTime.resolve(device.start());
        await MockTime.resolve(replaced);

        // *** VALIDATE ***

        expect(
            globalUpdates.length,
            "featureMap/attributeList change must reach the change notification service",
        ).not.equals(0);
    });

    it("correctly removes behavior", async () => {
        // *** SETUP ***

        const LiftWc = WindowCoveringServer.with("Lift", "PositionAwareLift").set({
            currentPositionLiftPercent100ths: 0,
        });

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: OnOffLightDevice.with(LiftWc),
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const clientEp1 = peer1.parts.get("ep1")!;
        expect(clientEp1).not.undefined;

        // *** VALIDATE SETUP ***

        const serverEp1 = device.parts.get("part0")!;
        expect(serverEp1).not.undefined;

        expect(clientEp1.stateOf(WindowCoveringClient).currentPositionLiftPercent100ths).equals(0);

        expect(Object.keys(clientEp1.state)).deep.equals([
            "identify",
            "groups",
            "scenesManagement",
            "onOff",
            "windowCovering",
            "descriptor",
        ]);
        expect(clientEp1.behaviors.active.map(b => b.id)).deep.equals([
            "identify",
            "groups",
            "scenesManagement",
            "onOff",
            "windowCovering",
            "descriptor",
        ]);

        expect(clientEp1.behaviors.supported["windowCovering"]).to.be.ok;
        // *** REMOVE CLUSTER ***

        await MockTime.resolve(device.stop());

        await serverEp1.erase();

        // Nudge so version number changes, otherwise new endpoint won't sync
        device.env.set(Entropy, MockCrypto(0x20));

        await device.add({
            type: OnOffLightDevice,
            number: 1,
            id: "part0b",
        });

        const deleted = new Promise(resolve => peer1.env.get(ClientStructureEvents).clusterDeleted.on(resolve));

        await MockTime.resolve(device.start());

        // *** VALIDATE ***

        await MockTime.resolve(deleted);

        expect(clientEp1.maybeStateOf(WindowCoveringClient)).equals(undefined);

        expect(clientEp1.stateOf(OnOffClient).onOff).false;

        expect(clientEp1.behaviors.active.map(b => b.id)).deep.equals([
            "identify",
            "groups",
            "scenesManagement",
            "onOff",
            "descriptor",
        ]);

        expect(clientEp1.behaviors.supported["windowCovering"]).to.be.undefined;

        expect(Object.keys(clientEp1.state)).deep.equals([
            "identify",
            "groups",
            "scenesManagement",
            "onOff",
            "descriptor",
        ]);
    });

    it("removes attributes when a behavior replace drops a feature", async () => {
        // *** SETUP ***

        const LiftTiltWc = WindowCoveringServer.with("Lift", "PositionAwareLift", "Tilt", "PositionAwareTilt").set({
            type: WindowCovering.WindowCoveringType.Unknown,
            currentPositionLiftPercent100ths: 0,
            currentPositionTiltPercent100ths: 0,
        });

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: WindowCoveringDevice.with(LiftTiltWc),
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        const clientEp1 = peer1.parts.get("ep1")!;
        const serverEp1 = device.parts.get("part0")!;

        // Tilt is present initially
        expect(clientEp1.globalsOf(WindowCoveringClient).featureMap.tilt).equals(true);
        expect(clientEp1.stateOf(WindowCoveringClient).currentPositionTiltPercent100ths).equals(0);

        // *** REPLACE CLUSTER DROPPING TILT ***

        await MockTime.resolve(device.stop());
        await serverEp1.erase();

        const LiftWc = WindowCoveringServer.with("Lift", "PositionAwareLift").set({
            currentPositionLiftPercent100ths: 0,
        });

        // Nudge so version number changes, otherwise new endpoint won't sync
        device.env.set(Entropy, MockCrypto(0x20));

        await device.add({
            type: WindowCoveringDevice.with(LiftWc),
            number: 1,
            id: "part0b",
        });

        const replaced = new Promise(resolve => peer1.env.get(ClientStructureEvents).clusterReplaced.on(resolve));

        await MockTime.resolve(device.start());
        await MockTime.resolve(replaced);

        // *** VALIDATE ***

        // featureMap and feature view reflect the shrunk feature set
        expect(clientEp1.globalsOf(WindowCoveringClient).featureMap.tilt).equals(false);
        expect(clientEp1.featuresOf(WindowCoveringClient).tilt).equals(false);

        // The schema-validated read path correctly rejects the dropped attribute
        await expect(
            MockTime.resolve(clientEp1.getStateOf(WindowCoveringClient, ["currentPositionTiltPercent100ths"])),
        ).rejectedWith(/not present on behavior/);

        // The raw state view must not retain the dropped attribute's stale value
        expect(clientEp1.stateOf(WindowCoveringClient).currentPositionTiltPercent100ths).equals(undefined);

        // Lift attribute survives the replace
        expect(clientEp1.stateOf(WindowCoveringClient).currentPositionLiftPercent100ths).equals(0);
    });

    it("re-installs a cluster the device drops and later restores", async () => {
        // *** SETUP ***

        const LiftWc = WindowCoveringServer.with("Lift", "PositionAwareLift").set({
            currentPositionLiftPercent100ths: 0,
        });

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: OnOffLightDevice.with(LiftWc),
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        const clientEp1 = peer1.parts.get("ep1")!;

        expect(clientEp1.behaviors.supported["windowCovering"]).to.be.ok;

        // *** REMOVE THE CLUSTER ***

        await MockTime.resolve(device.stop());
        await device.parts.get("part0")!.erase();
        device.env.set(Entropy, MockCrypto(0x20));
        await device.add({ type: OnOffLightDevice, number: 1, id: "part0b" });

        const deleted = new Promise(resolve => peer1.env.get(ClientStructureEvents).clusterDeleted.on(resolve));
        await MockTime.resolve(device.start());
        await MockTime.resolve(deleted);

        expect(clientEp1.behaviors.supported["windowCovering"]).to.be.undefined;

        // *** RESTORE THE CLUSTER ***

        await MockTime.resolve(device.stop());
        await device.parts.get("part0b")!.erase();
        device.env.set(Entropy, MockCrypto(0x40));
        await device.add({ type: OnOffLightDevice.with(LiftWc), number: 1, id: "part0c" });

        const added = new Promise(resolve =>
            peer1.env.get(ClientStructureEvents).clusterInstalled(WindowCoveringClient).on(resolve),
        );
        await MockTime.resolve(device.start());
        await MockTime.resolve(added);

        // *** VALIDATE ***

        expect(clientEp1.behaviors.supported["windowCovering"]).to.be.ok;
        expect(clientEp1.stateOf(WindowCoveringClient).currentPositionLiftPercent100ths).equals(0);
        expect(clientEp1.globalsOf(WindowCoveringClient).featureMap.lift).equals(true);
    });

    it("handles shutdown event and reestablishes connection", () => {
        // TODO
    });

    it("disconnect from/disables the node", () => {
        // TODO
        // TODO Also include validation that the session is closed correctly on the device side on session close and
        //  all subscriptions ended and such
    });

    describe("orphaned peer cleanup", () => {
        it("uncommissioned node from incomplete commissioning persists across restart", async () => {
            // *** SETUP ***

            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();
            const { discriminator } = device.state.commissioning;

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            // *** DISCOVER WITHOUT COMMISSIONING ***

            // Discover device but do not commission it - this creates an uncommissioned peer node and
            // persists its discoveredAt to storage
            await MockTime.resolve(
                controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(90) }),
                { macrotasks: true },
            );

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(controller.peers.size).equals(1);
            const peer1 = controller.peers.get("peer1")!;
            expect(peer1).not.undefined;
            expect(peer1.state.commissioning.peerAddress).undefined; // Not commissioned
            expect(peer1.state.commissioning.discoveredAt).not.undefined; // Persisted

            // *** RESTART ***

            await site.close();

            // Recreate the controller with the same storage (same id + index)
            const controllerB = await site.addNode(undefined, { id: "controller1", index: 1 });

            // The uncommissioned node must have survived: its discoveredAt was written to persistent
            // storage during discovery, so it is restored exactly as an uncommissioned peer
            expect(controllerB.peers.size).equals(1);
            const peer1b = controllerB.peers.get("peer1")!;
            expect(peer1b).not.undefined;
            expect(peer1b.state.commissioning.peerAddress).undefined; // Still uncommissioned
            expect(peer1b.state.commissioning.discoveredAt).not.undefined;
        });

        it("culls uncommissioned nodes after TTL expires even when commissioned nodes are present", async () => {
            // *** SETUP ***

            await using site = new MockSite();

            // Commission first pair (peer1 - commissioned, 1 address with no discoveredAt on the
            // address record - this is the condition that triggered the early-return bug)
            const { controller } = await site.addCommissionedPair();

            // Add a second device to discover without commissioning
            const device2 = await site.addDevice({ index: 3 });

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device2.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { discriminator } = device2.state.commissioning;
            const discovered = await MockTime.resolve(
                controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(90) }),
                { macrotasks: true },
            );

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(discovered.length).equals(1);
            const peer2 = discovered[0];
            expect(peer2.state.commissioning.peerAddress).undefined; // Uncommissioned
            expect(controller.peers.size).equals(2); // peer1 (commissioned) + peer2 (uncommissioned)

            // *** WAIT FOR EXPIRATION ***

            // The expiration timer fires every 1 minute and culls uncommissioned nodes whose TTL
            // has expired (default TTL = 15 min from discoveredAt).  Iterate until peer2 is gone.
            // Without the return→continue fix, peer1 (commissioned, 1 address) would cause the
            // expiration loop to exit early and peer2 would never be culled.
            const peer2Destroyed = new Promise<void>(resolve => peer2.lifecycle.destroyed.once(() => resolve()));
            await MockTime.resolve(peer2Destroyed);

            // *** VALIDATE ***

            expect(controller.peers.size).equals(1);
            expect(controller.peers.get("peer1")).not.undefined; // commissioned peer survives
            expect(controller.peers.get(peer2.id)).undefined; // uncommissioned peer was culled
        });

        it("does not cull an uncommissioned node while runCommissioning is in flight", async () => {
            // *** SETUP ***

            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();

            const device2 = await site.addDevice({ index: 3 });
            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device2.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { discriminator } = device2.state.commissioning;
            const discovered = await MockTime.resolve(
                controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(90) }),
                { macrotasks: true },
            );
            controllerCrypto.entropic = deviceCrypto.entropic = false;

            const peer2 = discovered[0];
            expect(peer2.state.commissioning.peerAddress).undefined;
            expect(controller.peers.size).equals(2);

            // *** RUN COMMISSIONING + EXPIRE ***

            // Backdate discoveredAt so the cull sees peer2 as expired immediately.
            await peer2.set({
                commissioning: { discoveredAt: Timestamp(Time.nowMs - Minutes(20)) },
            });

            let resolveInner!: () => void;
            const innerDone = new Promise<void>(resolve => {
                resolveInner = resolve;
            });
            const commissioning = controller.peers.runCommissioning(peer2, () => innerDone);

            // Advance past one expiration interval so the cull timer fires.  With the busy registry
            // in place, peer2 must survive the cull pass.
            await MockTime.advance(Minutes(2));
            await MockTime.yield3();

            expect(controller.peers.get(peer2.id)).not.undefined; // not culled while busy

            // *** RELEASE + VERIFY CULL ***

            resolveInner();
            await commissioning;

            // Now that the busy flag is cleared, the next cull pass must delete peer2.
            const peer2Destroyed = new Promise<void>(resolve => peer2.lifecycle.destroyed.once(() => resolve()));
            await MockTime.resolve(peer2Destroyed);

            expect(controller.peers.get(peer2.id)).undefined;
        });

        it("rejects parallel runCommissioning on the same node", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();

            const device2 = await site.addDevice({ index: 3 });
            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device2.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { discriminator } = device2.state.commissioning;
            const discovered = await MockTime.resolve(
                controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(90) }),
                { macrotasks: true },
            );
            controllerCrypto.entropic = deviceCrypto.entropic = false;

            const peer2 = discovered[0];

            // First attempt holds the busy slot.  Second attempt on the same node must reject before fn runs so the
            // device side isn't hit by two concurrent commissioning flows.
            let resolveInner!: () => void;
            const first = controller.peers.runCommissioning(peer2, () => new Promise<void>(r => (resolveInner = r)));
            let secondRan = false;
            await expect(
                controller.peers.runCommissioning(peer2, () => {
                    secondRan = true;
                }),
            ).rejectedWith(CommissioningError, /already in progress/);
            expect(secondRan).false;

            // Once the first finishes the slot frees and another attempt is permitted.
            resolveInner();
            await first;
            await controller.peers.runCommissioning(peer2, () => Promise.resolve());
        });

        it("skips reuse of nodes whose construction is closed", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();

            const device2 = await site.addDevice({ index: 3 });
            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device2.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { discriminator } = device2.state.commissioning;
            const discovered = await MockTime.resolve(
                controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(90) }),
                { macrotasks: true },
            );
            controllerCrypto.entropic = deviceCrypto.entropic = false;

            const peer2 = discovered[0];
            const descriptor = RemoteDescriptor.fromLongForm(peer2.state.commissioning);

            const factory = controller.env.get(ClientNodeFactory);
            expect(factory.find(descriptor)).equals(peer2); // sanity: alive node is reused

            // Tear the node down.  After close completes the node is fully Destroyed and removed from the Peers
            // container, so factory.find must no longer return it.
            await peer2.delete();
            expect(factory.find(descriptor)).undefined;
        });

        it("prunes expired addresses from commissioned nodes", async () => {
            // *** SETUP ***

            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();

            const peer1 = controller.peers.get("peer1")!;
            expect(peer1).not.undefined;

            const originalAddresses = peer1.state.commissioning.addresses!;
            expect(originalAddresses.length).equals(1);

            // *** ADD STALE ADDRESS ***

            // Add a second address with an expired TTL (discoveredAt 20 min ago, no explicit ttl so
            // DEFAULT_TTL of 15 min is used → already expired).
            const staleAddress = {
                type: "udp" as const,
                ip: "192.168.99.99",
                port: 5678,
                peripheralAddress: undefined,
                ttl: undefined,
                discoveredAt: Timestamp(Time.nowMs - Minutes(20)), // 20 min ago → past DEFAULT_TTL
            };

            await peer1.set({
                commissioning: {
                    addresses: [...originalAddresses, staleAddress],
                },
            });

            expect(peer1.state.commissioning.addresses!.length).equals(2);

            // *** WAIT FOR PRUNING ***

            // Advance time past one expiration interval so the timer fires and prunes the expired
            // address.  Without the { addresses } → { addresses: newAddresses } fix, the old full
            // list would be written back and no pruning would occur.
            await MockTime.advance(Minutes(2));
            // Allow async state update to complete
            await MockTime.yield3();

            // *** VALIDATE ***

            const updatedAddresses = peer1.state.commissioning.addresses!;
            expect(updatedAddresses.length).equals(1);
            const remainingAddress = updatedAddresses[0];
            expect(ServerAddress.isIp(remainingAddress) && remainingAddress.ip).equals(
                ServerAddress.isIp(originalAddresses[0]) && originalAddresses[0].ip,
            );
        });
    });

    describe("peer address allocation", () => {
        it("skips the controller's own node ID", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();

            const fabric = controller.env.get(FabricAuthority).fabrics[0];
            const controllerNodeId = fabric.nodeId;

            // The commissioned device already got a node ID, so nextNodeId has advanced.
            // Reset it to the controller's own node ID to force a collision
            await controller.act(agent => {
                agent.get(ControllerBehavior).state.nextNodeId = controllerNodeId;
            });

            const address = await MockTime.resolve(
                controller.act(agent => agent.get(ControllerBehavior).allocatePeerAddress(fabric.fabricIndex)),
            );

            // Allocation must skip the controller's own node ID and also the commissioned device's
            expect(address.fabricIndex).equals(fabric.fabricIndex);
            expect(address.nodeId).not.equals(controllerNodeId);
            const peerNodeId = controller.peers.get("peer1")!.state.commissioning.peerAddress!.nodeId;
            expect(address.nodeId).not.equals(peerNodeId);
        });

        it("skips a previously allocated node ID", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();

            const fabric = controller.env.get(FabricAuthority).fabrics[0];

            const address1 = await MockTime.resolve(
                controller.act(agent => agent.get(ControllerBehavior).allocatePeerAddress(fabric.fabricIndex)),
            );

            const address2 = await MockTime.resolve(
                controller.act(agent => agent.get(ControllerBehavior).allocatePeerAddress(fabric.fabricIndex)),
            );

            // Successive allocations must produce distinct node IDs
            expect(address1.fabricIndex).equals(fabric.fabricIndex);
            expect(address2.fabricIndex).equals(fabric.fabricIndex);
            expect(address1.nodeId).not.equals(address2.nodeId);
            // And neither should be the controller's own node ID
            expect(address1.nodeId).not.equals(fabric.nodeId);
            expect(address2.nodeId).not.equals(fabric.nodeId);
        });
    });

    describe("peerAddress resilience", () => {
        // Closing a ServerNode transitions ServerNodeStore.construction to "Closing" before the destructor releases
        // child stores.  Pre-fix, peerAddress fell back to the storage layer via this.store, which would assert
        // through to clientStores and throw [destroyed-dependency].  toString() (used in error message construction
        // throughout Behaviors and Endpoint) then re-threw, masking the original cause.
        it("peerAddress survives ServerNode shutdown via cache", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = controller.peers.get("peer1")!;
            expect(peer1).not.undefined;

            const cachedAddress = peer1.peerAddress;
            expect(cachedAddress).not.undefined;

            await MockTime.resolve(controller.close(), { macrotasks: true });

            expect(() => peer1.peerAddress).not.throws();
            expect(peer1.peerAddress).deep.equals(cachedAddress);
            expect(() => peer1.toString()).not.throws();
        });

        // Behaviors.close() leaves the augmented endpoint.state[id] descriptors in place so that paths reusing the
        // Behaviors instance (e.g. factory reset) can re-activate.  Post-close access must therefore not re-enter
        // #backingFor and throw BehaviorInitializationError - the getter checks the construction status and returns
        // undefined once the endpoint is tearing down.
        it("endpoint.state[behaviorId] returns undefined after close", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = controller.peers.get("peer1")!;

            expect(peer1.state.commissioning).not.undefined;

            await MockTime.resolve(controller.close(), { macrotasks: true });

            expect(() => peer1.state.commissioning).not.throws();
            expect(peer1.state.commissioning).to.be.undefined;
        });
    });

    describe("Schrödinger's cluster", () => {
        // A manufacturer-specific cluster the peer serves attribute data for but omits from its descriptor serverList.
        const NEO = 0x125dfc11 as ClusterId;
        const EP1 = EndpointNumber(1);

        // EP1's real serverList from EP1_STATE (identify, groups, onOff, scenesManagement, descriptor) - notably
        // without NEO.
        const EP1_SERVER_LIST = [3, 4, 6, 0x62, 0x1d];

        function attr(clusterId: ClusterId, attributeId: number, value: unknown, version: number): ReadResult.Report {
            return {
                kind: "attr-value",
                path: { endpointId: EP1, clusterId, attributeId: attributeId as AttributeId },
                value,
                version,
                tlv: TlvAny,
            };
        }

        function neoReports(version: number): ReadResult.Report[] {
            return [
                attr(NEO, ClusterRevision.id, 1, version),
                attr(NEO, FeatureMap.id, {}, version),
                attr(
                    NEO,
                    AttributeList.id,
                    [
                        0,
                        GeneratedCommandList.id,
                        AcceptedCommandList.id,
                        AttributeList.id,
                        FeatureMap.id,
                        ClusterRevision.id,
                    ],
                    version,
                ),
                attr(NEO, AcceptedCommandList.id, [], version),
                attr(NEO, GeneratedCommandList.id, [], version),
                attr(NEO, 0, 1234, version),
            ];
        }

        function descriptorServerListReport(version: number): ReadResult.Report[] {
            return [attr(Descriptor.id, Descriptor.attributes.serverList.id, EP1_SERVER_LIST, version)];
        }

        function descriptorServerListWithNeoReport(version: number): ReadResult.Report[] {
            return [attr(Descriptor.id, Descriptor.attributes.serverList.id, [...EP1_SERVER_LIST, NEO], version)];
        }

        // Like neoReports but with attribute 2 present in both the attribute list and the data — same featureMap.
        function neoReportsWithExtraAttr(version: number): ReadResult.Report[] {
            return [
                attr(NEO, ClusterRevision.id, 1, version),
                attr(NEO, FeatureMap.id, {}, version),
                attr(
                    NEO,
                    AttributeList.id,
                    [
                        0,
                        2,
                        GeneratedCommandList.id,
                        AcceptedCommandList.id,
                        AttributeList.id,
                        FeatureMap.id,
                        ClusterRevision.id,
                    ],
                    version,
                ),
                attr(NEO, AcceptedCommandList.id, [], version),
                attr(NEO, GeneratedCommandList.id, [], version),
                attr(NEO, 0, 1234, version),
                attr(NEO, 2, 5678, version),
            ];
        }

        // Like neoReports but with an accepted command (1) added — same featureMap and attribute list.
        function neoReportsWithExtraCommand(version: number): ReadResult.Report[] {
            return [
                attr(NEO, ClusterRevision.id, 1, version),
                attr(NEO, FeatureMap.id, {}, version),
                attr(
                    NEO,
                    AttributeList.id,
                    [
                        0,
                        GeneratedCommandList.id,
                        AcceptedCommandList.id,
                        AttributeList.id,
                        FeatureMap.id,
                        ClusterRevision.id,
                    ],
                    version,
                ),
                attr(NEO, AcceptedCommandList.id, [1], version),
                attr(NEO, GeneratedCommandList.id, [], version),
                attr(NEO, 0, 1234, version),
            ];
        }

        async function* readResult(...chunks: ReadResult.Report[][]): ReadResult {
            for (const chunk of chunks) {
                yield chunk;
            }
        }

        async function drain(updates: AsyncGenerator<unknown>) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _ of updates) {
            }
        }

        it("survives a re-interview where the descriptor precedes the absent cluster's data", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const initializer = peer1.env.get(EndpointInitializer) as ClientEndpointInitializer;
            const structure = initializer.structure;

            const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

            const neoBehaviorId = () => {
                const endpoint = structure.endpointFor(EP1);
                return endpoint === undefined
                    ? undefined
                    : Object.values(endpoint.behaviors.supported).find(
                          type => (type as ClusterBehavior.Type).cluster?.id === NEO,
                      )?.id;
            };

            // *** ESTABLISH SCHRÖDINGER STATE ***

            // First interaction delivers data for NEO while the descriptor omits it.  Because NEO isn't yet an active
            // behavior, it is kept (matches the startup loadCache path).
            await drain(structure.mutate(request, readResult(neoReports(10), descriptorServerListReport(10))));

            expect(neoBehaviorId(), "NEO should be active after the initial interaction").not.undefined;

            // *** RE-INTERVIEW ***

            // Full wildcard read where the descriptor chunk (serverList without NEO) arrives before NEO's attribute
            // data.  NEO must survive because the peer still serves its data.
            await drain(structure.mutate(request, readResult(descriptorServerListReport(11), neoReports(11))));

            expect(neoBehaviorId(), "NEO must survive a re-interview that serves its data").not.undefined;
        });

        it("erases persisted storage when the peer genuinely drops the cluster", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const initializer = peer1.env.get(EndpointInitializer) as ClientEndpointInitializer;
            const structure = initializer.structure;
            const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });
            const buffer = controller.env.get(ClientCacheBuffer);

            const neoStorageKeys = () =>
                Object.keys(site.storageFor("controller1")).filter(key => key.includes(NEO.toString()));

            const neoActive = () => {
                const endpoint = structure.endpointFor(EP1);
                return (
                    endpoint !== undefined &&
                    Object.values(endpoint.behaviors.supported).some(
                        type => (type as ClusterBehavior.Type).cluster?.id === NEO,
                    )
                );
            };

            // *** ESTABLISH AND PERSIST NEO ***

            await drain(structure.mutate(request, readResult(neoReports(10), descriptorServerListReport(10))));
            await MockTime.resolve(buffer.flush());
            expect(neoActive(), "NEO should be active").true;
            expect(neoStorageKeys(), "NEO data should be persisted").not.empty;

            // *** PEER DROPS NEO ***

            // The descriptor still omits NEO and no attribute data is served this interaction, so NEO is genuinely
            // gone and must be removed from both memory and storage.
            await drain(structure.mutate(request, readResult(descriptorServerListReport(11))));
            await MockTime.resolve(buffer.flush());

            expect(neoActive(), "NEO behavior should be dropped").false;
            expect(neoStorageKeys(), "NEO storage should be erased").empty;
        });

        it("re-installs a cluster the peer drops and later serves again", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const initializer = peer1.env.get(EndpointInitializer) as ClientEndpointInitializer;
            const structure = initializer.structure;
            const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

            const neoActive = () => {
                const endpoint = structure.endpointFor(EP1);
                return (
                    endpoint !== undefined &&
                    Object.values(endpoint.behaviors.supported).some(
                        type => (type as ClusterBehavior.Type).cluster?.id === NEO,
                    )
                );
            };

            // NEO present in serverList and serving data.
            await drain(structure.mutate(request, readResult(descriptorServerListWithNeoReport(10), neoReports(10))));
            expect(neoActive(), "NEO should be active initially").true;

            // Peer drops NEO: descriptor omits it and no data is served.
            await drain(structure.mutate(request, readResult(descriptorServerListReport(11))));
            expect(neoActive(), "NEO should be dropped").false;

            // Peer serves NEO again and lists it in the descriptor.  It must come back.
            await drain(structure.mutate(request, readResult(descriptorServerListWithNeoReport(12), neoReports(12))));
            expect(neoActive(), "NEO must be re-installed after the peer serves it again").true;
        });

        it("rebuilds a cluster when the peer changes its attribute list without a feature change", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");
            const structure = (peer1.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
            const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

            const neoType = () => {
                const endpoint = structure.endpointFor(EP1);
                return endpoint === undefined
                    ? undefined
                    : Object.values(endpoint.behaviors.supported).find(
                          type => (type as ClusterBehavior.Type).cluster?.id === NEO,
                      );
            };

            await drain(structure.mutate(request, readResult(descriptorServerListWithNeoReport(10), neoReports(10))));
            const before = neoType();
            expect(before, "NEO should be active initially").not.undefined;

            // Same featureMap, but the attribute list (and data) now include attribute 2.
            await drain(
                structure.mutate(
                    request,
                    readResult(descriptorServerListWithNeoReport(11), neoReportsWithExtraAttr(11)),
                ),
            );
            const after = neoType();
            expect(after, "NEO should remain active").not.undefined;
            expect(after, "behavior must be rebuilt to reflect the new attribute set").not.equals(before);
        });

        it("rebuilds a cluster when the peer changes its accepted command list without a feature change", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");
            const structure = (peer1.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
            const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

            const neoType = () => {
                const endpoint = structure.endpointFor(EP1);
                return endpoint === undefined
                    ? undefined
                    : Object.values(endpoint.behaviors.supported).find(
                          type => (type as ClusterBehavior.Type).cluster?.id === NEO,
                      );
            };

            await drain(structure.mutate(request, readResult(descriptorServerListWithNeoReport(10), neoReports(10))));
            const before = neoType();
            expect(before, "NEO should be active initially").not.undefined;

            // Same featureMap and attribute list, but a new accepted command appears.
            await drain(
                structure.mutate(
                    request,
                    readResult(descriptorServerListWithNeoReport(11), neoReportsWithExtraCommand(11)),
                ),
            );
            const after = neoType();
            expect(after, "NEO should remain active").not.undefined;
            expect(after, "behavior must be rebuilt to reflect the new command set").not.equals(before);
        });
    });
});

const GLOBAL_ATTRS = [0xfff8, 0xfff9, 0xfffb, 0xfffc, 0xfffd];

const PEER1_STATE = {
    parts: {},
    index: {},
    commissioning: {
        longIdleTimeOperatingMode: false,
        peerAddress: { fabricIndex: 1, nodeId: expect.BIGINT },
        addresses: [
            {
                type: "udp",
                ip: "abcd::2",
                port: 0x15a4,
                peripheralAddress: undefined,
                discoveredAt: undefined,
                ttl: undefined,
            },
            // {
            //     type: "udp",
            //     ip: "10.10.10.2",
            //     port: 0x15a4,
            //     peripheralAddress: undefined,
            //     discoveredAt: undefined,
            //     ttl: undefined,
            // },
        ],
        caseAuthenticatedTags: undefined,
        commissionedAt: expect.NUMBER,
        fabricIndexOnPeer: expect.NUMBER,
        discoveredAt: expect.NUMBER,
        onlineAt: undefined,
        offlineAt: undefined,
        ttl: undefined,
        deviceIdentifier: expect.STRING,
        discriminator: 0x202,
        commissioningMode: 1,
        vendorId: 0xfff1,
        productId: 0x8000,
        deviceType: 0x100,
        deviceName: "Matter.js Test Product",
        rotatingIdentifier: undefined,
        pairingHint: 0x21,
        pairingInstructions: undefined,
        sessionParameters: {
            activeInterval: 300,
            activeThreshold: 4000,
            dataModelRevision: Specification.DATA_MODEL_REVISION,
            idleInterval: 500,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            maxPathsPerInvoke: 10,
            maxTcpMessageSize: undefined,
            specificationVersion: Specification.SPECIFICATION_VERSION,
            supportedTransports: {
                tcpClient: false,
                tcpServer: false,
            },
        },
        tcpSupport: 0,
    },
    network: {
        autoSubscribe: true,
        autoStateInitialize: undefined,
        isDisabled: false,
        port: 0x15a4,
        operationalPort: -1,
        defaultSubscription: undefined,
        maxEventNumber: 3n,
        transportPreference: undefined,
    },
    basicInformation: {
        clusterRevision: 6,
        configurationVersion: 1,
        dataModelRevision: Specification.DATA_MODEL_REVISION,
        vendorName: "Matter.js Test Vendor",
        vendorId: 0xfff1,
        productName: "Matter.js Test Product",
        productId: 0x8000,
        nodeLabel: "Matter.js Test Product",
        location: "XX",
        hardwareVersion: 0,
        hardwareVersionString: "0",
        softwareVersion: 0,
        softwareVersionString: "0",
        manufacturingDate: undefined,
        partNumber: undefined,
        productUrl: undefined,
        productLabel: "Matter.js Test Product",
        serialNumber: undefined,
        localConfigDisabled: undefined,
        reachable: undefined,
        uniqueId: expect.STRING,
        capabilityMinima: {
            caseSessionsPerFabric: 3,
            subscriptionsPerFabric: 3,
            simultaneousInvocationsSupported: 20,
            simultaneousWritesSupported: 20,
            readPathsSupported: 20,
            subscribePathsSupported: 20,
        },
        productAppearance: undefined,
        specificationVersion: Specification.SPECIFICATION_VERSION,
        maxPathsPerInvoke: 10,
        featureMap: {},
        attributeList: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0xe, 0x12, 0x13, 0x15, 0x16, 0x18, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
    accessControl: {
        clusterRevision: 3,
        featureMap: { extension: true, managedDevice: false, auxiliary: false },
        acl: [
            {
                privilege: 5,
                authMode: 2,
                subjects: [expect.BIGINT],
                targets: null,
                auxiliaryType: undefined,
                fabricIndex: 1,
            },
        ],
        extension: [],
        auxiliaryAcl: undefined,
        subjectsPerAccessControlEntry: 4,
        targetsPerAccessControlEntry: 4,
        accessControlEntriesPerFabric: 4,
        commissioningArl: undefined,
        arl: undefined,
        attributeList: [0, 1, 2, 3, 4, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
    groupKeyManagement: {
        clusterRevision: 3,
        featureMap: { cacheAndSync: false, groupcast: false },
        groupKeyMap: [],
        groupTable: [],
        maxGroupsPerFabric: 0x16,
        maxGroupKeysPerFabric: 0x14,
        groupcastAdoption: undefined,
        attributeList: [0, 1, 2, 3, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 1, 3, 4],
        generatedCommandList: [2, 5],
    },
    generalCommissioning: {
        clusterRevision: 2,
        featureMap: { termsAndConditions: false, networkRecovery: false },
        breadcrumb: 0,
        basicCommissioningInfo: { failSafeExpiryLengthSeconds: 0x3c, maxCumulativeFailsafeSeconds: 0x384 },
        regulatoryConfig: 2,
        locationCapability: 2,
        supportsConcurrentConnection: true,
        isCommissioningWithoutPower: undefined,
        networkRecoveryReason: undefined,
        recoveryIdentifier: undefined,
        tcAcceptedVersion: undefined,
        tcMinRequiredVersion: undefined,
        tcAcknowledgements: undefined,
        tcAcknowledgementsRequired: undefined,
        tcUpdateDeadline: undefined,
        attributeList: [0, 1, 2, 3, 4, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 2, 4],
        generatedCommandList: [1, 3, 5],
    },
    administratorCommissioning: {
        clusterRevision: 1,
        featureMap: { basic: false },
        windowStatus: 0,
        adminFabricIndex: null,
        adminVendorId: null,
        attributeList: [0, 1, 2, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 2],
        generatedCommandList: [],
    },
    operationalCredentials: {
        clusterRevision: 2,
        nocs: [
            {
                noc: expect.BYTES,
                icac: null,
                fabricIndex: 1,
                vvsc: undefined,
            },
        ],
        fabrics: [
            {
                rootPublicKey: expect.BYTES,
                vendorId: 0xfff1,
                vidVerificationStatement: undefined,
                fabricId: 0x1n,
                nodeId: expect.BIGINT,
                label: "matter.js",
                fabricIndex: 1,
            },
        ],
        supportedFabrics: 0xfe,
        commissionedFabrics: 1,
        trustedRootCertificates: [expect.BYTES],
        currentFabricIndex: 1,
        featureMap: {},
        attributeList: [0, 1, 2, 3, 4, 5, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 2, 4, 6, 7, 9, 10, 0xb, 0xc, 0xd],
        generatedCommandList: [1, 3, 5, 8, 0xe],
    },
    generalDiagnostics: {
        clusterRevision: 3,
        featureMap: { dataModelTest: true },
        networkInterfaces: [
            {
                name: "fake0",
                isOperational: true,
                offPremiseServicesReachableIPv4: null,
                offPremiseServicesReachableIPv6: null,
                hardwareAddress: b$`001122334402`,
                iPv4Addresses: [b$`0a0a0a02`],
                iPv6Addresses: [b$`abcd0000000000000000000000000002`],
                type: 2,
            },
        ],
        rebootCount: 1,
        upTime: expect.NUMBER,
        totalOperationalHours: 0,
        bootReason: undefined,
        activeHardwareFaults: undefined,
        activeRadioFaults: undefined,
        activeNetworkFaults: undefined,
        testEventTriggersEnabled: false,
        doNotUse: undefined,
        deviceLoadStatus: expect.IGNORE,
        attributeList: [0, 1, 2, 3, 8, 10, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 1, 3],
        generatedCommandList: [2, 4],
    },
    descriptor: {
        clusterRevision: 3,
        endpointUniqueId: undefined,
        featureMap: { tagList: false },
        deviceTypeList: [{ deviceType: 0x16, revision: 4 }],
        serverList: [0x1f, 0x28, 0x30, 0x33, 0x3c, 0x3e, 0x3f, 0x1d],
        clientList: [],
        partsList: [1],
        tagList: undefined,
        attributeList: [0, 1, 2, 3, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
};

const EP1_STATE = {
    identify: {
        clusterRevision: 6,
        identifyTime: 0,
        identifyType: 0,
        featureMap: {},
        attributeList: [0, 1, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 0x40],
        generatedCommandList: [],
    },
    groups: {
        clusterRevision: 4,
        featureMap: { groupNames: true },
        nameSupport: { groupNames: true },
        attributeList: [0, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 1, 2, 3, 4, 5],
        generatedCommandList: [0, 1, 2, 3],
    },
    onOff: {
        clusterRevision: 6,
        featureMap: { lighting: true, deadFrontBehavior: false, offOnly: false },
        onOff: false,
        globalSceneControl: false,
        onTime: 0,
        offWaitTime: 0,
        startUpOnOff: null,
        attributeList: [0, 0x4000, 0x4001, 0x4002, 0x4003, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 1, 2, 0x40, 0x41, 0x42],
        generatedCommandList: [],
    },
    descriptor: {
        clusterRevision: 3,
        featureMap: { tagList: false },
        deviceTypeList: [{ deviceType: 0x100, revision: 3 }],
        endpointUniqueId: undefined,
        serverList: [3, 4, 6, 0x62, 0x1d],
        clientList: [],
        partsList: [],
        tagList: undefined,
        attributeList: [0, 1, 2, 3, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
    scenesManagement: {
        acceptedCommandList: [0, 1, 2, 3, 4, 5, 6, 64],
        attributeList: [1, 2, ...GLOBAL_ATTRS],
        clusterRevision: 1,
        fabricSceneInfo: [],
        featureMap: {
            sceneNames: true,
        },
        generatedCommandList: [0, 1, 2, 3, 4, 6, 64],
        sceneTableSize: 128,
        doNotUse: undefined,
        eventList: undefined,
    },
};
