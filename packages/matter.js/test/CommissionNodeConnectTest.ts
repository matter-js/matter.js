/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LegacyControllerSite } from "./util/LegacyControllerSite.js";

describe("CommissioningController.commissionNode", () => {
    before(() => {
        MockTime.init();
    });

    it("returns once the node it connects after commissioning is initialized", async () => {
        await using site = new LegacyControllerSite();
        const controller = await site.addController();
        const device = await site.addDevice();

        const nodeId = await site.commission(controller, device, { connect: true });

        expect(controller.getPairedNode(nodeId)?.initialized).true;
    });
});
