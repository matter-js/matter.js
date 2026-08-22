/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
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
 * The evidence bundle for one cert-test run, written to `result.json` by {@link EvidenceRecorder.flush}
 * and settled there by {@link EvidenceRecorder.concludeRun}.
 */
export interface RunRecord {
    tc: string;
    plan: string;
    run: {
        timestamp: string;
        controller: string;
        controllerImplementation: string;
        device: string;
        matterJsCommit: string;
        chipRef?: string;
        chipToolRef?: string;
    };
    steps: StepRecord[];
    /**
     * `"incomplete"` until the run concludes. The record is written before teardown so a teardown
     * hanging against an unreachable device still leaves a bundle behind, and a run that has not
     * finished reporting has no verdict to state — so no hang, interruption or unwritable volume can
     * leave a passing record standing for a run that failed.
     */
    verdict: "pass" | "fail" | "skipped" | "incomplete";
    deviceExit?: { code: number | null; signal?: string };
    /** Why the run's own cleanup failed, if it did (see {@link EvidenceRecorder.finalizationFailed}). */
    finalizationError?: string;
    /** Why closing the run's controllers or devices failed, if it did (see {@link EvidenceRecorder.teardownFailed}). */
    teardownError?: string;
    /** Why the evidence this record's checks cite is incomplete, if it is (see {@link EvidenceRecorder.evidenceIncomplete}). */
    evidenceError?: string;
    /**
     * Why the run failed, when nothing else in this record accounts for it — a bundle that could not be
     * written, evidence reporting that threw, a cause added after this was written. The run's own
     * outcome settles the verdict (see {@link EvidenceRecorder.concludeRun}), so no cause has to be
     * enumerated here to keep a failed run from reading as a pass.
     */
    runError?: string;
    /**
     * How many steps the controller under test could not express, absent if none. A run can reach a
     * "pass" verdict with most of its steps skipped this way, so a reader of this record alone needs
     * the count to know how much the run actually proved.
     */
    controllerUnsupportedSkips?: number;
    /**
     * How many checks reported `"unverified"`, absent if none. Such a check neither proves nor
     * disproves what its step claims — a step made only of them still passes — so this is what tells a
     * reader of this record alone how much of the run's claims rest on nothing observed.
     */
    unverifiedChecks?: number;
}

// Colons aren't valid in a Windows path segment; CI here targets macOS/Linux, but a dash-for-colon
// directory name still reads as a timestamp on any filesystem, so there's no reason to special-case.
function sanitizeTimestampForPath(timestamp: string): string {
    return timestamp.replace(/:/g, "-");
}

