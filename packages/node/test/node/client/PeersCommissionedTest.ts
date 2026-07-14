/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/general";
import { NodeId } from "@matter/types";
import { MockSite } from "../mock-site.js";

describe("Peers#commissioned", () => {
    before(() => {
        MockTime.init();
    });

    it("returns only commissioned client peers, excluding commissionable discoveries and group nodes", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const commissionedPeer = controller.peers.get("peer1")!;
        expect(commissionedPeer).not.undefined;
        expect(commissionedPeer.lifecycle.isCommissioned).true;

        const uncommissionedDevice = await site.addDevice();
        const discovered = await MockTime.resolve(
            controller.peers.discover({
                longDiscriminator: uncommissionedDevice.state.commissioning.discriminator,
                timeout: Seconds(30),
            }),
            { macrotasks: true },
        );
        const commissionableCandidate = discovered[0];
        expect(commissionableCandidate).not.undefined;
        expect(commissionableCandidate.lifecycle.isCommissioned).false;
        expect([...controller.peers]).contains(commissionableCandidate);

        const { fabricIndex } = commissionedPeer.peerAddress!;
        const group = await controller.peers.forAddress({ fabricIndex, nodeId: NodeId.fromGroupId(1) });
        expect(group.nodeType).equals("group");
        expect([...controller.peers]).contains(group);

        // A non-group operational peer established via forAddress (peerAddress set, no commissioning flow) is a
        // commissioned peer and must be included.
        const operationalPeer = await controller.peers.forAddress({ fabricIndex, nodeId: NodeId(0x99n) });
        expect(operationalPeer.nodeType).equals("client");
        expect(operationalPeer.lifecycle.isCommissioned).true;

        expect(new Set(controller.peers.commissioned)).deep.equals(new Set([commissionedPeer, operationalPeer]));
    });
});
