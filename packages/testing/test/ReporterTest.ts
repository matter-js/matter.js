/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Progress } from "@nacho-iot/js-tools";
import { MachineReporter } from "../src/machine-reporter.js";

function quietly(run: () => void) {
    const write = process.stdout.write;
    process.stdout.write = () => true;
    try {
        run();
    } finally {
        process.stdout.write = write;
    }
}

describe("MachineReporter", () => {
    it("reports success for a run whose tests all skipped themselves", () => {
        const progress = new Progress();
        const reporter = new MachineReporter(progress);
        quietly(() => {
            reporter.beginRun("run");
            reporter.beginSuite(["PWRTL"]);
            reporter.beginTest("2.2");
            reporter.skipTest("2.2");
            reporter.endRun();
        });
        expect(progress.status).equals(Progress.Status.Success);
    });

    it("reports failure for a run without tests", () => {
        const progress = new Progress();
        const reporter = new MachineReporter(progress);
        quietly(() => {
            reporter.beginRun("run");
            reporter.endRun();
        });
        expect(progress.status).equals(Progress.Status.Failure);
    });
});
