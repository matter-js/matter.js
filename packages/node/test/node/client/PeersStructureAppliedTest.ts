/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { Node } from "#node/Node.js";
import { MockSite, subscribedPeer } from "@matter/node/testing";

describe("Peers#structureApplied", () => {
    before(() => {
        MockTime.init();
    });

    it("emits the peer after a report was applied", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const applied = new Array<Node>();
        controller.peers.structureApplied.on(node => {
            applied.push(node);
        });
        await MockTime.resolve(MockTime.macrotask);
        expect(applied).deep.equals([]);

        const reported = new Promise<void>(resolve =>
            peer.eventsOf(BasicInformationClient).nodeLabel$Changed.once(() => resolve()),
        );
        await MockTime.resolve(device.set({ basicInformation: { nodeLabel: "relabeled" } }));
        await MockTime.resolve(reported, { macrotasks: true });
        await MockTime.resolve(MockTime.macrotask);

        expect(applied).deep.equals([peer]);
    });
});
