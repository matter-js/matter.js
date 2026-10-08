/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChimeClient } from "#behaviors/chime";
import { OccupancySensingClient } from "#behaviors/occupancy-sensing";
import { DimmerSwitchDevice } from "#devices/dimmer-switch";
import { DoorbellDevice } from "#devices/doorbell";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import { MockSite } from "@matter/node/testing";
import { Read, ReadResult } from "@matter/protocol";
import { ClusterId, EndpointNumber } from "@matter/types";
import { Descriptor } from "@matter/types/clusters/descriptor";
import { Identify } from "@matter/types/clusters/identify";

async function readDescriptorAttribute(
    peer: { interaction: { read(req: Read): AsyncIterable<ReadResult.Chunk> } },
    endpoint: EndpointNumber,
    attribute: "clientList" | "serverList",
): Promise<ClusterId[]> {
    const readRequest = Read(
        Read.Attribute({
            endpoint,
            cluster: Descriptor,
            attributes: attribute,
        }),
    );

    const reports = new Array<ReadResult.Report>();
    for await (const chunk of peer.interaction.read(readRequest)) {
        for await (const report of chunk) {
            reports.push(report);
        }
    }

    const hit = reports.find(
        r =>
            r.kind === "attr-value" &&
            r.path.clusterId === Descriptor.id &&
            r.path.attributeId === Descriptor.attributes[attribute].id,
    );
    if (hit === undefined || hit.kind !== "attr-value") {
        return [];
    }
    return hit.value as ClusterId[];
}

describe("Descriptor.clientList over the interaction model", () => {
    before(() => {
        MockTime.init();
    });

    it("OnOffLight.with(OccupancySensingClient): clientList contains OccupancySensingClient id", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: OnOffLightDevice.with(OccupancySensingClient),
            },
        });

        const peer = controller.peers.get("peer1")!;
        expect(peer).not.undefined;

        const clientList = await MockTime.resolve(readDescriptorAttribute(peer, EndpointNumber(1), "clientList"));

        expect(clientList).includes(OccupancySensingClient.cluster.id);
    });

    it("DoorbellDevice: clientList contains ChimeClient id via auto-merged mandatory client cluster", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: DoorbellDevice,
            },
        });

        const peer = controller.peers.get("peer1")!;
        expect(peer).not.undefined;

        const clientList = await MockTime.resolve(readDescriptorAttribute(peer, EndpointNumber(1), "clientList"));

        expect(clientList).includes(ChimeClient.cluster.id);
    });

    it("DimmerSwitchDevice: Identify appears in both serverList and clientList", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: DimmerSwitchDevice,
            },
        });

        const peer = controller.peers.get("peer1")!;
        expect(peer).not.undefined;

        const [serverList, clientList] = await MockTime.resolve(
            Promise.all([
                readDescriptorAttribute(peer, EndpointNumber(1), "serverList"),
                readDescriptorAttribute(peer, EndpointNumber(1), "clientList"),
            ]),
        );

        expect(serverList).includes(Identify.id);
        expect(clientList).includes(Identify.id);
    });
});
