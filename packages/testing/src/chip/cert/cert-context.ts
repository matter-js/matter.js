/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subject } from "../../device/subject.js";
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
    readonly exit: Promise<DeviceExitInfo>;
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
 */
export type StepVerdict = "pass" | "fail" | "skipped" | "aborted";

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
}

/**
 * Evidence hooks a {@link CertTest} step engine reports to. See {@link EvidenceRecorder} for the
 * implementation that persists this to disk.
 */
export interface StepRecorder {
    beginStep(step: CertStepDefinition): void;
    /**
     * Records evidence only; a failed check does not itself change the step's {@link StepVerdict}.
     * A step signals failure by having its `run` throw, not by calling `check` with a failing verdict.
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
     * Persists whatever evidence was recorded. Returns an implementation-defined locator for it
     * (e.g. {@link EvidenceRecorder} returns the directory it wrote to); a recorder with nothing to
     * persist returns an empty string.
     */
    flush(): Promise<string>;
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
    steps: CertStepDefinition[];
    /** Cleanup the engine runs after the last step whatever happened to it (see `cert-dsl.ts`'s `finalize`). */
    finalize?: (cx: CertStepContext) => Promise<void>;
}
