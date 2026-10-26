/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningController } from "#CommissioningController.js";
import { Lifecycle } from "@matter/general";
import { ClientNode, LocalActorContext } from "@matter/node";
import { NodeId } from "@matter/types";
import { LegacyControllerSite } from "./util/LegacyControllerSite.js";

function enumerate(controller: CommissioningController) {
    try {
        return {
            nodes: controller.getCommissionedNodes(),
            details: controller.getCommissionedNodesDetails().map(details => details.nodeId),
            isCommissioned: controller.isCommissioned(),
        };
    } catch (error) {
        return { error };
    }
}

async function addPeers(controller: CommissioningController, ...nodeIds: NodeId[]) {
    const peers = new Array<ClientNode>();
    for (const nodeId of nodeIds) {
        peers.push(await controller.node.peers.forAddress(controller.fabric.addressOf(nodeId)));
    }
    return peers;
}

describe("CommissioningController commissioned node enumeration", () => {
    before(() => {
        MockTime.init();
    });

    for (const remaining of [[], [NodeId(2)]]) {
        it(`skips a peer that is being deleted ${remaining.length ? "next to another peer" : "as the last peer"}`, async () => {
            await using site = new LegacyControllerSite();
            const controller = await site.addController();
            const nodeId = NodeId(1);
            const [peer] = await addPeers(controller, nodeId, ...remaining);

            expect(enumerate(controller)).deep.equals({
                nodes: [nodeId, ...remaining],
                details: [nodeId, ...remaining],
                isCommissioned: true,
            });

            const duringReset = new Array<ReturnType<typeof enumerate>>();
            peer.construction.change.on(status => {
                if (status === Lifecycle.Status.Inactive && [...controller.node.peers].includes(peer)) {
                    duringReset.push(enumerate(controller));
                }
            });

            await MockTime.resolve(peer.delete(), { macrotasks: true });

            expect(duringReset).deep.equals([
                { nodes: remaining, details: remaining, isCommissioned: remaining.length > 0 },
            ]);
        });
    }

    it("skips a peer that left the fabric but still holds its address", async () => {
        await using site = new LegacyControllerSite();
        const controller = await site.addController();
        const [peer] = await addPeers(controller, NodeId(1), NodeId(2));

        peer.lifecycle.decommissioned.emit(LocalActorContext.ReadOnly);

        expect(peer.state.commissioning.peerAddress).not.undefined;
        expect(enumerate(controller)).deep.equals({ nodes: [NodeId(2)], details: [NodeId(2)], isCommissioned: true });
    });
});
