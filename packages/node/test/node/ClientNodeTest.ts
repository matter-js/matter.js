/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { GlobalAttributeState } from "#behavior/cluster/ClusterState.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { DiscoveryError } from "#behavior/system/controller/discovery/DiscoveryError.js";
import { BasicInformationBehavior, BasicInformationServer } from "#behaviors/basic-information";
import { IdentifyClient } from "#behaviors/identify";
import { OnOffClient } from "#behaviors/on-off";
import { WindowCoveringClient, WindowCoveringServer } from "#behaviors/window-covering";
import { OnOffLightDevice } from "#devices/on-off-light";
import { WindowCoveringDevice } from "#devices/window-covering";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { ClientStructureEvents } from "#node/client/ClientStructureEvents.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    b$,
    Bytes,
    Crypto,
    deepCopy,
    Entropy,
    Minutes,
    MockCrypto,
    Observable,
    Seconds,
    Time,
    Timestamp,
} from "@matter/general";
import { Specification } from "@matter/model";
import { ControllerCommissioner, FabricAuthority, FabricManager, PeerSet, Val } from "@matter/protocol";
import { FabricIndex } from "@matter/types";
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
        const udpAddresses = addresses!.filter(a => a.type === "udp");
        expect(udpAddresses.length).equals(1 /*2*/); // Currently we only store "last known good" address
        // Device is index 2, so should have 10.10.10.2 and ...8802
        //expect(udpAddresses.some(a => a.ip === "10.10.10.2")).true;
        expect(udpAddresses.some(a => a.ip === "abcd::2")).true;

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
                    { type: "udp", ip: "abcd::2", port: 5540 },
                    { type: "udp", ip: "abcd::3", port: 5540 },
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
            expect((state as Val.Struct).attr$14).deep.equals(optList); // Attribute 20
        }
    });

    it("correctly replaces behavior", async () => {
        // *** SETUP ***

        const LiftWc = WindowCoveringServer.with("AbsolutePosition", "Lift", "PositionAwareLift").set({
            currentPositionLift: 0,
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
        const lift$Changed = clientEp1.eventsOf(WindowCoveringClient).currentPositionLift$Changed!;
        expect(lift$Changed).not.undefined;
        lift$Changed.on(value => liftChanged.emit(value));

        // *** VALIDATE SETUP ***

        const serverEp1 = device.parts.get("part0")!;
        expect(serverEp1).not.undefined;

        let sawChange = new Promise<number | null>(resolve => liftChanged.once(resolve));
        await serverEp1.setStateOf(WindowCoveringClient, { currentPositionLift: 6 });

        let newValue = await MockTime.resolve(sawChange);
        expect(newValue).equals(6);

        // *** REPLACE CLUSTER ***

        await MockTime.resolve(device.stop());

        await serverEp1.erase();

        const LiftTiltWc = WindowCoveringServer.with(
            "AbsolutePosition",
            "Lift",
            "PositionAwareLift",
            "Tilt",
            "PositionAwareTilt",
        ).set({
            type: WindowCovering.WindowCoveringType.Unknown,
            currentPositionLift: 0,
            currentPositionTilt: 0,
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

        expect((clientEp1.stateOf(WindowCoveringClient) as unknown as GlobalAttributeState).featureMap).deep.equals({
            absolutePosition: true,
            lift: true,
            positionAwareLift: true,
            tilt: true,
            positionAwareTilt: true,
        });

        sawChange = new Promise<number | null>(resolve => liftChanged.once(resolve));
        await serverEp1b.setStateOf(WindowCoveringClient, { currentPositionLift: 12 });

        newValue = await MockTime.resolve(sawChange);
        expect(newValue).equals(12);
    });

    it("correctly removes behavior", async () => {
        // *** SETUP ***

        const LiftWc = WindowCoveringServer.with("AbsolutePosition", "Lift", "PositionAwareLift").set({
            currentPositionLift: 0,
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

        expect(clientEp1.stateOf(WindowCoveringClient).currentPositionLift).equals(0);

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

    it("handles shutdown event and reestablishes connection", () => {
        // TODO
    });

    it("disconnect from/disables the node", () => {
        // TODO
        // TODO Also include validation that the session is closed correctly on the device side on session close and
        //  all subscriptions ended and such
    });

    describe("device attestation during commissioning", () => {
        it("commissions successfully without DclCertificateService (backward compat)", async () => {
            // When no DclCertificateService is set up, attestation validation is skipped entirely.
            // This tests backward compatibility: existing users who have not set up a DCL trust store
            // should still be able to commission devices without any errors.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
                macrotasks: true,
            });

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(device.state.commissioning.commissioned).equals(true);
            expect(controller.peers.size).equals(1);
        });

        it("commissions successfully with onAttestationFailure=true", async () => {
            // When onAttestationFailure is set to true, commissioning should proceed even if
            // attestation validation encounters issues. Without DclCertificateService, validation
            // is skipped entirely, but this test verifies the option flows through without error.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({
                    passcode,
                    discriminator,
                    timeout: Seconds(90),
                    onAttestationFailure: true,
                }),
                { macrotasks: true },
            );

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(device.state.commissioning.commissioned).equals(true);
            expect(controller.peers.size).equals(1);
        });

        it("rejects commissioning with onAttestationFailure=false when no DclCertificateService", async () => {
            // When onAttestationFailure is set to false but no DclCertificateService is available,
            // commissioning should fail because strict attestation was requested but can't be performed.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await expect(
                MockTime.resolve(
                    controller.peers.commission({
                        passcode,
                        discriminator,
                        timeout: Seconds(90),
                        onAttestationFailure: false,
                    }),
                    { macrotasks: true },
                ),
            ).to.be.rejectedWith(/DclCertificateService is not available/);

            controllerCrypto.entropic = deviceCrypto.entropic = false;
        });

        it("rejects commissioning with custom onAttestationFailure callback when no DclCertificateService", async () => {
            // A custom callback requires attestation validation, so without DclCertificateService
            // commissioning should fail.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await expect(
                MockTime.resolve(
                    controller.peers.commission({
                        passcode,
                        discriminator,
                        timeout: Seconds(90),
                        onAttestationFailure: () => true,
                    }),
                    { macrotasks: true },
                ),
            ).to.be.rejectedWith(/DclCertificateService is not available/);

            controllerCrypto.entropic = deviceCrypto.entropic = false;
        });
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
            expect(remainingAddress.type === "udp" && remainingAddress.ip).equals(
                originalAddresses[0].type === "udp" && originalAddresses[0].ip,
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
            dataModelRevision: 19,
            idleInterval: 500,
            interactionModelRevision: 13,
            maxPathsPerInvoke: 10,
            maxTcpMessageSize: undefined,
            specificationVersion: 17039872,
            supportedTransports: {
                tcpClient: false,
                tcpServer: false,
            },
        },
        tcpSupport: 0,
    },
    network: {
        autoSubscribe: true,
        isDisabled: false,
        port: 0x15a4,
        operationalPort: -1,
        defaultSubscription: undefined,
        maxEventNumber: 3n,
    },
    basicInformation: {
        clusterRevision: 5,
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
        capabilityMinima: { caseSessionsPerFabric: 3, subscriptionsPerFabric: 3 },
        productAppearance: undefined,
        specificationVersion: 0x1040200,
        maxPathsPerInvoke: 10,
        featureMap: {},
        attributeList: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0xe, 0x12, 0x13, 0x15, 0x16, 0x18, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
    accessControl: {
        clusterRevision: 2,
        featureMap: { extension: true, managedDevice: false },
        acl: [{ privilege: 5, authMode: 2, subjects: [expect.BIGINT], targets: null, fabricIndex: 1 }],
        extension: [],
        subjectsPerAccessControlEntry: 4,
        targetsPerAccessControlEntry: 3,
        accessControlEntriesPerFabric: 4,
        commissioningArl: undefined,
        arl: undefined,
        attributeList: [0, 1, 2, 3, 4, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
    groupKeyManagement: {
        clusterRevision: 2,
        featureMap: { cacheAndSync: false },
        groupKeyMap: [],
        groupTable: [],
        maxGroupsPerFabric: 0x15,
        maxGroupKeysPerFabric: 0x14,
        attributeList: [0, 1, 2, 3, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 1, 3, 4],
        generatedCommandList: [2, 5],
    },
    generalCommissioning: {
        clusterRevision: 2,
        featureMap: { termsAndConditions: false },
        breadcrumb: 0,
        basicCommissioningInfo: { failSafeExpiryLengthSeconds: 0x3c, maxCumulativeFailsafeSeconds: 0x384 },
        regulatoryConfig: 2,
        locationCapability: 2,
        supportsConcurrentConnection: true,
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
        clusterRevision: 2,
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
        attributeList: [0, 1, 2, 3, 8, ...GLOBAL_ATTRS],
        eventList: undefined,
        acceptedCommandList: [0, 1, 3],
        generatedCommandList: [2, 4],
    },
    descriptor: {
        clusterRevision: 3,
        endpointUniqueId: undefined,
        featureMap: { tagList: false },
        deviceTypeList: [{ deviceType: 0x16, revision: 3 }],
        serverList: [0x28, 0x1f, 0x3f, 0x30, 0x3c, 0x3e, 0x33, 0x1d],
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
        serverList: [3, 4, 0x62, 6, 0x1d],
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
