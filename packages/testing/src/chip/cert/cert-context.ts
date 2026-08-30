/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subject } from "../../device/subject.js";
import type { ControllerTransport } from "./controller-adapter.js";
import type { ControllerAdapter } from "./controller-adapter.js";
import type { LogFollower } from "./log-follower.js";

/**
 * Access to a single device's log stream.
 */
export interface LogSource {
    follow(): AsyncIterable<string>;
}

/**
 * Kind of implementation backing a {@link CertDevice}.
 */
export type DeviceFlavor = "chip-docker" | "chip-local" | "matterjs";

/**
 * How a {@link CertDevice}'s backing process or container ended.
 */
export interface DeviceExitInfo {
    code: number | null;
    signal: NodeJS.Signals | null;
}

/**
 * A device participating in a cert test — a {@link Subject} plus the identity a step needs to
 * distinguish backing implementations and detect a process/container crash.
 */
export interface CertDevice extends Subject {
    readonly log: LogFollower;
    readonly flavor: DeviceFlavor;

    /**
     * Settles when the device's backing process or container ends without the harness having asked
     * it to — and only then, so a `stop()` or a restart a step drives itself is not an exit in this
     * sense. One latch therefore covers the device's whole life, and a run that restarts a device
     * keeps the crash detection it armed before the first step.
     */
    readonly exit: Promise<DeviceExitInfo>;

    /** The app variant this device actually runs, absent for a device whose flavor has no binary to vary. */
    readonly appVariant?: string;
}

/**
 * A {@link Subject.Factory} that's known to produce {@link CertDevice}s, not just plain
 * {@link Subject}s. Lets cert-test wiring consume a factory's result without narrowing at every call
 * site (see {@link ChipLocalSubject}/{@link ChipDockerSubject}/`registerMatterJsCertSubject`, all of
 * which only ever construct {@link CertDevice}-conforming instances).
 */
export interface CertDeviceFactory extends Subject.Factory {
    (domain: string, options?: Subject.Options): CertDevice;
}

/**
 * Outcome of a single cert-test step.
 *
 * `"unverified"` means the step ran and nothing in it threw, but at least one of its checks could not
 * be evaluated, so the step observed less than its claim needs. It fails the run — unlike `"skipped"`,
 * which states the step never ran at all — because a gap in what was observed must not read as proof.
 * A check whose claim the run genuinely cannot observe says so with {@link CheckRecord.accepted} and
 * leaves the step at `"pass"`.
 */
export type StepVerdict = "pass" | "fail" | "unverified" | "skipped" | "aborted";

/**
 * A single piece of evidence a step recorded while running.
 */
export interface CheckRecord {
    type: "response" | "device-log" | "network";
    verdict: "pass" | "fail" | "unverified";
    detail?: string;
    pattern?: string;
    matched?: string;
    logLine?: number;
    /**
     * Why an `"unverified"` verdict here is expected rather than a gap to close — a claim this device
     * or controller cannot exhibit at all, as against a pattern nobody has written yet. Such a check
     * leaves its step at `"pass"`; every other unverified check makes the step `"unverified"` and fails
     * the run, a blank reason included, since a field left empty accounts for nothing. Ignored for a
     * `"pass"`/`"fail"` verdict, which state what was observed.
     */
    accepted?: string;
}

/**
 * Evidence hooks a {@link CertTest} step engine reports to. See {@link EvidenceRecorder} for the
 * implementation that persists this to disk.
 */
