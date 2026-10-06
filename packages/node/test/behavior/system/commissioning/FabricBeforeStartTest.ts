/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningServer } from "#behavior/system/commissioning/CommissioningServer.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { FabricAuthority } from "@matter/protocol";
import { FabricId } from "@matter/types";
import { MockServerNode } from "../../../node/mock-server-node.js";
import { MockSite } from "../../../node/mock-site.js";

let operational = 0;

class RecordingCommissioningServer extends CommissioningServer {
    protected override enterOperationalMode() {
        operational++;
        super.enterOperationalMode();
    }
}

describe("A fabric created before the node starts", () => {
    before(() => {
        MockTime.init();
    });

    beforeEach(() => {
        operational = 0;
    });

    it("counts the node as commissioned and advertises it operationally once online", async () => {
        await using site = new MockSite();
        const controller = await site.addNode(
            MockServerNode.RootEndpoint.with(ControllerBehavior, RecordingCommissioningServer),
            {
                id: "controller",
                online: false,
                commissioning: { enabled: false },
                controller: { adminFabricId: FabricId(1) },
            },
        );

        // As a controller app does on its first run, under the label the controller itself uses
        const authority = await controller.env.load(FabricAuthority);
        await authority.defaultFabric({ adminFabricLabel: controller.stateOf(ControllerBehavior).adminFabricLabel });

        let commissioned = 0;
        controller.lifecycle.commissioned.on(() => {
            commissioned++;
        });

        await MockTime.resolve(controller.start());

        expect(commissioned).equals(1);
        expect(controller.lifecycle.isCommissioned).true;
        expect(controller.stateOf(CommissioningServer).commissioned).true;
        expect(operational).equals(1);
    });
});
