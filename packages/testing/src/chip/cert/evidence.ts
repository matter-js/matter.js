/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CertStepDefinition, CheckRecord, DeviceExitInfo, StepRecorder, StepVerdict } from "./cert-context.js";
import type { LogLine } from "./log-follower.js";

// StepRecorder.check() needs this shape too, so cert-context.ts is CheckRecord's canonical home;
// re-exported here so callers of this module don't need a second import.
export type { CheckRecord };

/**
 * A single cert-test step's recorded outcome and evidence.
 */
export interface StepRecord {
    step: number | string;
    text: string;
    expected?: string;
    checks: CheckRecord[];
    verdict: StepVerdict;
    skipReason?: string;
}

/**
 * The evidence bundle for one cert-test run, written to `result.json` by {@link EvidenceRecorder.flush}.
 */
export interface RunRecord {
    tc: string;
    plan: string;
    run: {
        timestamp: string;
        controller: string;
        device: string;
        matterJsCommit: string;
        chipRef?: string;
    };
    steps: StepRecord[];
    verdict: "pass" | "fail" | "skipped";
    deviceExit?: { code: number | null; signal?: string };
}

// Colons aren't valid in a Windows path segment; CI here targets macOS/Linux, but a dash-for-colon
// directory name still reads as a timestamp on any filesystem, so there's no reason to special-case.
function sanitizeTimestampForPath(timestamp: string): string {
    return timestamp.replace(/:/g, "-");
}

/**
 * Collects a {@link CertTest} run's per-step evidence and writes it to disk as `result.json` plus one
 * `<name>.log` per {@link attachLog} call.
 *
 * `endStep` always receives the full {@link CertStepDefinition}, not just a verdict — that's what
 * lets a step the engine never reached (PICS-skipped, or trailing a prior abort, so `beginStep` was
 * never called for it) still become a complete {@link StepRecord}: its `text`/`expected` come from
 * the definition `endStep` was given, and its `checks` default to empty.
 */
export class EvidenceRecorder implements StepRecorder {
    #outDir: string;
    #meta: RunRecord["run"] & { tc: string; plan: string };
    #steps = new Array<StepRecord>();
    #logs = new Map<string, LogLine[]>();
    #current?: { def: CertStepDefinition; checks: CheckRecord[] };
    #deviceExit?: { code: number | null; signal?: string };

    constructor(outDir: string, meta: RunRecord["run"] & { tc: string; plan: string }) {
        this.#outDir = outDir;
        this.#meta = meta;
    }

    beginStep(step: CertStepDefinition): void {
        this.#current = { def: step, checks: new Array<CheckRecord>() };
    }

    check(record: CheckRecord): void {
        if (!this.#current) {
            throw new Error("EvidenceRecorder.check() called without an active step; call beginStep() first");
        }
        this.#current.checks.push(record);
    }

    endStep(step: CertStepDefinition, verdict: StepVerdict, skipReason?: string): void {
        // No active step is fine (skipped/aborted steps never begin), but ending a *different*
        // step than the active one would silently discard the active step's checks.
        if (this.#current !== undefined && this.#current.def !== step) {
            throw new Error(
                `EvidenceRecorder.endStep(${step.number}) called while step ${this.#current.def.number} is active`,
            );
        }
        const checks = this.#current?.checks ?? new Array<CheckRecord>();
        this.#current = undefined;

        this.#steps.push({
            step: step.number,
            text: step.text,
            expected: step.expected,
            checks,
            verdict,
            skipReason,
        });
    }

    /**
     * Records that a device's backing process/container exited during the run. A device crash fails
     * the run regardless of how far its steps got (see {@link RunRecord.deviceExit}).
     */
    deviceExited(info: DeviceExitInfo): void {
        this.#deviceExit = { code: info.code, signal: info.signal ?? undefined };
    }

    /**
     * Attaches a raw log dump under `<name>.log`, e.g. `attachLog("controller", ...)` or
     * `attachLog("device-app1", ...)`.
     */
    attachLog(name: string, lines: LogLine[]): void {
        this.#logs.set(name, lines);
    }

    async flush(): Promise<string> {
        const dirName = `${sanitizeTimestampForPath(this.#meta.timestamp)}-${this.#meta.tc}`;
        const dir = join(this.#outDir, dirName);
        await mkdir(dir, { recursive: true });

        const record: RunRecord = {
            tc: this.#meta.tc,
            plan: this.#meta.plan,
            run: {
                timestamp: this.#meta.timestamp,
                controller: this.#meta.controller,
                device: this.#meta.device,
                matterJsCommit: this.#meta.matterJsCommit,
                chipRef: this.#meta.chipRef,
            },
            steps: this.#steps,
            verdict: this.#verdict(),
            deviceExit: this.#deviceExit,
        };

        await writeFile(join(dir, "result.json"), JSON.stringify(record, null, 4));

        for (const [name, lines] of this.#logs) {
            await writeFile(join(dir, `${name}.log`), lines.map(line => line.text).join("\n"));
        }

        return dir;
    }

    /**
     * A run where every step was skipped (or that had no steps at all — a malformed definition) is
     * neither a pass nor a fail: nothing was actually exercised, so reporting `"pass"` would overstate
     * what the run proved. Only a run with at least one non-skipped step can pass.
     */
    #verdict(): "pass" | "fail" | "skipped" {
        if (this.#deviceExit) {
            return "fail";
        }
        if (this.#steps.some(step => step.verdict === "fail" || step.verdict === "aborted")) {
            return "fail";
        }
        if (this.#steps.some(step => step.verdict === "pass")) {
            return "pass";
        }
        return "skipped";
    }
}
