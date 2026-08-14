/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subject } from "../../device/subject.js";
import { BaseTest } from "../../device/test.js";
import type { Container } from "../../docker/container.js";
import { TestDescriptor, TestFileDescriptor } from "../../test-descriptor.js";
import { delay } from "../../util/async.js";
import { PicsExpression } from "../pics/expression.js";
import { PicsUnavailableError, type PicsFile } from "../pics/file.js";
import {
    CertDevice,
    CertStepContext,
    CertStepDefinition,
    CertTestDefinition,
    CheckRecord,
    DeviceExitInfo,
    DeviceFlavor,
    StepRecorder,
    StepVerdict,
} from "./cert-context.js";
import { UnsupportedByControllerError } from "./controller-adapter.js";

const inertRecorder: StepRecorder = {
    beginStep() {},
    check() {},
    endStep() {
        return [];
    },
    async flush() {
        return "";
    },
};

/**
 * Runs a cert test plan translated into {@link CertStepDefinition}s.
 *
 * Per-step PICS are evaluated at run time against {@link Subject.pics}, since
 * {@link TestDescriptor.filter} only filters whole descriptors at registration time.
 */
export class CertTest extends BaseTest {
    #definition: CertTestDefinition;

    constructor(definition: CertTestDefinition, descriptor: TestFileDescriptor, container: Container) {
        super(descriptor, container);
        this.#definition = definition;
    }

    get definition() {
        return this.#definition;
    }

    async initializeSubject(_subject: Subject): Promise<void> {
        // Commissioning is driven by a controller adapter added in a later task.
    }

    async invoke(
        subject: Subject,
        step: (title: string) => void,
        _args: string[],
        _uncommissioned: boolean,
    ): Promise<void> {
        const cx = this.contextFor(subject);
        const { recorder, devices } = cx;
        const picsFile = resolvePicsFile(subject);
        const deviceExitWatch = watchDeviceExits(devices, recorder);
        const flavor = currentFlavor(devices);
        const tc = this.#definition.tc;

        let aborted = false;
        let failure: unknown;
        let failed = false;
        let controllerUnsupportedSkips = 0;

        try {
            // Provenance reporting must never be why a run that would otherwise pass its steps
            // aborts before running any of them.
            try {
                announceRunHeader(cx, recorder);
            } catch (e) {
                console.warn("Cert test run-header reporting failed:", e);
            }

            for (const stepDef of this.#definition.steps) {
                // A step that can never execute keeps its declared reason; "aborted by step N" loses it.
                if (stepDef.notApplicable !== undefined) {
                    announceStepEnd(
                        cx,
                        tc,
                        stepDef,
                        "skipped",
                        recorder.endStep(stepDef, "skipped", stepDef.notApplicable),
                    );
                    continue;
                }

                if (aborted) {
                    announceStepEnd(cx, tc, stepDef, "aborted", recorder.endStep(stepDef, "aborted"));
                    continue;
                }

                try {
                    if (stepDef.flavors && flavor !== undefined && !stepDef.flavors.includes(flavor)) {
                        announceStepEnd(
                            cx,
                            tc,
                            stepDef,
                            "skipped",
                            recorder.endStep(stepDef, "skipped", `unsupported on device flavor "${flavor}"`),
                        );
                        continue;
                    }

                    if (!stepPicsMet(stepDef, picsFile)) {
                        announceStepEnd(
                            cx,
                            tc,
                            stepDef,
                            "skipped",
                            recorder.endStep(stepDef, "skipped", `PICS "${stepDef.pics}" not met`),
                        );
                        continue;
                    }

                    step(`Test Step ${stepDef.number}: ${stepDef.text}`);
                    announceStepStart(cx, tc, stepDef);
                    recorder.beginStep(stepDef);

                    await raceAgainstDeviceExit(stepDef.run(cx), deviceExitWatch.exit, tc, stepDef.number);
                } catch (e) {
                    if (e instanceof UnsupportedByControllerError) {
                        controllerUnsupportedSkips++;
                        announceStepEnd(cx, tc, stepDef, "skipped", recorder.endStep(stepDef, "skipped", e.message));
                        continue;
                    }

                    announceStepEnd(cx, tc, stepDef, "fail", recorder.endStep(stepDef, "fail"));
                    aborted = true;
                    failed = true;
                    failure = e;
                    continue;
                }

                announceStepEnd(cx, tc, stepDef, "pass", recorder.endStep(stepDef, "pass"));
            }

            // Every remaining step in a run can skip as controller-unsupported without ever failing
            // it (verdict stays "pass" if at least one earlier step passed) — the log banner and the
            // recorded count are what would tell a reader the run proved less than its verdict
            // suggests; a raw result.json with no attached logs must say it too.
            if (controllerUnsupportedSkips > 0) {
                announceControllerSkipSummary(cx, tc, controllerUnsupportedSkips);
                recorder.recordControllerUnsupportedSkips?.(controllerUnsupportedSkips);
            }
        } finally {
            const finalize = this.#definition.finalize;
            if (finalize !== undefined) {
                try {
                    await runFinalizer(finalize, cx, deviceExitWatch.exit, tc, this.finalizationTimeoutMs);
                } catch (e) {
                    // Cleanup that failed left state behind on the TH, which the evidence must say —
                    // but a step failure is the run's own outcome and keeps precedence over it.
                    if (!failed) {
                        failed = true;
                        failure = e;
                    }
                    try {
                        announceFinalizationFailure(cx, tc, e);
                        recorder.finalizationFailed?.(errorText(e));
                    } catch (reportError) {
                        console.warn("Cert test finalization reporting failed:", reportError);
                    }
                }
            }

            try {
                await this.beforeFlush(cx);
            } catch (e) {
                console.warn("Cert test beforeFlush hook failed:", e);
            }

            try {
                await recorder.flush();
            } catch (e) {
                // A step failure already explains the test outcome; don't let a flush error mask it.
                if (failed) {
                    console.warn("Cert test evidence flush failed after a step failure:", e);
                } else {
                    failed = true;
                    failure = e;
                }
            }

            deviceExitWatch.disarm();
        }

        if (failed) {
            throw failure;
        }

        const exited = deviceExitWatch.observed;
        if (exited !== undefined) {
            throw new Error(
                `A cert-test device exited unexpectedly (code ${exited.code}, signal ${exited.signal}) during the run`,
            );
        }
    }

