/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepDefinition } from "../../src/chip/cert/cert-context.js";
import type * as EvidenceModule from "../../src/chip/cert/evidence.js";
import type { LogLine } from "../../src/chip/cert/log-follower.js";
import { importModule } from "./dynamic-import.js";

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

// evidence.ts writes result.json/*.log via node:fs/promises, which isn't browser-bundleable; load it
// only via dynamic import inside this guard so the web run's static import graph never reaches it.
if (typeof window === "undefined") {
    describe("EvidenceRecorder", () => {
        let EvidenceRecorder: typeof EvidenceModule.EvidenceRecorder;
        let fsp: typeof import("node:fs/promises");
        let osMod: typeof import("node:os");
        let pathMod: typeof import("node:path");

        let outDir: string;

        before(async () => {
            ({ EvidenceRecorder } = await importModule<typeof EvidenceModule>("../../src/chip/cert/evidence.js"));
            fsp = await import("node:fs/promises");
            osMod = await import("node:os");
            pathMod = await import("node:path");
        });

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

        it("throws when check() is called without an active step", () => {
            const recorder = new EvidenceRecorder(outDir, {
                tc: "TC-CADMIN-1.17",
                plan: "multiplefabrics.adoc",
                timestamp: "2026-08-07T00:00:00.000Z",
                controller: "matterjs",
                device: "chip-docker",
                matterJsCommit: "abc1234",
            });

            expect(() => recorder.check({ type: "response", verdict: "pass" })).throws(
                "check() called without an active step",
            );
        });
    });
}
