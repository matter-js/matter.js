/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "@matter/main";
import { CommissioningController } from "@project-chip/matter.js";
import { boot, nodeIdFor } from "../common/process-child.js";

boot({
    async commission(message) {
        const ctl = await controller();
        await ctl.commissionNode({
            commissioning: {
                nodeId: nodeIdFor(message),
            },
            discovery: {
                identifierData: {
                    longDiscriminator: message.discriminator,
                },
            },
            passcode: message.passcode,
            autoSubscribe: false,
        });
    },

    async subscribe(message) {
        const ctl = await controller();
        const node = await ctl.getNode(nodeIdFor(message));
        await node.subscribeAllAttributesAndEvents();
    },

    async reset() {
        if (activeController) {
            await activeController.close();
            activeController = undefined;
        }
    },
});

let activeController: undefined | CommissioningController;

async function controller() {
    if (activeController === undefined) {
        activeController = new CommissioningController({
            environment: { id: "test-controller", environment: Environment.default },
            adminFabricLabel: "test-fabric",
        });

        await activeController.start();
    }
    return activeController;
}