    /**
     * Build the step context for a run.  Overridable so controller/device wiring can be layered on in
     * later tasks without changing {@link invoke}'s public contract.
     */
    protected contextFor(_subject: Subject): CertStepContext {
        return {
            controllers: {},
            devices: {},
            recorder: inertRecorder,
        };
    }

    /** How long {@link CertTestDefinition.finalize} may run before the run abandons it. */
    protected get finalizationTimeoutMs(): number {
        return FINALIZATION_TIMEOUT_MS;
    }

    /**
     * Runs immediately before {@link StepRecorder.flush}, after every step has settled. Overridable
     * so wiring that built its own concrete recorder (see `WiredCertTest` in `cert-dsl.ts`) can attach
     * final device/controller logs — `contextFor`'s generic `StepRecorder` type doesn't expose that,
     * only the concrete recorder implementation does.
     */
    protected async beforeFlush(_cx: CertStepContext): Promise<void> {}
}

/**
 * {@link Subject.pics} is typed as a required {@link PicsFile} but its real implementations can throw
 * {@link PicsUnavailableError} (e.g. the harness has no active PICS file yet) rather than return one.
 * That specific condition means no PICS gating is active, not that the test failed — every step's
 * PICS is then treated as met. Any other error from the accessor is a real failure and propagates.
 */
function resolvePicsFile(subject: Subject): PicsFile | undefined {
    try {
        return subject.pics ?? undefined;
    } catch (e) {
        if (e instanceof PicsUnavailableError) {
            return undefined;
        }
        throw e;
    }
}

/**
 * Every device in one cert-test run shares the flavor `defineCertTest` resolved once for the whole
 * run (see `cert-dsl.ts`'s `#buildContext`), so any device's `.flavor` speaks for all of them.
 * `undefined` only when there are no devices at all (a malformed test definition).
 */
function currentFlavor(devices: Record<string, CertDevice>): DeviceFlavor | undefined {
    return Object.values(devices)[0]?.flavor;
}

/**
 * A malformed step PICS expression, evaluated against a PICS file that *is* available, is a step-level
 * failure — unlike a missing PICS file (see {@link resolvePicsFile}), the expression itself is broken.
 */
