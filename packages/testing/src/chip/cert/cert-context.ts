/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Access to a single device's log stream.
 *
 * Grows into full log-following support in later tasks; this is a forward interface so
 * {@link CertStepContext} can compile before that work lands.
 */
export interface LogSource {
    follow(): AsyncIterable<string>;
}

/**
 * A device participating in a cert test.
 *
 * Grows into full matter.js device/controller access in later tasks; this is a forward interface
 * so {@link CertStepContext} can compile before that work lands.
 */
export interface CertDevice {
    readonly log: LogSource;
}

/**
 * Outcome of a single cert-test step.
 */
export type StepVerdict = "pass" | "fail" | "skipped" | "aborted";

/**
 * Evidence hooks a {@link CertTest} step engine reports to.
 *
 * This is a forward interface; the implementation lands in a later task.
 */
export interface StepRecorder {
    beginStep(step: CertStepDefinition): void;
    /**
     * Records evidence only; a failed check does not itself change the step's {@link StepVerdict}.
     * A step signals failure by having its `run` throw, not by calling `check` with `passed: false`.
     */
    check(description: string, passed: boolean): void;
    endStep(step: CertStepDefinition, verdict: StepVerdict): void;
    flush(): Promise<void>;
}

/**
 * Context passed to a {@link CertStepDefinition.run} implementation.
 */
export interface CertStepContext {
    controllers: Record<string, unknown>;
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
    steps: CertStepDefinition[];
}
