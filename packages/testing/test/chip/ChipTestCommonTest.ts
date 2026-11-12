/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { skippedStepOf } from "../../src/chip/chip-test-common.js";
import { TestDescriptor } from "../../src/test-descriptor.js";

describe("chip-test-common", () => {
    describe("skippedStepOf", () => {
        it("returns the step of the line a python test logs for a skipped step", () => {
            expect(skippedStepOf("[MatterTest] 11-12 18:08:25.373 INFO **** Skipping: 2b")).equals("2b");
            expect(skippedStepOf("INFO:root:**** Skipping: 8d")).equals("8d");
        });

        it("ignores step headers and other mentions of skipping", () => {
            expect(skippedStepOf("[MatterTest] 11-12 18:08:25.373 INFO ***** Test Step 2b : TH reads")).undefined;
            expect(skippedStepOf("Skipping commissionable node discovery over BLE")).undefined;
            expect(skippedStepOf("**** Skipping:")).undefined;
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