function stepPicsMet(stepDef: CertStepDefinition, picsFile: PicsFile | undefined): boolean {
    if (stepDef.pics === undefined || !picsFile) {
        return true;
    }

    return new PicsExpression(stepDef.pics).evaluate(picsFile);
}

const STEP_BANNER_RULE = "-".repeat(70);

/**
 * Injects a step-boundary banner (chip python/yaml style) into every device's and controller's log
 * buffer, so a step's start/end is visible in the written evidence `.log` files at the
 * chronologically right position. {@link LogFollower.annotate} flags each line synthetic, so a
 * step's own `log.expect()` never matches a banner.
 */
function announceStep(cx: CertStepContext, lines: string[]): void {
    for (const line of lines) {
        for (const device of Object.values(cx.devices)) {
            device.log.annotate(line);
        }
        for (const controller of Object.values(cx.controllers)) {
            controller.log.annotate(line);
        }
    }
}

function announceStepStart(cx: CertStepContext, tc: string, stepDef: CertStepDefinition): void {
    announceStep(cx, [STEP_BANNER_RULE, `${tc} — Test Step ${stepDef.number}: ${stepDef.text}`, STEP_BANNER_RULE]);
}

/**
 * Emits the run's configuration (see {@link StepRecorder.runHeaderLines}) before the first step, so
 * a log excerpt carries its own provenance. A recorder with nothing to say (e.g. tests that stub
 * {@link StepRecorder} without this hook) emits no header.
 */
function announceRunHeader(cx: CertStepContext, recorder: StepRecorder): void {
    const lines = recorder.runHeaderLines?.();
    if (lines && lines.length > 0) {
        announceStep(cx, lines);
    }
}

function announceControllerSkipSummary(cx: CertStepContext, tc: string, count: number): void {
    announceStep(cx, [
        STEP_BANNER_RULE,
        `${tc} — ${count} step${count === 1 ? "" : "s"} skipped as unsupported by the controller`,
        STEP_BANNER_RULE,
    ]);
}

function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/**
 * Nothing else bounds cleanup the way {@link raceAgainstDeviceExit} bounds a step: an unreachable TH
 * makes each role's decommission wait out its own MRP budget, and the evidence flush queues behind
 * all of them, so the run can hit the mocha timeout having written no bundle at all.
 */
const FINALIZATION_TIMEOUT_MS = 120_000;

/**
 * Runs `finalize`, abandoning it if a device exits or `timeoutMs` elapses first — either way cleanup
 * can no longer succeed, and the caller records the failure and moves on to the evidence flush. An
 * abandoned run settles on its own time; its eventual rejection is observed rather than cancelled,
 * the same way {@link raceAgainstDeviceExit} treats an orphaned step.
 */
async function runFinalizer(
    finalize: (cx: CertStepContext) => Promise<void>,
    cx: CertStepContext,
    deviceExit: Promise<DeviceExitInfo>,
    tc: string,
    timeoutMs: number,
): Promise<void> {
    const run = finalize(cx);
    const timeout = delay(timeoutMs);

    let outcome: "done" | "exited" | "timeout";
    try {
        outcome = await Promise.race([
            run.then((): "done" => "done"),
            deviceExit.then((): "exited" => "exited"),
            timeout.promise,
        ]);
    } finally {
        timeout.cancel();
    }

    if (outcome === "done") {
        return;
    }

    void run.catch(e => {
        console.warn(`Cert test ${tc}: abandoned cleanup settled after the run stopped waiting for it:`, e);
    });

    throw new Error(
        outcome === "exited"
            ? `Cert test ${tc}: a device exited before the run's cleanup finished`
            : `Cert test ${tc}: cleanup did not finish within ${timeoutMs}ms`,
    );
}

function announceFinalizationFailure(cx: CertStepContext, tc: string, e: unknown): void {
    announceStep(cx, [STEP_BANNER_RULE, `${tc} — Finalization: FAIL`, errorText(e), STEP_BANNER_RULE]);
}

/** One evidence line for `check`: a device-log check names its pattern/match, others their own detail. */
function formatCheckLine(check: CheckRecord): string {
    if (check.type === "device-log") {
        return `pattern=${check.pattern ?? "(none)"} matched=${check.matched ?? "(none)"}`;
    }
    return check.detail ?? "(no detail)";
}

