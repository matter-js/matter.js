/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { DescriptorClient } from "#behaviors/descriptor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { ClientStructureEvents } from "#node/client/ClientStructureEvents.js";
import { ClientNode } from "#node/ClientNode.js";
import { ClientNodeLifecycle } from "#node/ClientNodeLifecycle.js";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { ServerNode } from "#node/ServerNode.js";
import { Diagnostic, LogDestination, Logger, LogLevel } from "@matter/general";
import { AcceptedCommandList, AttributeList, ClusterRevision, FeatureMap, GeneratedCommandList } from "@matter/model";
import { clientStructureOf, MockSite } from "@matter/node/testing";
import { Read, ReadResult } from "@matter/protocol";
import { AttributeId, DeviceTypeId, EndpointNumber, TlvAny } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { Descriptor } from "@matter/types/clusters/descriptor";

const ROOT_NODE = ServerNode.RootEndpoint.deviceType;
const OTA_PROVIDER = DeviceTypeId(0x0014);

const ROOT_ONLY_WARNING = "has no endpoint besides its root";

function descriptorReports(
    endpointId: number,
    deviceTypes: number[] | undefined,
    partsList: number[] | undefined,
    version: number,
    options?: { keepBasicInformation?: boolean },
) {
    const attr = (attributeId: number, value: unknown): ReadResult.Report => ({
        kind: "attr-value",
        path: {
            endpointId: EndpointNumber(endpointId),
            clusterId: Descriptor.id,
            attributeId: AttributeId(attributeId),
        },
        value,
        version,
        tlv: TlvAny,
    });

    // The root keeps the BasicInformation the tests install, which a server list without it would delete
    const serverList =
        endpointId === 0 && (options?.keepBasicInformation ?? true)
            ? [Descriptor.id, BasicInformation.id]
            : [Descriptor.id];

    const deviceTypeList =
        deviceTypes === undefined
            ? []
            : [
                  attr(
                      Descriptor.attributes.deviceTypeList.id,
                      deviceTypes.map(deviceType => ({ deviceType, revision: 1 })),
                  ),
              ];

    return [
        attr(ClusterRevision.id, 3),
        attr(FeatureMap.id, {}),
        attr(AttributeList.id, [
            ...(deviceTypes === undefined ? [] : [0]),
            1,
            2,
            3,
            GeneratedCommandList.id,
            AcceptedCommandList.id,
            AttributeList.id,
            FeatureMap.id,
            ClusterRevision.id,
        ]),
        attr(AcceptedCommandList.id, []),
        attr(GeneratedCommandList.id, []),
        ...deviceTypeList,
        attr(Descriptor.attributes.serverList.id, serverList),
        attr(Descriptor.attributes.clientList.id, []),
        ...(partsList === undefined ? [] : [attr(Descriptor.attributes.partsList.id, partsList)]),
    ];
}

async function* readResult(...chunks: ReadResult.Report[][]): ReadResult {
    for (const chunk of chunks) {
        yield chunk;
    }
}

/**
 * Applies a read of the given reports to the peer's structure as one interaction.
 */
async function applyRead(peer: ClientNode, ...chunks: ReadResult.Report[][]) {
    const structure = clientStructureOf(peer);
    const request = Read({ attributes: [{}], fabricFilter: structure.cacheFabricFiltered });
    for await (const _chunk of structure.mutate(request, readResult(...chunks)));
}

/**
 * A recreated peer of a commissioned pair, which has no structure read yet, with BasicInformation installed unless
 * asked otherwise.
 */
async function unreadPeer(site: MockSite, options?: { basicInformation?: boolean }) {
    const { controller } = await site.addCommissionedPair();

    const peerAddress = controller.peers.get("peer1")!.peerAddress!;
    await MockTime.resolve(controller.peers.get("peer1")!.delete());

    const peer = await controller.peers.forAddress(peerAddress);
    expect(peer.endpoints.size).equals(1);

    let seededCount = 0;
    peer.lifecycle.seeded.on(() => {
        seededCount++;
    });

    if (options?.basicInformation ?? true) {
        peer.behaviors.require(BasicInformationClient);
        controller.env.get(ClientStructureEvents).emitCluster(peer, BasicInformationClient);
    }

    return { peer, controller, seededCount: () => seededCount };
}

function captureRootOnlyWarnings() {
    const warnings = new Array<string>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            const text = message.values.map(String).join(" ");
            if (message.level === LogLevel.WARN && text.includes(ROOT_ONLY_WARNING)) {
                warnings.push(text);
            }
        },
    });
    return warnings;
}

