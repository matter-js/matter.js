/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, InternalError, Lifetime, Logger, NodeId, Seconds, Time } from "@matter/main";
import { HeapDumpSet } from "@matter/testing";
import { CommissioningController } from "@project-chip/matter.js";

const logger = Logger.get("commissioning-lifecycle-leaks");

async function commissionAndDecommission(
    ctl: CommissioningController,
    info: { discriminator: number; passcode: number },
) {
    await ctl.commissionNode({
        commissioning: { nodeId: NodeId(1) },
        discovery: { identifierData: { longDiscriminator: info.discriminator } },
        passcode: info.passcode,
        autoSubscribe: false,
    });
    if (!ctl.getCommissionedNodes().includes(NodeId(1))) {
        throw new InternalError("Node was not commissioned");
    }

    await ctl.removeNode(NodeId(1), true);
    if (ctl.getCommissionedNodes().includes(NodeId(1))) {
        throw new InternalError("Node was not removed");
    }

    await device.awaitOnline();
}

describe("commissioning lifecycle", () => {
    it("does not leak", async () => {
        const info = await device.start();

        const ctl = new CommissioningController({
            environment: { id: "test-controller", environment: Environment.default },
            adminFabricLabel: "test-fabric",
        });
        await ctl.start();

        try {
            // Warm-up
            logger.info("Warm-up: commission/decommission");
            await commissionAndDecommission(ctl, info);

            // Baseline
            const dumps = new HeapDumpSet("commissioning-lifecycle");
            await Time.sleep("quiesce", Seconds(1));
            await dumps.create("baseline");

            // Target: 5 cycles
            for (let i = 0; i < 5; i++) {
                logger.info(`Target cycle ${i + 1}/5`);
                await commissionAndDecommission(ctl, info);
            }
            await Time.sleep("quiesce", Seconds(1));
            await dumps.create("target");

            // Final: 2 cycles
            for (let i = 0; i < 2; i++) {
                logger.info(`Final cycle ${i + 1}/2`);
                await commissionAndDecommission(ctl, info);
            }
            await Time.sleep("quiesce", Seconds(1));
            await dumps.create("final");

            await dumps.findLeaks();
        } finally {
            await ctl.close();
        }

        logger.info("Remaining lifetimes:", Lifetime.process);
    }).timeout(30_000_000);
});