function announceStepEnd(
    cx: CertStepContext,
    tc: string,
    stepDef: CertStepDefinition,
    verdict: StepVerdict,
    checks: CheckRecord[],
): void {
    const checkLines = checks.map((check, index) =>
        checks.length > 1 ? `${index}: ${formatCheckLine(check)}` : formatCheckLine(check),
    );
    announceStep(cx, [
        STEP_BANNER_RULE,
        `${tc} — Test Step ${stepDef.number}: ${verdict.toUpperCase()}`,
        ...checkLines,
        STEP_BANNER_RULE,
    ]);
}

/**
 * A {@link watchDeviceExits} subscription: `exit` resolves the same way every time (first device to
 * exit wins), but the reaction that reports it to `recorder` must be {@link disarm}ed once the run is
 * done with it.
 */
interface DeviceExitWatch {
    exit: Promise<DeviceExitInfo>;
    /**
     * The exit observed while the watch was armed, if any. A device exit can settle outside any
     * step race (all steps skipped, or after the last step) — {@link CertTest.invoke} checks this
     * after the step loop so such a run still rejects instead of reporting success while the
     * evidence says fail.
     */
    readonly observed: DeviceExitInfo | undefined;
    /**
     * Drops the watch's reference to `recorder`. A matterjs device's `exit` never resolves, so
     * without this the reaction below stays attached to it for the process's lifetime, keeping
     * `recorder` (and the evidence/log history it holds for this one run) reachable indefinitely.
     */
    disarm(): void;
}

/**
 * Races every device's {@link CertDevice.exit} against the run and reports the first one that
 * settles to `recorder`. A device's own controlled `stop()`/`close()` (normal test teardown) always
 * runs after {@link CertTest.invoke} has already returned, so a resolution here during the run means
 * the device crashed independently of anything the test asked it to do.
 */
function watchDeviceExits(devices: Record<string, CertDevice>, recorder: StepRecorder): DeviceExitWatch {
    let observed: DeviceExitInfo | undefined;
    let onExit: ((info: DeviceExitInfo) => void) | undefined = info => recorder.deviceExited?.(info);
    const exit = Promise.race(Object.values(devices).map(device => device.exit));

    void exit.then(info => {
        if (onExit === undefined) {
            return;
        }
        observed = info;
        try {
            onExit(info);
        } catch (e) {
            console.warn("Cert test deviceExited hook failed:", e);
        }
    });

    return {
        exit,
        get observed() {
            return observed;
        },
        disarm() {
            onExit = undefined;
        },
    };
}

/**
 * Fails the current step immediately if a device exits while it's running, rather than waiting for
 * the step's own timeout to notice the device is gone.
 */
async function raceAgainstDeviceExit(
    stepRun: Promise<void>,
    deviceExit: Promise<DeviceExitInfo>,
    tc: string,
    step: number | string,
): Promise<void> {
    const outcome = await Promise.race([stepRun.then((): "ran" => "ran"), deviceExit.then((): "exited" => "exited")]);
    if (outcome === "exited") {
        // stepRun keeps running independently of this race and settles on its own time; observe
        // its eventual rejection so it can't surface as an unhandled rejection attributed to
        // whatever runs later, without trying to cancel the operation itself.
        void stepRun.catch(e => {
            console.warn(`Cert test ${tc} step ${step}: orphaned step run settled after the device exit:`, e);
        });
        throw new Error("A cert-test device exited unexpectedly while a step was running");
    }
}

const certTestFactories = new WeakMap<TestDescriptor, () => CertTest>();

/**
 * Registers the factory {@link state.ts}'s `createTest` calls when it first encounters a
 * `"cert"`-kind descriptor. `certTest()` (`cert-dsl.ts`) calls this before the corresponding
 * `chip.testFor(descriptor)`, so the factory is always present by the time `createTest` looks it up.
 */
export function registerCertTestFactory(descriptor: TestDescriptor, factory: () => CertTest): void {
    certTestFactories.set(descriptor, factory);
}

/**
 * Constructs the {@link CertTest} registered for `descriptor` via {@link registerCertTestFactory}.
 */
export function createRegisteredCertTest(descriptor: TestDescriptor): CertTest {
    const factory = certTestFactories.get(descriptor);
    if (!factory) {
        throw new Error(`No cert test registered for descriptor "${descriptor.name}"`);
    }
    return factory();
}
