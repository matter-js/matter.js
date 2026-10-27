/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/main";
import { CommissioningFlowType } from "@matter/main/types";
import { AllClustersTestInstance } from "../../src/AllClustersTestInstance.js";

function setupWith(...appArgs: string[]) {
    return new AllClustersTestInstance({ commandPipeFactory: async () => {}, appArgs }).setupServer();
}

describe("AllClustersTestInstance --custom-flow", () => {
    it("keeps the commissioning window enabled without the argument", async () => {
        const node = await setupWith();
        try {
            expect(node.state.commissioning.flowType).equal(CommissioningFlowType.Standard);
            expect(node.state.commissioning.enabled).equal(true);
        } finally {
            await node.close();
        }
    });

    it("starts a user-intent flow without a commissioning window", async () => {
        const node = await setupWith("--custom-flow", "1");
        try {
            expect(node.state.commissioning.flowType).equal(CommissioningFlowType.UserIntent);
            expect(node.state.commissioning.enabled).equal(false);
        } finally {
            await node.close();
        }
    });

    it("keeps the window enabled for a custom flow, as chip's apps do", async () => {
        const node = await setupWith("--custom-flow", "2");
        try {
            expect(node.state.commissioning.flowType).equal(CommissioningFlowType.Custom);
            expect(node.state.commissioning.enabled).equal(true);
        } finally {
            await node.close();
        }
    });

    it("refuses a flow the field does not define", async () => {
        await expect(setupWith("--custom-flow", "3")).rejectedWith(
            ImplementationError,
            "--custom-flow takes 0, 1 or 2",
        );
        await expect(setupWith("--custom-flow", "user")).rejectedWith(ImplementationError, "--custom-flow");
    });
});
