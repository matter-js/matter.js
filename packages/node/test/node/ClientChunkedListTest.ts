/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelClient, ChannelServer } from "#behaviors/channel";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import { Read, ReadResult } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import { Channel } from "@matter/types/clusters/channel";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

const CHANNEL_COUNT = 50;

function generateChannels(count: number): Channel.ChannelInfo[] {
    return Array.from({ length: count }, (_, i) => ({
        majorNumber: i,
        minorNumber: i,
        name: `Channel${i}`,
        identifier: String(i).padStart(14, "0"),
        type: Channel.ChannelType.Satellite,
    }));
}

function verifyChannelList(channelList: readonly Channel.ChannelInfo[] | undefined, count: number) {
    expect(channelList).not.undefined;
    expect(channelList!).length(count);
    for (let i = 0; i < count; i++) {
        expect(channelList![i].majorNumber).equals(i);
        expect(channelList![i].minorNumber).equals(i);
        expect(channelList![i].name).equals(`Channel${i}`);
        expect(channelList![i].identifier).equals(String(i).padStart(14, "0"));
    }
}

describe("ClientChunkedList", () => {
    before(() => {
        MockTime.init();
    });

    it("reassembles chunked list via subscription", async () => {
        const channels = generateChannels(CHANNEL_COUNT);

        const ChannelWithList = ChannelServer.with("ChannelList").set({
            channelList: channels,
        });

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: OnOffLightDevice.with(ChannelWithList),
            },
        });

        const peer1 = await subscribedPeer(controller, "peer1");
        const ep1 = peer1.parts.get("ep1")!;
        expect(ep1).not.undefined;

        const { channelList } = ep1.stateOf(ChannelClient);
        verifyChannelList(channelList, CHANNEL_COUNT);
    });

    it("reassembles chunked list via direct read", async () => {
        const channels = generateChannels(CHANNEL_COUNT);

        const ChannelWithList = ChannelServer.with("ChannelList").set({
            channelList: channels,
        });

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: OnOffLightDevice.with(ChannelWithList),
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Perform a direct remote read of channelList through the full protocol stack
        const readRequest = Read(
            Read.Attribute({
                endpoint: EndpointNumber(1),
                cluster: Channel,
                attributes: "channelList",
            }),
        );

        const reports = new Array<ReadResult.Report>();
        await MockTime.resolve(
            (async () => {
                for await (const chunk of peer1.interaction.read(readRequest)) {
                    for (const report of chunk) {
                        reports.push(report);
                    }
                }
            })(),
        );

        // Find the channelList attribute value in the reports
        const channelListReport = reports.find(
            r => r.kind === "attr-value" && r.path.clusterId === Channel.id && r.path.attributeId === 0,
        );
        expect(channelListReport).not.undefined;
        expect(channelListReport!.kind).equals("attr-value");

        const channelList = (channelListReport as ReadResult.AttributeValue).value as
            | Channel.ChannelInfo[]
            | undefined;
        verifyChannelList(channelList, CHANNEL_COUNT);
    });
});
