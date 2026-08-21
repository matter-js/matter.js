/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepDefinition, LogLine } from "@matter/testing";
import { EvidenceRecorder } from "@matter/testing";
import * as fsp from "node:fs/promises";
import * as osMod from "node:os";
import * as pathMod from "node:path";

function logLine(index: number, text: string): LogLine {
    return { index, at: new Date(0), text };
}

const step1: CertStepDefinition = {
    number: 1,
    text: "Step one text",
    expected: "Device logs readiness",
    run: async () => {},
};
const step2: CertStepDefinition = {
    number: 2,
    text: "Step two text",
    run: async () => {},
};
const step3: CertStepDefinition = {
    number: 3,
    text: "Step three text (never reached)",
    run: async () => {},
};

describe("EvidenceRecorder", () => {
    let outDir: string;

    beforeEach(async () => {
        outDir = await fsp.mkdtemp(pathMod.join(osMod.tmpdir(), "matter-cert-evidence-test-"));
    });

    afterEach(async () => {
        await fsp.rm(outDir, { recursive: true, force: true });
    });

    it("writes a RunRecord matching schema, with log files and an aborted trailing step", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T12:34:56.789Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.check({
            type: "device-log",
            verdict: "pass",
            pattern: "/ready/",
            matched: "device ready",
            logLine: 3,
        });
        recorder.endStep(step1, "pass");

        recorder.beginStep(step2);
        recorder.check({ type: "response", verdict: "fail", detail: "unexpected status 1" });
        recorder.endStep(step2, "fail");

        // Never begun: mirrors CertTest's post-abort endStep(stepDef, "aborted") calls for
        // steps the engine never reached.
        recorder.endStep(step3, "aborted");

        recorder.attachLog("controller", [logLine(0, "line one"), logLine(1, "line two")]);
        recorder.attachLog("device-app1", [logLine(0, "device booted")]);

        const dir = await recorder.flush();

        expect(dir).equal(pathMod.join(outDir, "2026-08-07T12-34-56.789Z-TC-CADMIN-1.17"));

        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect(resultJson).deep.equal({
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            run: {
                timestamp: "2026-08-07T12:34:56.789Z",
                controller: "matterjs",
                controllerImplementation: "matterjs",
                device: "chip-docker",
                matterJsCommit: "abc1234",
            },
            steps: [
                {
                    step: 1,
                    text: "Step one text",
                    expected: "Device logs readiness",
                    checks: [
                        {
                            type: "device-log",
                            verdict: "pass",
                            pattern: "/ready/",
                            matched: "device ready",
                            logLine: 3,
                        },
                    ],
                    verdict: "pass",
                },
                {
                    step: 2,
                    text: "Step two text",
                    checks: [{ type: "response", verdict: "fail", detail: "unexpected status 1" }],
                    verdict: "fail",
                },
                {
                    step: 3,
                    text: "Step three text (never reached)",
                    checks: [],
                    verdict: "aborted",
                },
            ],
            verdict: "fail",
        });

        const controllerLog = await fsp.readFile(pathMod.join(dir, "controller.log"), "utf8");
        expect(controllerLog).equal("line one\nline two");

        const deviceLog = await fsp.readFile(pathMod.join(dir, "device-app1.log"), "utf8");
        expect(deviceLog).equal("device booted");
    });

    it("passes when every step passes or is skipped and no device exit was recorded", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.endStep(step1, "pass");
        recorder.endStep(step2, "skipped", "CADMIN.S.UnmetToken not met");

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect(resultJson.verdict).equal("pass");
        expect(resultJson.steps[1]).deep.equal({
            step: 2,
            text: "Step two text",
            checks: [],
            verdict: "skipped",
            skipReason: "CADMIN.S.UnmetToken not met",
        });
        expect(resultJson.deviceExit).equal(undefined);
    });

    it("reports the run skipped when every step was skipped and none passed", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        recorder.endStep(step1, "skipped", 'unsupported on device flavor "matterjs"');
        recorder.endStep(step2, "skipped", 'unsupported on device flavor "matterjs"');

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect(resultJson.verdict).equal("skipped");
    });

    it("reports the run skipped when it recorded no steps at all", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect(resultJson.verdict).equal("skipped");
    });

    it("fails the run when a step is aborted, even though no step failed outright", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.endStep(step1, "pass");
        recorder.endStep(step2, "aborted");

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect(resultJson.verdict).equal("fail");
    });

    it("marks the run failed when a device exits mid-test, even though every step passed", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.endStep(step1, "pass");
        recorder.deviceExited({ code: null, signal: "SIGKILL" });

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect(resultJson.verdict).equal("fail");
        expect(resultJson.deviceExit).deep.equal({ code: null, signal: "SIGKILL" });
    });

    it("marks the run failed when cleanup failed, even though every step passed", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.endStep(step1, "pass");
        recorder.finalizationFailed("Failed to decommission dut: node is reconnecting");

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect(resultJson.verdict).equal("fail");
        expect(resultJson.finalizationError).equal("Failed to decommission dut: node is reconnecting");
    });

    it("throws when check() is called without an active step", () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        expect(() => recorder.check({ type: "response", verdict: "pass" })).throws(
            "check() called without an active step",
        );
    });

    it("throws when endStep() names a different step than the active one, instead of discarding its checks", () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "matterjs",
            controllerImplementation: "matterjs",
            device: "chip-docker",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        expect(() => recorder.endStep(step2, "pass")).throws("endStep(2) called while step 1 is active");
    });

    it("writes controllerImplementation and chipToolRef into the persisted metadata when supplied", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "dut",
            controllerImplementation: "chip-tool",
            device: "matterjs:all-clusters",
            matterJsCommit: "abc1234",
            chipToolRef: "df8bd0308caa0680e2a78cda724a959e5b385205",
        });

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect(resultJson.run.controllerImplementation).equal("chip-tool");
        expect(resultJson.run.chipToolRef).equal("df8bd0308caa0680e2a78cda724a959e5b385205");
    });

    it("persists the controller-unsupported skip count, so a bare result.json says the run proved less", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-IDM-3.1",
            plan: "interactiondatamodel.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "dut",
            controllerImplementation: "chip-tool",
            device: "matterjs:all-clusters",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.endStep(step1, "pass");
        recorder.recordControllerUnsupportedSkips(2);

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        // A pass verdict alongside a nonzero count is exactly the case the field exists for.
        expect(resultJson.verdict).equal("pass");
        expect(resultJson.controllerUnsupportedSkips).equal(2);
    });

    it("omits the skip count from the persisted metadata when nothing was skipped that way", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-IDM-3.1",
            plan: "interactiondatamodel.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "dut",
            controllerImplementation: "matterjs",
            device: "matterjs:all-clusters",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.endStep(step1, "pass");

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect("controllerUnsupportedSkips" in resultJson).equal(false);
    });

    it("records a teardown failure that arrives after the flush, and fails the run over it", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-IDM-2.1",
            plan: "interactiondatamodel.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "dut",
            controllerImplementation: "chip-tool",
            device: "chip-local:all-clusters",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.endStep(step1, "pass");
        recorder.attachLog("controller", [logLine(0, "a line")]);

        const dir = await recorder.flush();
        expect(JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8")).verdict).equal("pass");

        recorder.teardownFailed("chip-tool would not close");
        await recorder.flushRunRecord();

        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));
        expect(resultJson.verdict).equal("fail");
        expect(resultJson.teardownError).equal("chip-tool would not close");

        expect(await fsp.readFile(pathMod.join(dir, "controller.log"), "utf8")).equal("a line");
    });

    it("persists the unverified-check count, so a bare result.json says how much of a passing run rests on nothing observed", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-IDM-5.1",
            plan: "interactiondatamodel.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "dut",
            controllerImplementation: "matterjs",
            device: "matterjs:all-clusters",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.check({ type: "device-log", verdict: "unverified" });
        recorder.endStep(step1, "pass");
        recorder.recordUnverifiedChecks(3);

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        // An unverified check is a gap in what was observed, not a defect — the verdict stays a pass.
        expect(resultJson.verdict).equal("pass");
        expect(resultJson.unverifiedChecks).equal(3);
    });

    it("omits the unverified-check count when every check was evaluated", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-IDM-5.1",
            plan: "interactiondatamodel.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "dut",
            controllerImplementation: "matterjs",
            device: "matterjs:all-clusters",
            matterJsCommit: "abc1234",
        });

        recorder.beginStep(step1);
        recorder.endStep(step1, "pass");

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect("unverifiedChecks" in resultJson).equal(false);
    });

    it("omits chipToolRef from the persisted metadata when the run has none", async () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            timestamp: "2026-08-07T00:00:00.000Z",
            controller: "dut",
            controllerImplementation: "matterjs",
            device: "matterjs:all-clusters",
            matterJsCommit: "abc1234",
        });

        const dir = await recorder.flush();
        const resultJson = JSON.parse(await fsp.readFile(pathMod.join(dir, "result.json"), "utf8"));

        expect("chipToolRef" in resultJson.run).equal(false);
    });

    it("renders a run header naming the TC, plan, device, controller (with roles), matter.js commit, chip ref, and the eventual evidence directory", () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-IDM-3.1",
            plan: "interactionmodel.adoc",
            timestamp: "2026-08-07T12:34:56.789Z",
            controller: "dut,helper",
            controllerImplementation: "chip-tool",
            device: "matterjs:all-clusters",
            matterJsCommit: "f97efb011",
            chipRef: "df8bd0308caa0680e2a78cda724a959e5b385205",
            chipToolRef: "df8bd0308caa0680e2a78cda724a959e5b385205",
        });

        expect(recorder.runHeaderLines()).deep.equal([
            "===== TC-IDM-3.1 =====",
            "plan       : interactionmodel.adoc",
            "device     : matterjs:all-clusters",
            "controller : chip-tool (dut,helper, df8bd0308caa0680e2a78cda724a959e5b385205)",
            "matter.js  : f97efb011",
            "chip ref   : df8bd0308caa0680e2a78cda724a959e5b385205",
            `evidence   : ${pathMod.join(outDir, "2026-08-07T12-34-56.789Z-TC-IDM-3.1")}`,
        ]);
    });

    it("renders the controller line without a chip-tool reference, and falls back to '(unknown)' for a missing chip ref", () => {
        const recorder = new EvidenceRecorder(outDir, {
            tc: "TC-IDM-3.1",
            plan: "interactionmodel.adoc",
            timestamp: "2026-08-07T12:34:56.789Z",
            controller: "dut",
            controllerImplementation: "matterjs",
            device: "matterjs:all-clusters",
            matterJsCommit: "f97efb011",
        });

        const lines = recorder.runHeaderLines();

        expect(lines).to.include("controller : matterjs (dut)");
        expect(lines).to.include("chip ref   : (unknown)");
    });
});
