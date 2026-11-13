/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PythonTestOutcome, skippedStepOf } from "../../src/chip/chip-test-common.js";
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

    describe("PythonTestOutcome", () => {
        function outcomeOf(...lines: string[]) {
            const outcome = new PythonTestOutcome();
            for (const line of lines) {
                outcome.observe(line);
            }
            return outcome;
        }

        it("reports a test that skipped itself as skipped, not passed", () => {
            const outcome = outcomeOf(
                "11-13 11:31:36.644 INFO     [Test] test_TC_PWRTL_2_2",
                "11-13 11:31:38.369 INFO     [Test] test_TC_PWRTL_2_2 SKIP",
            );
            expect(outcome.skipped).true;
            expect(outcome.passed).false;
        });

        it("reports a pass in either format", () => {
            expect(outcomeOf("INFO     [Test] test_TC_X_1_1 PASS").passed).true;
            expect(outcomeOf("Final result: PASS !").passed).true;
        });

        it("reports neither for the start line or a step skip", () => {
            const outcome = outcomeOf(
                "11-13 11:31:36.644 INFO     [Test] test_TC_PWRTL_2_2",
                "[MatterTest] 11-12 18:08:25.373 INFO **** Skipping: 2b",
                "Skipping test from /src/python_testing/TC_PWRTL_2_2.py: test_TC_PWRTL_2_2",
            );
            expect(outcome.skipped).false;
            expect(outcome.passed).false;
        });

        it("reports a pass when a pass line comes with a skip line", () => {
            const outcome = outcomeOf("INFO [Test] test_a SKIP", "Final result: PASS !");
            expect(outcome.passed).true;
            expect(outcome.skipped).false;
        });
    });
});

describe("TestDescriptor.merge", () => {
    it("keeps the skipped step count of a previous run the new run does not report", () => {
        const update: TestDescriptor = { name: "4.5", kind: "py" };
        const merged = TestDescriptor.merge({ name: "4.5", kind: "py", passed: true, skippedSteps: 40 }, update);
        expect(merged.skippedSteps).equals(40);
    });

    it("drops an earlier verdict for a test that ran again without one", () => {
        const update: TestDescriptor = { name: "2.2", kind: "py", runAt: new Date() };
        const merged = TestDescriptor.merge({ name: "2.2", kind: "py", passed: true, durationMs: 500 }, update);
        expect(merged.passed).undefined;
        expect(merged.durationMs).undefined;
    });

    it("keeps the verdict of a test that did not run", () => {
        const update: TestDescriptor = { name: "2.2", kind: "py" };
        const merged = TestDescriptor.merge({ name: "2.2", kind: "py", passed: true, durationMs: 500 }, update);
        expect(merged.passed).true;
    });
});
