/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { FabricManager } from "@matter/protocol";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

/** Re-run the once-per-start reconciliation and settle the resulting (fire-and-forget) remote command. */
async function reconcile(peer: Awaited<ReturnType<typeof subscribedPeer>>, until: () => boolean) {
    peer.behaviors.internalsOf(NetworkClient).fabricLabelReconciled = false;
    peer.eventsOf(NetworkClient).subscriptionAlive.emit();
    for (let i = 0; i < 20 && !until(); i++) {
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });
    }
}

describe("FabricLabelReconciliation", () => {
    before(() => MockTime.init());

    it("pushes a drifted controller fabric label to the peer on start", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const fabricIndex = peer1.state.commissioning.peerAddress!.fabricIndex;
        const controllerFabric = controller.env.get(FabricManager).for(fabricIndex);
        const deviceFabric = device.env.get(FabricManager).fabrics[0];
        expect(deviceFabric.label).equals(controllerFabric.label);

        // The label changes on the controller (e.g. while the peer was offline).
        await MockTime.resolve(controllerFabric.setLabel("Relabelled"));

        await reconcile(peer1, () => deviceFabric.label === "Relabelled");

        expect(deviceFabric.label).equals("Relabelled");
    });

    it("leaves the peer untouched when the label already matches", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const deviceFabric = device.env.get(FabricManager).fabrics[0];
        const before = deviceFabric.label;

        await reconcile(peer1, () => false);

        expect(deviceFabric.label).equals(before);
    });
});
