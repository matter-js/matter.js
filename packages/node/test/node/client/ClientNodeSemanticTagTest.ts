/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import type { Semtag } from "@matter/types";
import { MockServerNode } from "../mock-server-node.js";
import { MockSite } from "../mock-site.js";
import { subscribedPeer } from "../node-helpers.js";

const TaggedDescriptorServer = DescriptorServer.with("TagList");
const TaggedDevice = MockServerNode.RootEndpoint.with(TaggedDescriptorServer);

const InitialTag = { mfgCode: null, namespaceId: 7, tag: 1, label: "initial" };
const UnlabeledTag = { mfgCode: null, namespaceId: 8, tag: 2 };

/**
 * SemanticTagStruct's Label is optional and nullable with a fallback of null, so a tag a device writes without one
 * must reach a peer as an absent field rather than as null; applying the fallback is the reader's to do.
 */
describe("ClientNode semantic tags", () => {
    before(() => MockTime.init());

    it("reports a tag written without a label as carrying no label", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: { type: TaggedDevice, descriptor: { tagList: [InitialTag] } },
        });
        const peer = await subscribedPeer(controller, "peer1");

        const tagsSeenByPeer = () => (peer.stateOf("descriptor") as { tagList: Semtag[] }).tagList;
        expect(tagsSeenByPeer().length).equals(1);

        const tagListChanged = peer.eventsOf("descriptor").tagList$Changed;
        expect(tagListChanged).not.undefined;
        const reported = new Promise<void>(resolve => tagListChanged!.once(() => resolve()));

        await MockTime.resolve(device.setStateOf(TaggedDescriptorServer, { tagList: [InitialTag, UnlabeledTag] }), {
            macrotasks: true,
        });
        await MockTime.resolve(reported, { macrotasks: true });

        const [labeled, unlabeled] = tagsSeenByPeer();
        expect(labeled.label).equals("initial");
        expect(unlabeled.namespaceId).equals(8);
        expect(unlabeled.tag).equals(2);
        expect(unlabeled.label).equals(undefined);
    });
});
