/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isSkippedStepLine } from "../../src/chip/chip-test-common.js";
import { TestDescriptor } from "../../src/test-descriptor.js";

describe("chip-test-common", () => {
    describe("isSkippedStepLine", () => {
        it("recognizes the line a python test logs for a skipped step", () => {
            expect(isSkippedStepLine("[MatterTest] 11-12 18:08:25.373 INFO **** Skipping: 2b")).true;
            expect(isSkippedStepLine("INFO:root:**** Skipping: 8d")).true;
        });

        it("ignores step headers and other mentions of skipping", () => {
            expect(isSkippedStepLine("[MatterTest] 11-12 18:08:25.373 INFO ***** Test Step 2b : TH reads")).false;
            expect(isSkippedStepLine("Skipping commissionable node discovery over BLE")).false;
            expect(isSkippedStepLine("**** Skipping:")).false;
        });
    });
});

describe("TestDescriptor.merge", () => {
    it("keeps the skipped step count of a previous run the new run does not report", () => {
        const update: TestDescriptor = { name: "4.5", kind: "py" };
        const merged = TestDescriptor.merge({ name: "4.5", kind: "py", passed: true, skippedSteps: 40 }, update);
        expect(merged.skippedSteps).equals(40);
    });
});
