/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryError } from "#behavior/system/controller/discovery/DiscoveryError.js";
import { IdentifyClient } from "#behaviors/identify";
import { OnOffClient } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { b$, deepCopy } from "#general";
import { MockSite } from "./mock-site.js";

describe("ClientNode", () => {
    before(() => {
        MockTime.init();

        // Required for crypto to succeed
        MockTime.macrotasks = true;
    });

    it("times out commissioning discovery", async () => {
        await using site = new MockSite();
        const controller = await site.addNode(undefined, { online: false, device: undefined });
        await MockTime.resolve(
            expect(
                controller.nodes.commission({ passcode: 12341234, discriminator: 1234, timeoutSeconds: 90 }),
            ).rejectedWith(DiscoveryError),
        );
    });

    it("times out continuous discovery", async () => {
        await using site = new MockSite();

        const controller = await site.addNode(undefined, { online: false, device: undefined });
        const discovered = await MockTime.resolve(
            controller.nodes.discover({ longDiscriminator: 1234, timeoutSeconds: 90 }),
        );

        expect(discovered.length).equals(0);
    });

    it("discovers", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        const { discriminator } = device.state.commissioning;
        const discovered = await MockTime.resolve(
            controller.nodes.discover({ longDiscriminator: discriminator, timeoutSeconds: 90 }),
            { macrotasks: true },
        );

        expect(discovered.length).equals(1);
        expect(discovered[0].state.commissioning.discriminator === device.state.commissioning.discriminator);
    });

    it("commissions and initializes endpoints", async () => {
        // *** COMMISSIONING ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        expect(device.state.commissioning.commissioned).equals(true);
        expect(controller.nodes.size).equals(1);

        // *** INITIAL STATE ***

        // Obtain client view of the device
        const peer1 = controller.nodes.get("peer1")!;
        expect(peer1).not.undefined;

        // Validate the root endpoint
        expect(peer1.state).deep.equals(PEER1_STATE);
        const expectedPeer1State = deepCopy(peer1.state);

        // Validate the light endpoint
        expect(peer1.parts.size).equals(1);
        const ep1 = peer1.parts.get("ep1")!;
        expect(ep1).not.undefined;
        expect(ep1.state).deep.equals(EP1_STATE);
        const expectedEp1State = deepCopy(ep1.state);

        // *** STATE AFTER RESTART ***

        // Close all nodes
        await site.close();

        // Recreate the controller
        const controllerB = await site.addNode(undefined, { index: 1 });

        // Retrieve the client view of the device that should have been recreated from cache
        const peer1b = controllerB.nodes.get("peer1")!;
        expect(peer1b).not.undefined;

        // Client nodes should fully initialize on initial load.  We could initialize asynchronously during ServerNode
        // initialization but currently we don't
        expect(peer1b.construction.status).equals("active");

        // Validate the root endpoint
        expect(peer1b.state).deep.equals(expectedPeer1State);

        // Validate the light endpoint
        expect(peer1b.parts.size).equals(1);
        const ep1b = peer1b.parts.get("ep1")!;
        expect(ep1b).not.undefined;
        expect(ep1b.construction.status).equals("active");
        expect(ep1b.state).deep.equals(expectedEp1State);
    }).timeout(1e9);

    it("invokes and receives state updates", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.nodes.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.parts.get("ep1")!;
        expect(ep1).not.undefined;

        const receivedUpdate = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));

        // *** INVOCATION ***

        await ep1.commandsOf(OnOffClient).toggle();

        // *** UPDATE ***

        await MockTime.resolve(receivedUpdate);
    });

    it("decommissions", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        expect(controller.nodes.size).equals(1);
        expect(device.lifecycle.isCommissioned).is.true;

        // *** DECOMMISSION ***

        await Promise.resolve(controller.nodes.get("peer1")!.delete());

        expect(controller.nodes.size).equals(0);
        expect(device.lifecycle.isCommissioned).is.false;
    });

    it("writes attributes on commit", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        // *** WRITE ***

        const peer1 = controller.nodes.get("peer1")!;
        const ep1Client = peer1.parts.get("ep1")!;
        await ep1Client.act(agent => {
            agent.get(OnOffClient).state.onTime = 20;
            agent.get(IdentifyClient).state.identifyTime = 5;
        });

        // *** VALIDATE ***

        const ep1Server = device.parts.get(1) as Endpoint<OnOffLightDevice>;
        expect(ep1Server.state.onOff.onTime).equals(20);
        expect(ep1Server.state.identify.identifyTime).equals(5);
    }).timeout(1e9);

    it("reconnects and updates connection status", () => {
        // TODO
    });

    it("emits events", () => {
        // TODO
    });
});