describe("NodeLifecycle#isSeeded/seeded", () => {
    before(() => {
        MockTime.init();
    });

    afterEach(() => {
        delete Logger.destinations.capture;
    });

    // Characterization: holds without the root-only change too
    it("does not seed before the structure is read", async () => {
        await using site = new MockSite();
        const { peer, seededCount } = await unreadPeer(site);

        expect(peer.maybeStateOf(BasicInformationClient)).not.undefined;
        expect(peer.lifecycle.isSeeded).false;

        // A read without the root's Descriptor says nothing about which endpoints the node has
        await applyRead(peer, descriptorReports(1, [OnOffLightDevice.deviceType], [], 10));

        expect(peer.lifecycle.isSeeded).false;
        expect(seededCount()).equals(0);
    });

    it("seeds a root-only node once commissioning has read it and logs the warning once", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: undefined,

                // Without endpoints the node has no device type to advertise for commissioning
                productDescription: { deviceType: OTA_PROVIDER },
            },
        });
        const peer = controller.peers.get("peer1")!;

        expect(peer.endpoints.size).equals(1);
        expect(peer.lifecycle.isSeeded).true;
        expect(warnings.length).equals(1);
        expect(warnings[0]).contains(peer.toString());

        await MockTime.resolve(peer.disable());
        await MockTime.resolve(peer.enable());
        await applyRead(peer, descriptorReports(0, [ROOT_NODE], [], 1000));
        expect(peer.lifecycle.isSeeded).true;
        expect(warnings.length).equals(1);
    });

    it("seeds a root-only node whose PartsList arrives in a later read than BasicInformation", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { peer, seededCount } = await unreadPeer(site);

        await applyRead(peer, descriptorReports(0, [ROOT_NODE], [], 10));

        expect(peer.lifecycle.isSeeded).true;
        expect(seededCount()).equals(1);
        expect(warnings.length).equals(1);
    });

    it("seeds a root-only node with a node-scoped device type without the warning", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { peer } = await unreadPeer(site);

        await applyRead(peer, descriptorReports(0, [ROOT_NODE, OTA_PROVIDER], [], 10));

        expect(peer.lifecycle.isSeeded).true;
        expect(warnings).deep.equals([]);
    });

    it("seeds a node with application endpoints without the warning", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { controller } = await site.addCommissionedPair();
        const peer = controller.peers.get("peer1")!;

        expect(peer.endpoints.size).greaterThan(1);
        expect(peer.lifecycle.isSeeded).true;
        expect(warnings).deep.equals([]);
    });

    it("does not seed while the root PartsList names endpoints that are not installed yet", async () => {
        await using site = new MockSite();
        const { peer, seededCount } = await unreadPeer(site);

        // Seeded observers run after the completing read has announced its endpoints and clusters
        const announced = new Set<Endpoint>();
        peer.env
            .get(ClientStructureEvents)
            .clusterInstalled(DescriptorClient)
            .on(endpoint => {
                announced.add(endpoint);
            });
        let announcedOnSeed: boolean | undefined;
        peer.lifecycle.seeded.on(() => {
            announcedOnSeed = announced.has(peer.endpoints.for(1));
        });

        // A read that ends after the root's Descriptor
        await applyRead(peer, descriptorReports(0, [ROOT_NODE], [1], 10));

        expect(peer.endpoints.size).equals(1);
        expect(peer.lifecycle.isSeeded).false;
        expect(seededCount()).equals(0);

        await applyRead(peer, descriptorReports(1, [OnOffLightDevice.deviceType], [], 11));

        expect(peer.endpoints.has(1)).true;
        expect(peer.lifecycle.isSeeded).true;
        expect(seededCount()).equals(1);
        expect(announcedOnSeed).true;
    });

    it("seeds once the root PartsList stops naming an endpoint that never arrived", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { peer, seededCount } = await unreadPeer(site);

        await applyRead(peer, descriptorReports(0, [ROOT_NODE], [1], 10));
        expect(peer.lifecycle.isSeeded).false;

        await applyRead(peer, descriptorReports(0, [ROOT_NODE], [], 11));

        expect(peer.lifecycle.isSeeded).true;
        expect(seededCount()).equals(1);
        expect(warnings.length).equals(1);
    });

    it("seeds a peer restored from storage while it is offline", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        expect(controller.peers.get("peer1")!.lifecycle.isSeeded).true;

        await site.close();

        const restarted = await site.addController({
            id: controller.id,
            index: 1,
            network: { autoStartCommissionedPeers: false },
        });
        await MockTime.resolve(restarted.start());

        const peer = restarted.peers.get("peer1")!;
        expect(peer.endpoints.size).greaterThan(1);
        expect(peer.lifecycle.isSeeded).true;
    });

    it("does not seed a node without BasicInformation", async () => {
        await using site = new MockSite();
        const { peer, seededCount } = await unreadPeer(site, { basicInformation: false });

        await applyRead(peer, descriptorReports(0, [ROOT_NODE], [], 10, { keepBasicInformation: false }));

        expect(peer.maybeStateOf(BasicInformationClient)).undefined;
        expect(peer.lifecycle.isSeeded).false;
        expect(seededCount()).equals(0);
    });

    it("warns about a root-only node with an empty DeviceTypeList", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { peer } = await unreadPeer(site);

        await applyRead(peer, descriptorReports(0, [], [], 10));

        expect(peer.lifecycle.isSeeded).true;
        expect(warnings.length).equals(1);
    });

    it("does not warn about a root-only node that did not report its DeviceTypeList", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { peer } = await unreadPeer(site);

        await applyRead(peer, descriptorReports(0, undefined, [], 10));

        // The mandatory list reads as empty although the peer never reported it
        expect(peer.maybeStateOf(DescriptorClient)?.deviceTypeList).deep.equals([]);
        expect(peer.lifecycle.isSeeded).true;
        expect(warnings).deep.equals([]);
    });

    it("does not seed on a root Descriptor that did not report its PartsList", async () => {
        await using site = new MockSite();
        const { peer, seededCount } = await unreadPeer(site);

        await applyRead(peer, descriptorReports(0, [ROOT_NODE], undefined, 10));

        // The mandatory list reads as empty although the peer never reported it
        expect(peer.maybeStateOf(DescriptorClient)?.partsList).deep.equals([]);
        expect(peer.lifecycle.isSeeded).false;

        await applyRead(peer, descriptorReports(0, [ROOT_NODE], [], 11));

        expect(peer.lifecycle.isSeeded).true;
        expect(seededCount()).equals(1);
    });

    it("seeds a node built by hand once an endpoint beyond the root is added", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { peer, seededCount } = await unreadPeer(site);

        peer.endpoints.require(1);

        expect(peer.lifecycle.isSeeded).true;
        expect(seededCount()).equals(1);

        peer.endpoints.require(2);
        expect(seededCount()).equals(1);
        expect(warnings).deep.equals([]);
    });

    it("seeds a node built by hand on BasicInformation install when endpoints are already present", async () => {
        await using site = new MockSite();
        const { peer, controller, seededCount } = await unreadPeer(site, { basicInformation: false });

        peer.endpoints.require(1);
        expect(peer.lifecycle.isSeeded).false;

        peer.behaviors.require(BasicInformationClient);
        controller.env.get(ClientStructureEvents).emitCluster(peer, BasicInformationClient);

        expect(peer.lifecycle.isSeeded).true;
        expect(seededCount()).equals(1);
    });

    it("seeds a root-only peer restored from storage while it is offline", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: undefined,
                productDescription: { deviceType: OTA_PROVIDER },
            },
        });
        expect(controller.peers.get("peer1")!.lifecycle.isSeeded).true;

        await site.close();

        const restarted = await site.addController({
            id: controller.id,
            index: 1,
            network: { autoStartCommissionedPeers: false },
        });
        await MockTime.resolve(restarted.start());

        const peer = restarted.peers.get("peer1")!;
        expect(peer.endpoints.size).equals(1);
        expect(peer.lifecycle.isSeeded).true;
    });

    it("does not wait for a PartsList entry that is no endpoint number", async () => {
        await using site = new MockSite();
        const warnings = captureRootOnlyWarnings();
        const { peer } = await unreadPeer(site);

        await applyRead(peer, descriptorReports(0, [ROOT_NODE], [0xffff], 10));

        expect(peer.lifecycle.isSeeded).true;
        expect(warnings.length).equals(1);
    });
});

describe("client/server lifecycle split", () => {
    before(() => {
        MockTime.init();
    });

    it("uses ClientNodeLifecycle for a client node and plain NodeLifecycle for a server node", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer = controller.peers.get("peer1")!;

        expect(peer.lifecycle).instanceof(ClientNodeLifecycle);
        expect(controller.lifecycle).instanceof(NodeLifecycle);
        expect(controller.lifecycle instanceof ClientNodeLifecycle).false;
    });
});
