/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AdministratorCommissioningServer } from "#behaviors/administrator-commissioning";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

describe("A node taken offline and started again", () => {
    before(() => {
        MockTime.init();
    });

    it("can be commissioned if it was not commissioned before", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        await MockTime.resolve(device.stop());
        await MockTime.resolve(device.start());

        await site.commission(controller, device);

        expect(device.lifecycle.isCommissioned).true;
    });

    it("opens a commissioning window if it was commissioned before", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        await MockTime.resolve(device.stop());
        await MockTime.resolve(device.start());

        const peer = await subscribedPeer(controller, "peer1");
        await MockTime.resolve(peer.openEnhancedCommissioningWindow());

        expect(device.stateOf(AdministratorCommissioningServer).windowStatus).equals(
            AdministratorCommissioning.CommissioningWindowStatus.EnhancedWindowOpen,
        );
    });
});
