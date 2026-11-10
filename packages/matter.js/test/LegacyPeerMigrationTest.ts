/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "@matter/node";
import { NodeId } from "@matter/types";
import { LegacyControllerSite } from "./util/LegacyControllerSite.js";

describe("Legacy peer migration", () => {
    before(() => {
        MockTime.init();
    });

    it("migrates a peer whose stored discovery TTLs are null or inflated", async () => {
        await using site = new LegacyControllerSite();
        const nodeId = NodeId(5);
        site.storageForNextController().nodes = {
            commissionedNodes: [
                [
                    nodeId,
                    {
                        operationalServerAddress: { type: "udp", ip: "abcd::5", port: 5540, ttl: 7.2e15 },
                        discoveryData: { deviceIdentifier: "0505050505050505", ttl: null },
                    },
                ],
            ],
        };

        const controller = await site.addController();

        const peer = controller.node.peers.get(controller.fabric.addressOf(nodeId))!;
        expect(peer.construction.status).equals("active");
        const state = peer.stateOf(CommissioningClient);
        expect(state.deviceIdentifier).equals("0505050505050505");
        expect(state.ttl).undefined;
        expect(state.addresses?.map(({ ttl }) => ttl)).deep.equals([undefined]);
    });
});