export interface StepRecorder {
    beginStep(step: CertStepDefinition): void;
    /**
     * A step signals failure by having its `run` throw, not by calling `check` with a failing verdict:
     * a `"fail"` here is recorded, not acted on. An `"unverified"` verdict does reach the step's own
     * {@link StepVerdict} unless the check carries {@link CheckRecord.accepted}, since a step whose
     * claim went unobserved has not passed.
     */
    check(record: CheckRecord): void;
    /** Returns the checks recorded for `step` (empty if it never began), for the caller's own end-of-step reporting. */
    endStep(step: CertStepDefinition, verdict: StepVerdict, skipReason?: string): CheckRecord[];
    /**
     * Records that a device exited unexpectedly while the run was in progress. {@link CertTest}
     * calls this and then fails the run itself; a recorder need only persist the information (see
     * {@link EvidenceRecorder.deviceExited}).
     */
    deviceExited?(info: DeviceExitInfo): void;
    /**
     * Records that {@link CertTestDefinition.finalize} threw. {@link CertTest} calls this and then
     * fails the run itself unless a step already failed; a recorder need only persist the
     * information (see {@link EvidenceRecorder.finalizationFailed}).
     */
    finalizationFailed?(detail: string): void;
    /**
     * Lines describing this run's configuration, emitted once before the first step (see
     * `cert-test.ts`'s `invoke`). A recorder with nothing to say about the run's configuration omits
     * this hook, which emits no header.
     */
    runHeaderLines?(): string[];
    /**
     * Records how many steps were skipped because the controller under test cannot express the
     * operation they need. A run whose remaining steps all skip that way still ends with a "pass"
     * verdict, so without this the persisted record alone would not say the run proved less than its
     * verdict suggests.
     */
    recordControllerUnsupportedSkips?(count: number): void;
    /**
     * Records how many steps their own PICS excluded. A step gated on a capability the device or
     * controller does not declare is meant to skip, but a wrong PICS value skips it just as quietly —
     * so a bundle that does not carry the count cannot tell a run that tested less from one that had
     * less to test.
     */
    recordPicsSkips?(count: number): void;
    /**
     * Records how many of the run's checks reported `"unverified"` — a check whose claim could not be
     * evaluated at all. Counts the checks that declared their gap ({@link CheckRecord.accepted})
     * alongside those that did not, so this says how much the run left unobserved whatever the
     * verdicts say.
     */
    recordUnverifiedChecks?(count: number): void;
    /**
     * Records that closing the run's controllers or devices failed, leaving state behind for whatever
     * runs next. {@link CertTest} calls this and then fails the run itself unless something already
     * failed; a recorder need only persist the information (see {@link EvidenceRecorder.teardownFailed}).
     */
    teardownFailed?(detail: string): void;
    /**
     * Records that the evidence a step's checks cite could not be assembled — the device logs every
     * `device-log` check's `logLine` indexes into, above all. The checks themselves say nothing about
     * this, so without it the record would carry claims nothing in the bundle can support (see
     * {@link EvidenceRecorder.evidenceIncomplete}).
     */
    evidenceIncomplete?(detail: string): void;
    /**
     * Persists whatever evidence was recorded. Returns an implementation-defined locator for it
     * (e.g. {@link EvidenceRecorder} returns the directory it wrote to); a recorder with nothing to
     * persist returns an empty string.
     */
    flush(): Promise<string>;
    /**
     * Settles the run's verdict, after teardown, and persists the record carrying it. {@link flush} runs
     * before teardown so a bundle exists even for a teardown that hangs; until this call the persisted
     * record states no verdict, so a run that never reaches it cannot leave one behind. `outcome` is
     * the run's own result as its runner will report it — recorded for every failed run, whatever else
     * the record already names — so a failed run cannot settle as a pass over a cause this recorder was
     * never told about (see {@link EvidenceRecorder.concludeRun}). `outcome.unproven` says the run's
     * only failure is that some step ended `"unverified"`, which the record states as its own verdict
     * rather than as a failure of the device.
     */
    concludeRun?(outcome: { failed: boolean; detail?: string; unproven?: boolean }): Promise<void>;
}

/**
 * Context passed to a {@link CertStepDefinition.run} implementation.
 */
export interface CertStepContext {
    controllers: Record<string, ControllerAdapter>;
    devices: Record<string, CertDevice>;
    recorder: StepRecorder;
}

/**
 * A single step of a cert test plan.
 */
export interface CertStepDefinition {
    number: number | string;
    text: string;
    expected?: string;
    pics?: string;
    /** Device flavors this step supports; absent runs on every flavor (see `cert-dsl.ts`'s `certTest`/`.step`). */
    flavors?: DeviceFlavor[];
    /** Reason this step can never execute; present makes the engine skip it (see `cert-dsl.ts`'s `CertStepOptions`). */
    notApplicable?: string;
    run: (cx: CertStepContext) => Promise<void>;
}

/**
 * A cert test plan translated to executable steps.
 */
export interface CertTestDefinition {
    tc: string;
    plan: string;
    pics: string[];
    app: string;
    /** Variant of `app` to run, where the flavor supports one (see `cert-dsl.ts`'s `CertTestOptions`). */
    appVariant?: string;
    /** Device flavors this test supports; absent runs on every flavor (see `cert-dsl.ts`'s `CertTestOptions`). */
    flavors?: DeviceFlavor[];
    steps: CertStepDefinition[];
    /** Cleanup the engine runs after the last step whatever happened to it (see `cert-dsl.ts`'s `finalize`). */
    finalize?: (cx: CertStepContext) => Promise<void>;
    /**
     * How this test's controllers reach their peers. A TC needing a TCP-backed session declares it
     * here; every other test keeps the transport its evidence and timing were written against.
     */
    transport?: ControllerTransport;
}