const PEER1_STATE = {
    parts: {},
    index: {},
    commissioning: {
        longIdleTimeOperatingMode: false,
        peerAddress: { fabricIndex: 1, nodeId: expect.BIGINT },
        addresses: [
            { type: "udp", ip: "10.10.10.2", port: 0x15a4, peripheralAddress: undefined },
            { type: "udp", ip: "10.10.10.2", port: 0x15a4, peripheralAddress: undefined },
        ],
        discoveredAt: expect.NUMBER,
        onlineAt: undefined,
        offlineAt: undefined,
        ttl: undefined,
        deviceIdentifier: expect.STRING,
        discriminator: 0x202,
        commissioningMode: 1,
        vendorId: 0xfff1,
        productId: undefined,
        deviceType: 0x100,
        deviceName: "Matter.js Test Product",
        rotatingIdentifier: undefined,
        pairingHint: 0x21,
        pairingInstructions: undefined,
        sessionParameters: { idleIntervalMs: 0x1f4, activeIntervalMs: 0x12c, activeThresholdMs: 0xfa0 },
        tcpSupport: 0,
        longIdleOperatingMode: undefined,
    },
    network: { port: 0x15a4, operationalPort: -1, startupSubscription: undefined },
    basicInformation: {
        clusterRevision: 4,
        dataModelRevision: 0x12,
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
        specificationVersion: 0x1040100,
        maxPathsPerInvoke: 10,
        featureMap: {},
        attributeList: [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0xe, 0x12, 0x13, 0x15, 0x16, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8,
        ],
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
        attributeList: [0, 2, 3, 4, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8, 1],
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
        attributeList: [0, 1, 2, 3, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
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
        attributeList: [0, 1, 2, 3, 4, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
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
        attributeList: [0, 1, 2, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        eventList: undefined,
        acceptedCommandList: [0, 2],
        generatedCommandList: [],
    },
    operationalCredentials: {
        clusterRevision: 1,
        nocs: [
            {
                noc: expect.BYTES,
                icac: null,
                fabricIndex: 1,
            },
        ],
        fabrics: [
            {
                rootPublicKey: expect.BYTES,
                vendorId: 0xfff1,
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
        attributeList: [0, 1, 2, 3, 4, 5, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        eventList: undefined,
        acceptedCommandList: [0, 2, 4, 6, 7, 9, 10, 0xb],
        generatedCommandList: [1, 3, 5, 8],
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
                iPv6Addresses: [b$`57000000`],
                type: 2,
            },
        ],
        rebootCount: 0,
        upTime: expect.NUMBER,
        totalOperationalHours: 0,
        bootReason: undefined,
        activeHardwareFaults: undefined,
        activeRadioFaults: undefined,
        activeNetworkFaults: undefined,
        testEventTriggersEnabled: false,
        doNotUse: undefined,
        attributeList: [0, 1, 2, 3, 8, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        eventList: undefined,
        acceptedCommandList: [0, 1, 3],
        generatedCommandList: [2, 4],
    },
    descriptor: {
        clusterRevision: 2,
        featureMap: { tagList: false },
        deviceTypeList: [{ deviceType: 0x16, revision: 3 }],
        serverList: [0x28, 0x1f, 0x3f, 0x30, 0x3c, 0x3e, 0x33, 0x1d],
        clientList: [],
        partsList: [1],
        tagList: undefined,
        attributeList: [0, 1, 2, 3, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
};

const EP1_STATE = {
    identify: {
        clusterRevision: 5,
        identifyTime: 0,
        identifyType: 0,
        featureMap: {},
        attributeList: [0, 1, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        eventList: undefined,
        acceptedCommandList: [0, 0x40],
        generatedCommandList: [],
    },
    groups: {
        clusterRevision: 4,
        featureMap: { groupNames: true },
        nameSupport: { nameSupport: true, groupNames: true },
        attributeList: [0, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        eventList: undefined,
        acceptedCommandList: [0, 1, 2, 3, 4, 5],
        generatedCommandList: [0, 1, 2, 3],
    },
    onOff: {
        clusterRevision: 6,
        featureMap: { lighting: true, deadFrontBehavior: false, offOnly: false },
        onOff: false,
        globalSceneControl: true,
        onTime: 0,
        offWaitTime: 0,
        startUpOnOff: null,
        attributeList: [0, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8, 0x4000, 0x4001, 0x4002, 0x4003],
        eventList: undefined,
        acceptedCommandList: [0, 0x40, 0x41, 0x42, 1, 2],
        generatedCommandList: [],
    },
    descriptor: {
        clusterRevision: 2,
        featureMap: { tagList: false },
        deviceTypeList: [{ deviceType: 0x100, revision: 3 }],
        serverList: [3, 4, 6, 0x1d],
        clientList: [],
        partsList: [],
        tagList: undefined,
        attributeList: [0, 1, 2, 3, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
};
