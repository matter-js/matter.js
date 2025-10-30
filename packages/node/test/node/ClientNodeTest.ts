/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryError } from "#behavior/system/controller/discovery/DiscoveryError.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { BasicInformationBehavior } from "#behaviors/basic-information";
import { IdentifyClient } from "#behaviors/identify";
import { OnOffClient } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { b$, Crypto, deepCopy, MockCrypto, Seconds, Time, TimeoutError } from "#general";
import { Specification } from "#model";
import { SustainedSubscription } from "#protocol";
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

        // Obtain client view of the device
        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Validate the root endpoint
        expect(Object.keys(peer1.state)).deep.equals(Object.keys(PEER1_STATE));
        for (const key in peer1.state) {
            const actual = (peer1.state as Record<string, unknown>)[key];
            const expected = (PEER1_STATE as Record<string, unknown>)[key];
            expect(actual).deep.equals(expected);
        }
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
        const peer1b = controllerB.peers.get("peer1")!;
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
    });

    it("invokes, receives state updates and emits changed events", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
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

        expect(controller.peers.size).equals(1);
        expect(device.lifecycle.isCommissioned).is.true;

        // *** DECOMMISSION ***

        await Promise.resolve(controller.peers.get("peer1")!.delete());

        expect(controller.peers.size).equals(0);
        expect(device.lifecycle.isCommissioned).is.false;
    });

    it("writes attributes on commit", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        // *** WRITE ***

        const peer1 = controller.peers.get("peer1")!;
        const ep1Client = peer1.parts.get("ep1")!;
        await ep1Client.act(agent => {
            agent.get(OnOffClient).state.onTime = 20;
            agent.get(IdentifyClient).state.identifyTime = 5;
        });

        // *** VALIDATE ***

        const ep1Server = device.parts.get(1) as Endpoint<OnOffLightDevice>;
        expect(ep1Server.state.onOff.onTime).equals(20);
        expect(ep1Server.state.identify.identifyTime).equals(5);
    });

    it("throws error if node cannot be reached", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;
        await MockTime.resolve(device.close());

        // *** INVOCATION ***

        await expect(MockTime.resolve(ep1.commandsOf(OnOffClient).toggle())).rejectedWith(TimeoutError);
    });

    it("reconnects and updates connection status", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;
        await MockTime.resolve(device.cancel());

        // *** INVOKE ***

        const toggle = MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());

        // Delay
        await MockTime.resolve(Time.sleep("waiting to start device", Seconds(5)));

        // Bring device online
        await MockTime.resolve(device.start());

        // Toggle should now complete
        await MockTime.resolve(toggle);
    });

    it("resubscribes on timeout", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;

        // *** INITIAL SUBSCRIPTION ***

        const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription!;
        expect(subscription).not.undefined;
        const initialSubscriptionId = subscription.subscriptionId;
        expect(initialSubscriptionId).not.equals(SustainedSubscription.NO_SUBSCRIPTION);

        SustainedSubscription.assert(subscription);
        expect(subscription.active.value).equals(true);

        // *** SUBSCRIPTION TIMEOUT ***

        // Close peer
        await MockTime.resolve(device.cancel());

        // Wait for subscription to timeout
        await MockTime.resolve(subscription.inactive);

        // Ensure subscription ID is gone
        expect(subscription.subscriptionId).equals(SustainedSubscription.NO_SUBSCRIPTION);

        // *** NEW SUBSCRIPTION ***

        // Need entropy for this bit so we can verify we have a new subscription ID
        const crypto = device.env.get(Crypto) as MockCrypto;
        crypto.entropic = true;

        // Bring peer back online
        await MockTime.resolve(device.start());

        // Wait for subscription to stablish
        await MockTime.resolve(subscription.active);
        crypto.entropic = false;

        expect(subscription.subscriptionId).not.equals(SustainedSubscription.NO_SUBSCRIPTION);
        expect(subscription.subscriptionId).not.equals(initialSubscriptionId);

        // *** CONFIRM SUBSCRIPTION FUNCTIONS ***

        expect(ep1.stateOf(OnOffClient).onOff).false;
        const toggled = new Promise(resolve => {
            ep1.eventsOf(OnOffClient).onOff$Changed.once(resolve);
        });

        await ep1.commandsOf(OnOffClient).toggle();

        await MockTime.resolve(toggled);

        expect(ep1.stateOf(OnOffClient).onOff).true;
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

    it("handles shutdown event and reestablishes connection", () => {
        // TODO
    });

    it("removes node after leave event", () => {
        // TODO
    });

    it("disconnect from/disables the node", () => {
        // TODO
        // TODO Also include validation that the session is closed correctly on the device side on session close and
        //  all subscriptions ended and such
    });
});

const PEER1_STATE = {
    parts: {},
    index: {},
    commissioning: {
        longIdleTimeOperatingMode: false,
        peerAddress: { fabricIndex: 1, nodeId: expect.BIGINT },
        addresses: [
            {
                type: "udp",
                ip: "1111:2222:3333:4444:5555:6666:7777:8802",
                port: 0x15a4,
                peripheralAddress: undefined,
                discoveredAt: undefined,
                ttl: undefined,
            },
            {
                type: "udp",
                ip: "10.10.10.2",
                port: 0x15a4,
                peripheralAddress: undefined,
                discoveredAt: undefined,
                ttl: undefined,
            },
        ],
        discoveredAt: expect.NUMBER,
        onlineAt: undefined,
        offlineAt: undefined,
        ttl: undefined,
        deviceIdentifier: "0202020202020202",
        discriminator: 0x202,
        commissioningMode: 1,
        vendorId: 0xfff1,
        productId: undefined,
        deviceType: 0x100,
        deviceName: "Matter.js Test Product",
        rotatingIdentifier: undefined,
        pairingHint: 0x21,
        pairingInstructions: undefined,
        sessionIntervals: { idleInterval: 500, activeInterval: 300, activeThreshold: 4000 },
        tcpSupport: 0,
    },
    network: {
        autoSubscribe: true,
        isDisabled: false,
        port: 0x15a4,
        operationalPort: -1,
        defaultSubscription: undefined,
        caseAuthenticatedTags: undefined,
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
        attributeList: [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0xe, 0x12, 0x13, 0x15, 0x16, 0x18, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8,
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
        rebootCount: 1,
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
        clusterRevision: 3,
        endpointUniqueId: undefined,
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
        clusterRevision: 6,
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
        nameSupport: { groupNames: true },
        attributeList: [0, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
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
        attributeList: [0, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8, 0x4000, 0x4001, 0x4002, 0x4003],
        eventList: undefined,
        acceptedCommandList: [0, 0x40, 0x41, 0x42, 1, 2],
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
        attributeList: [0, 1, 2, 3, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        eventList: undefined,
        acceptedCommandList: [],
        generatedCommandList: [],
    },
    scenesManagement: {
        acceptedCommandList: [],
        attributeList: [1, 2, 0xfffd, 0xfffc, 0xfffb, 0xfff9, 0xfff8],
        clusterRevision: 1,
        fabricSceneInfo: [],
        featureMap: {
            sceneNames: false,
        },
        generatedCommandList: [],
        sceneTableSize: 0,
        doNotUse: undefined,
        eventList: undefined,
    },
};