function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
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
    #meta: RunRecord["run"] & { tc: string; plan: string };
    #dir: string;
    #steps = new Array<StepRecord>();
    #logs = new Map<string, LogLine[]>();
    #current?: { def: CertStepDefinition; checks: CheckRecord[] };
    #deviceExit?: { code: number | null; signal?: string };
    #finalizationError?: string;
    #teardownError?: string;
    #evidenceError?: string;
    #runError?: string;
    #controllerUnsupportedSkips?: number;
    #unverifiedChecks?: number;
    #concluded = false;

    constructor(outDir: string, meta: RunRecord["run"] & { tc: string; plan: string }) {
        this.#meta = meta;
        // Computed once so the run header (emitted before any step) and flush() agree on exactly
        // where the evidence will land.
        this.#dir = join(outDir, `${sanitizeTimestampForPath(meta.timestamp)}-${meta.tc}`);
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

    endStep(step: CertStepDefinition, verdict: StepVerdict, skipReason?: string): CheckRecord[] {
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

        return checks;
    }

    /**
     * Records that a device's backing process/container exited during the run. A device crash fails
     * the run regardless of how far its steps got (see {@link RunRecord.deviceExit}).
     */
    deviceExited(info: DeviceExitInfo): void {
        this.#deviceExit = { code: info.code, signal: info.signal ?? undefined };
    }

    /**
     * Records that the run's own cleanup failed. A node left commissioned or a subscription left
     * live on the TH outlasts this run and can break the next one, so this fails the run regardless
     * of what its steps did (see {@link RunRecord.finalizationError}).
     */
    finalizationFailed(detail: string): void {
        this.#finalizationError = detail;
    }

    /**
     * Records how many steps the controller under test could not express (see
     * {@link RunRecord.controllerUnsupportedSkips}). Unlike a failed step this never changes the
     * verdict — such a step is a gap in coverage, not a defect in the device.
     */
    recordControllerUnsupportedSkips(count: number): void {
        this.#controllerUnsupportedSkips = count;
    }

    /**
     * Records that closing the run's controllers or devices failed, which makes the run's verdict a
     * failure: state left on the TH outlasts this run and can break the next one (see
     * {@link RunRecord.teardownError}).
     */
    teardownFailed(detail: string): void {
        this.#teardownError = detail;
    }

    /**
     * Records that the evidence this record's checks cite could not be assembled, which makes the run's
     * verdict a failure: a bundle missing the logs its checks index into cannot support them (see
     * {@link RunRecord.evidenceError}).
     */
    evidenceIncomplete(detail: string): void {
        this.#evidenceError = detail;
    }

    /**
     * Records how many checks could not be evaluated (see {@link RunRecord.unverifiedChecks}). Unlike a
     * failed step this never changes the verdict — such a check is a gap in what the run observed, not
     * a defect in the device.
     */
    recordUnverifiedChecks(count: number): void {
        this.#unverifiedChecks = count;
    }

    /**
     * Attaches a raw log dump under `<name>.log`, e.g. `attachLog("controller", ...)` or
     * `attachLog("device-app1", ...)`.
     */
    attachLog(name: string, lines: LogLine[]): void {
        this.#logs.set(name, lines);
    }

    async flush(): Promise<string> {
        await mkdir(this.#dir, { recursive: true });

        // The record is published only after the logs its checks cite, and a log that could not be
        // written reaches it as an evidence gap before this call reports the failure. We accept that a
        // run killed mid-flush leaves no record at all: a record that overclaims is worse than none,
        // because a certification reader cannot tell the difference.
        let logFailure: unknown;
        for (const [name, lines] of this.#logs) {
            try {
                await writeFile(join(this.#dir, `${name}.log`), lines.map(line => line.text).join("\n"));
            } catch (e) {
                if (logFailure === undefined) {
                    logFailure = e;
                }
            }
        }
        if (logFailure !== undefined) {
            this.evidenceIncomplete(
                `${this.#logs.size} attached log(s) could not be written: ${errorText(logFailure)}`,
            );
        }

        await this.#writeRecord();

        if (logFailure !== undefined) {
            throw logFailure;
        }

        return this.#dir;
    }

    /**
     * Settles the run's verdict and writes the record carrying it. Until this runs the record states no
     * verdict, so a run that never gets here — a teardown that hangs, a volume that stopped accepting
     * writes — leaves a bundle saying so rather than one claiming a pass.
     *
     * `outcome.failed` is the run's own outcome as its runner will report it, and a failed run cannot
     * settle as a pass whatever the steps recorded. That is what keeps the two from diverging over a
     * cause this recorder was never told about.
     */
    async concludeRun(outcome: { failed: boolean; detail?: string }): Promise<void> {
        this.#concluded = true;
        if (outcome.failed && this.#runError === undefined) {
            this.#runError = outcome.detail ?? "the run failed";
        }
        await this.#writeRecord();
    }

    async #writeRecord(): Promise<void> {
        await mkdir(this.#dir, { recursive: true });

        const record: RunRecord = {
            tc: this.#meta.tc,
            plan: this.#meta.plan,
            run: {
                timestamp: this.#meta.timestamp,
                controller: this.#meta.controller,
                controllerImplementation: this.#meta.controllerImplementation,
                device: this.#meta.device,
                matterJsCommit: this.#meta.matterJsCommit,
                chipRef: this.#meta.chipRef,
                chipToolRef: this.#meta.chipToolRef,
            },
            steps: this.#steps,
            verdict: this.#verdict(),
            deviceExit: this.#deviceExit,
            finalizationError: this.#finalizationError,
            teardownError: this.#teardownError,
            evidenceError: this.#evidenceError,
            runError: this.#runError,
            controllerUnsupportedSkips: this.#controllerUnsupportedSkips,
            unverifiedChecks: this.#unverifiedChecks,
        };

        // Written beside the target and renamed over it, so a write interrupted partway cannot leave a
        // torn record where a whole one stood.
        const target = join(this.#dir, "result.json");
        const pending = `${target}.pending`;
        await writeFile(pending, JSON.stringify(record, null, 4));
        await rename(pending, target);
    }

    /**
     * Lines describing this run's configuration — TC, plan, device, controller, matter.js commit,
     * chip ref, and where evidence will land — emitted once before the first step through the same
     * channel step boundaries use (see `cert-test.ts`'s `announceStep`). A log excerpt then carries
     * its own provenance.
     */
    runHeaderLines(): string[] {
        const { tc, plan, device, controller, controllerImplementation, chipToolRef, matterJsCommit, chipRef } =
            this.#meta;
        const controllerLine =
            chipToolRef === undefined
                ? `${controllerImplementation} (${controller})`
                : `${controllerImplementation} (${controller}, ${chipToolRef})`;

        return [
            `===== ${tc} =====`,
            `plan       : ${plan}`,
            `device     : ${device}`,
            `controller : ${controllerLine}`,
            `matter.js  : ${matterJsCommit}`,
            `chip ref   : ${chipRef ?? "(unknown)"}`,
            `evidence   : ${this.#dir}`,
        ];
    }

    /**
     * A run where every step was skipped (or that had no steps at all — a malformed definition) is
     * neither a pass nor a fail: nothing was actually exercised, so reporting `"pass"` would overstate
     * what the run proved. Only a run with at least one non-skipped step can pass.
     */
    #verdict(): RunRecord["verdict"] {
        if (!this.#concluded) {
            return "incomplete";
        }
        if (
            this.#deviceExit ||
            this.#finalizationError !== undefined ||
            this.#teardownError !== undefined ||
            this.#evidenceError !== undefined ||
            this.#runError !== undefined
        ) {
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
