/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { env } from "node:process";
import type { Subject } from "../../device/subject.js";
import { BaseTest } from "../../device/test.js";
import type { Container } from "../../docker/container.js";
import { TestDescriptor, TestFileDescriptor } from "../../test-descriptor.js";
import { delay } from "../../util/async.js";
import { PicsExpression } from "../pics/expression.js";
import { PicsUnavailableError, type PicsFile } from "../pics/file.js";
import { picsWithOverrides } from "./cert-app-pics.js";
import {
    CertDevice,
    CertStepContext,
    CertRunSetup,
    CertStepDefinition,
    CertStepWiring,
    CertTestDefinition,
    CheckRecord,
    DeviceExitInfo,
    DeviceFlavor,
    StepRecorder,
    StepVerdict,
} from "./cert-context.js";
import {
    capabilitiesFor,
    controllerCapabilityGap,
    controllerCapabilityOutOfScope,
    type ControllerSelection,
    UnsupportedByControllerError,
} from "./controller-adapter.js";
import { StepActions } from "./step-actions.js";

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
    #selection: ControllerSelection;

    /**
     * `selection` names the controllers of the run: the step gates and the PICS overlay judge by it, so it has to be
     * the selection the run's controllers were built from.
     */
    constructor(
        definition: CertTestDefinition,
        descriptor: TestFileDescriptor,
        container: Container,
        selection: ControllerSelection,
    ) {
        super(descriptor, container);
        this.#definition = definition;
        this.#selection = selection;
    }

    get definition() {
        return this.#definition;
    }

    get selection() {
        return this.#selection;
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
        let picsFile: PicsFile | undefined;
        const wiring = this.contextFor(subject);
        const flavor = this.flavorFor(wiring.devices);
        const cx: CertStepContext = Object.assign(wiring, {
            picsMet: (expression: string) => picsAnswer(expression, picsFile),
            controllerSelection: this.#selection,
            deviceFlavor: flavor,
        });
        const { devices } = cx;

        // A step's own checks are how the suite defines "something was observed", and a step that ran
        // without recording one ends unverified. Together with the actions below, the count also decides
        // whether a step may still skip itself (CertStepNotApplicableError, the notApplicableAtRun probe).
        let observedThisStep = 0;
        // Checks alone miss a step that changed the device before it recorded anything
        const actions = new StepActions();
        let unaccountedThisStep = 0;
        let unverifiedChecks = 0;
        const recorded = cx.recorder;

        // A StepRecorder may be a class instance, whose members live on its prototype — so each is
        // forwarded by name.
        const recorder: StepRecorder = {
            beginStep: step => recorded.beginStep(step),
            check: record => {
                observedThisStep++;
                recorded.check(record);
                if (record.verdict === "unverified") {
                    unverifiedChecks++;
                    // A blank reason accounts for nothing: an empty string would otherwise pass a step
                    // off as proven on a field somebody forgot to fill in.
                    if (record.accepted === undefined || record.accepted.trim() === "") {
                        unaccountedThisStep++;
                    }
                }
            },
            endStep: (step, verdict, skipReason) => recorded.endStep(step, verdict, skipReason),
            deviceExited:
                recorded.deviceExited === undefined ? undefined : (role, info) => recorded.deviceExited?.(role, info),
            finalizationFailed:
                recorded.finalizationFailed === undefined ? undefined : detail => recorded.finalizationFailed?.(detail),
            runHeaderLines: recorded.runHeaderLines === undefined ? undefined : () => recorded.runHeaderLines?.() ?? [],
            recordControllerUnsupportedSkips:
                recorded.recordControllerUnsupportedSkips === undefined
                    ? undefined
                    : count => recorded.recordControllerUnsupportedSkips?.(count),
            recordPicsSkips:
                recorded.recordPicsSkips === undefined ? undefined : count => recorded.recordPicsSkips?.(count),
            recordLongRunningSkips:
                recorded.recordLongRunningSkips === undefined
                    ? undefined
                    : count => recorded.recordLongRunningSkips?.(count),
            recordPlanConditionSkips:
                recorded.recordPlanConditionSkips === undefined
                    ? undefined
                    : count => recorded.recordPlanConditionSkips?.(count),
            recordOutOfScopeSkips:
                recorded.recordOutOfScopeSkips === undefined
                    ? undefined
                    : count => recorded.recordOutOfScopeSkips?.(count),
            recordUnverifiedChecks:
                recorded.recordUnverifiedChecks === undefined
                    ? undefined
                    : count => recorded.recordUnverifiedChecks?.(count),
            teardownFailed:
                recorded.teardownFailed === undefined ? undefined : detail => recorded.teardownFailed?.(detail),
            evidenceIncomplete:
                recorded.evidenceIncomplete === undefined ? undefined : detail => recorded.evidenceIncomplete?.(detail),
            flush: () => recorded.flush(),
            concludeRun:
                recorded.concludeRun === undefined
                    ? undefined
                    : async outcome => {
                          await recorded.concludeRun?.(outcome);
                      },
        };
        cx.recorder = recorder;
        cx.controllers = Object.fromEntries(
            Object.entries(cx.controllers).map(([role, controller]) => [role, actions.track(controller)]),
        );
        const deviceExitWatch = watchDeviceExits(devices, recorder);
        const tc = this.#definition.tc;

        let aborted = false;
        let failure: unknown;
        let failed = false;
        let controllerUnsupportedSkips = 0;
        let picsSkips = 0;
        let longRunningSkips = 0;
        let planConditionSkips = 0;
        let outOfScopeSkips = 0;
        let unverifiedSteps = 0;
        const uncheckedSteps = new Array<CertStepDefinition["number"]>();
        let unproven = false;
        let frameworkError = false;
        let reportingFailure: unknown;

        // Ends a step and announces its outcome. A throw here must not become the step's outcome —
        // the step's own error takes precedence — but a run whose evidence could not be written must
        // not report success either, so the first such failure is kept and applied below.
        const report = (stepDef: CertStepDefinition, verdict: StepVerdict, skipReason?: string) => {
            try {
                announceStepEnd(cx, tc, stepDef, verdict, recorder.endStep(stepDef, verdict, skipReason));
            } catch (e) {
                if (reportingFailure === undefined) {
                    reportingFailure = e;
                }
                console.warn(`Cert test ${tc} step ${stepDef.number}: reporting the ${verdict} outcome failed:`, e);
            }
        };

        try {
            // Inside the try: reading the subject's PICS can throw, and everything this run opened is
            // closed by the teardown below.
            const subjectPics = resolvePicsFile(subject);
            picsFile = subjectPics && picsWithOverrides(subjectPics, this.#definition, this.#selection.dut, flavor);

            // Provenance reporting must never be why a run that would otherwise pass its steps
            // aborts before running any of them.
            try {
                announceRunHeader(cx, recorder);
            } catch (e) {
                console.warn("Cert test run-header reporting failed:", e);
            }

            for (const stepDef of this.#definition.steps) {
                let notApplicable: string | undefined;
                let longRunning: string | undefined;
                try {
                    notApplicable = settingFor(stepDef, "notApplicable", cx);
                    longRunning = settingFor(stepDef, "longRunning", cx);
                } catch (e) {
                    // The run's first failure decides its outcome; this step would not have run anyway
                    if (aborted) {
                        console.warn(`Cert test ${tc} step ${stepDef.number}: deciding its options failed:`, e);
                        report(stepDef, "aborted");
                        continue;
                    }

                    // A defect of the declaration, not an outcome of the device
                    aborted = true;
                    failed = true;
                    frameworkError = true;
                    failure = e;
                    report(stepDef, "error");
                    continue;
                }

                // A step that can never execute keeps its declared reason; "aborted by step N" loses it.
                if (notApplicable !== undefined) {
                    report(stepDef, "skipped", notApplicable);
                    continue;
                }

                if (aborted) {
                    report(stepDef, "aborted");
                    continue;
                }

                try {
                    // A step that declares flavors never runs on an unknown one: taking silence for
                    // consent would run it wherever the flavor could not be determined, which is the
                    // one case its declaration cannot speak for.
                    if (
                        stepDef.flavors !== undefined &&
                        (flavor === undefined || !stepDef.flavors.some(supported => supported === flavor))
                    ) {
                        report(
                            stepDef,
                            "skipped",
                            flavor === undefined
                                ? `device flavor unknown, and this step declares ${stepDef.flavors.join("/")}`
                                : `unsupported on device flavor "${flavor}"`,
                        );
                        continue;
                    }

                    if (!stepPicsMet(stepDef, picsFile)) {
                        picsSkips++;
                        report(stepDef, "skipped", `PICS "${stepDef.pics}" not met`);
                        continue;
                    }

                    let opened = false;
                    const open = () => {
                        if (opened) {
                            return;
                        }
                        opened = true;
                        step(`Test Step ${stepDef.number}: ${stepDef.text}`);
                        announceStepStart(cx, tc, stepDef);
                        observedThisStep = 0;
                        actions.nextStep();
                        unaccountedThisStep = 0;
                        recorder.beginStep(stepDef);
                    };

                    const capabilityGap =
                        stepDef.controllerCapabilities === undefined
                            ? undefined
                            : controllerCapabilityGap(
                                  stepDef.controllerCapabilities,
                                  Object.values(this.#definition.controllers),
                                  this.#selection,
                              );
                    if (capabilityGap !== undefined) {
                        controllerUnsupportedSkips++;
                        report(stepDef, "skipped", capabilityGap);
                        continue;
                    }

                    const outOfScope =
                        stepDef.controllerCapabilities === undefined
                            ? undefined
                            : controllerCapabilityOutOfScope(
                                  stepDef.controllerCapabilities,
                                  Object.values(this.#definition.controllers),
                                  this.#selection,
                              );
                    if (outOfScope !== undefined) {
                        outOfScopeSkips++;
                        report(stepDef, "skipped", outOfScope);
                        continue;
                    }

                    if (longRunning !== undefined && !longRunningEnabled()) {
                        longRunningSkips++;
                        report(stepDef, "skipped", `${longRunning}; set MATTER_CERT_LONG_RUNNING=1 to run it`);
                        continue;
                    }

                    // After the static gates: the decision reads the DUT and the TH log, and a read that fails must
                    // not turn a step this controller cannot run into an error.
                    if (stepDef.notApplicableAtRun !== undefined) {
                        open();
                        const reason = await raceAgainstDeviceExit(
                            stepDef.notApplicableAtRun(cx),
                            deviceExitWatch.exit,
                            tc,
                            stepDef.number,
                        );
                        const misuse =
                            observedThisStep > 0 || actions.count > 0
                                ? `recorded ${observedThisStep} check(s) and made ${actions.count} controller ` +
                                  "call(s) that may change the device while deciding whether it applies; it may only read"
                                : reason?.trim() === ""
                                  ? 'decided its "notApplicableAtRun" option with a blank reason'
                                  : undefined;
                        if (misuse !== undefined) {
                            aborted = true;
                            failed = true;
                            frameworkError = true;
                            failure = new CertFrameworkError(`Cert test ${tc} step ${stepDef.number} ${misuse}`);
                            report(stepDef, "error");
                            continue;
                        }
                        if (reason !== undefined) {
                            planConditionSkips++;
                            report(stepDef, "skipped", reason);
                            continue;
                        }
                    }

                    open();

                    await raceAgainstDeviceExit(stepDef.run(cx), deviceExitWatch.exit, tc, stepDef.number);
                } catch (e) {
                    if (e instanceof CertStepNotApplicableError) {
                        // "skipped" claims nothing was evaluated, which a step that recorded evidence or acted cannot
                        if (observedThisStep === 0 && actions.count === 0) {
                            planConditionSkips++;
                            report(stepDef, "skipped", e.message);
                            continue;
                        }

                        aborted = true;
                        failed = true;
                        failure = new Error(
                            `Cert test ${tc} step ${stepDef.number} declared itself not applicable after recording ` +
                                `${observedThisStep} check(s) and making ${actions.count} controller call(s) that may ` +
                                `change the device; a step decides whether it applies before it acts. ` +
                                `Reason given: ${e.message}`,
                        );
                        report(stepDef, "fail");
                        continue;
                    }

                    if (e instanceof UnsupportedByControllerError) {
                        aborted = true;
                        failed = true;
                        frameworkError = true;
                        failure = undeclaredRefusal(tc, stepDef, this.#definition, e);
                        report(stepDef, "error");
                        continue;
                    }

                    aborted = true;
                    failed = true;
                    failure = e;

                    report(stepDef, "fail");
                    continue;
                }

                if (unaccountedThisStep > 0) {
                    unverifiedSteps++;
                    report(stepDef, "unverified");
                    continue;
                }

                if (observedThisStep === 0) {
                    uncheckedSteps.push(stepDef.number);
                    report(stepDef, "unverified");
                    continue;
                }

                report(stepDef, "pass");
            }

            if (!failed && reportingFailure !== undefined) {
                failed = true;
                failure = reportingFailure;
            }

            if (controllerUnsupportedSkips > 0) {
                recordSummary(
                    () => recorder.recordControllerUnsupportedSkips?.(controllerUnsupportedSkips),
                    () => announceControllerSkipSummary(cx, tc, controllerUnsupportedSkips),
                    "controller-skip",
                );
            }

            if (picsSkips > 0) {
                recordSummary(
                    () => recorder.recordPicsSkips?.(picsSkips),
                    () => announcePicsSkipSummary(cx, tc, picsSkips),
                    "PICS-skip",
                );
            }

            if (longRunningSkips > 0) {
                recordSummary(
                    () => recorder.recordLongRunningSkips?.(longRunningSkips),
                    () => announceLongRunningSkipSummary(cx, tc, longRunningSkips),
                    "long-running-skip",
                );
            }

            if (planConditionSkips > 0) {
                recordSummary(
                    () => recorder.recordPlanConditionSkips?.(planConditionSkips),
                    () => announcePlanConditionSkipSummary(cx, tc, planConditionSkips),
                    "plan-condition-skip",
                );
            }

            if (outOfScopeSkips > 0) {
                recordSummary(
                    () => recorder.recordOutOfScopeSkips?.(outOfScopeSkips),
                    () => announceOutOfScopeSkipSummary(cx, tc, outOfScopeSkips),
                    "out-of-scope-skip",
                );
            }

            if (unverifiedChecks > 0) {
                recordSummary(
                    () => recorder.recordUnverifiedChecks?.(unverifiedChecks),
                    () => announceUnverifiedSummary(cx, tc, unverifiedChecks),
                    "unverified-check",
                );
            }
        } catch (e) {
            // Kept before rethrowing: the handlers inside cover what a step can do, and everything else
            // — resolving the controller, reading the PICS — would otherwise reach the record below as
            // a run that never failed.
            if (!failed) {
                failed = true;
                failure = e;
            }
            throw e;
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
                // The hook attaches the logs every `device-log` check's `logLine` indexes into, so a
                // bundle written without them cannot support the checks it carries.
                if (failed) {
                    console.warn("Cert test beforeFlush hook failed after a step failure:", e);
                } else {
                    failed = true;
                    failure = e;
                }
                try {
                    recorder.evidenceIncomplete?.(errorText(e));
                } catch (reportError) {
                    console.warn("Cert test evidence-gap reporting failed:", reportError);
                }
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

            // After the flush, so a bundle exists even for a teardown that hangs against an
            // unreachable TH — which is why a teardown that does complete has to write its own outcome
            // into the record below.
            const teardownErrors = await this.teardown();

            const exited = deviceExitWatch.observed;
            deviceExitWatch.disarm();

            if (teardownErrors.length > 0) {
                try {
                    recorder.teardownFailed?.(teardownErrors.map(errorText).join("; "));
                } catch (e) {
                    console.warn("Cert test close-failure reporting failed:", e);
                }
            }

            // In order: what the run itself hit, then a device that died under it — an exit settling
            // too late for any step's race is still the run's own outcome — and only then cleanup.
            if (!failed) {
                if (exited !== undefined) {
                    failed = true;
                    failure = new Error(
                        `Cert-test device "${exited.role}" exited unexpectedly (code ${exited.info.code}, signal ` +
                            `${exited.info.signal}) during the run`,
                    );
                } else if (teardownErrors.length > 0) {
                    failed = true;
                    failure = new AggregateError(
                        teardownErrors,
                        `Cert test ${tc}: ${teardownErrors.length} controller/device(s) failed to close, leaving ` +
                            "state behind for whatever runs next",
                    );
                }
            }

            // Only where nothing else failed: a device that died or cleanup that threw is the run's
            // own outcome, and a step that observed nothing is the weaker claim of the two.
            if (!failed && (unverifiedSteps > 0 || uncheckedSteps.length > 0)) {
                const gaps = new Array<string>();
                if (unverifiedSteps > 0) {
                    gaps.push(
                        `${unverifiedSteps} step${unverifiedSteps === 1 ? "" : "s"} ended with a check that could ` +
                            "not be evaluated. Close the gap — a device-log check usually needs the pattern for this " +
                            "device's flavor written — or, where this run genuinely cannot observe the claim, say so " +
                            'in the check\'s "accepted" field.',
                    );
                }
                if (uncheckedSteps.length > 0) {
                    gaps.push(
                        `Step${uncheckedSteps.length === 1 ? "" : "s"} ${uncheckedSteps.join(", ")} ended without ` +
                            "recording any check. Record what the step established, such as the node a " +
                            "commissioning assigned or the device's own line confirming it.",
                    );
                }
                unproven = true;
                failed = true;
                failure = new Error(`Cert test ${tc}: the run proved less than its steps claim. ${gaps.join(" ")}`);
            }

            // Last, so the outcome handed over is the one this method is about to report. The record
            // states no verdict until here, and a run that cannot get this far leaves one saying so.
            try {
                await recorder.concludeRun?.({
                    failed,
                    detail: failed ? errorText(failure) : undefined,
                    unproven,
                    frameworkError,
                });
            } catch (e) {
                if (failed) {
                    console.warn("Cert test could not settle its evidence record after a failure:", e);
                } else {
                    failed = true;
                    failure = e;
                }
            }
        }

        if (failed) {
            throw failure;
        }

        if (controllerUnsupportedSkips > 0) {
            throw new CertControllerGapError(
                `Cert test ${tc}: ${controllerUnsupportedSkips} step${controllerUnsupportedSkips === 1 ? "" : "s"} ` +
                    "skipped for a gap of the controller, so the plan did not run in full",
            );
        }
    }

    /**
     * Closes whatever this run opened, returning what refused to close. A close failure means state is
     * left on the TH for the next run in this process, so {@link invoke} fails the run over it — unless
     * the run failed on its own account, which keeps precedence.
     */
    protected async teardown(): Promise<unknown[]> {
        return [];
    }

    /**
     * The flavor this run's steps gate on. Derived from the devices by default; a run that knows its
     * own flavor overrides this, since the devices are only as authoritative as whatever built them.
     */
    protected flavorFor(devices: Record<string, CertDevice>): DeviceFlavor | undefined {
        return currentFlavor(devices);
    }

    /**
     * Build the step context for a run.  Overridable so controller/device wiring can be layered on in
     * later tasks without changing {@link invoke}'s public contract.
     */
    protected contextFor(_subject: Subject): CertStepWiring {
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
     *
     * A throw fails the run, since the bundle's checks cite what this attaches.
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
 * The value of a step's {@link CertStepSetting} for this run. A function that answers with a blank reason is a defect
 * of the declaration, as a blank string is at declaration time, since the step would be skipped with nothing to say
 * why.
 */
function settingFor(
    stepDef: CertStepDefinition,
    name: "notApplicable" | "longRunning",
    setup: CertRunSetup,
): string | undefined {
    const setting = stepDef[name];
    const value = typeof setting === "function" ? setting(setup) : setting;
    if (typeof setting === "function" && value !== undefined && value.trim() === "") {
        throw new CertFrameworkError(`Cert step ${stepDef.number} decided its "${name}" option with a blank reason`);
    }
    return value;
}

/** Whether this run asked for the steps that cost minutes of real time. */
export function longRunningEnabled() {
    const value = env.MATTER_CERT_LONG_RUNNING;
    return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
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

/**
 * Thrown by {@link CertStepContext.picsMet} in a run with no active PICS, which fails the step.
 *
 * Its own type rather than {@link PicsUnavailableError}, which means the opposite to its catchers:
 * that gating is inactive and the step may run. A plain `Error` because `packages/testing` carries no
 * dependency on the library and therefore no `MatterError`.
 */
export class PicsUnansweredError extends Error {}

/**
 * Thrown by a step that finds, from what this run observes, that the plan does not apply it here — the run-time
 * counterpart of {@link CertStepOptions.notApplicable}, for a plan that branches on a device's capability or on the
 * transport of the DUT's session to it.
 * The engine records the step as skipped with the message as its reason, provided the step has recorded no check and
 * made no controller call that may change the device; a step that throws it after either fails the run, because it did
 * act.
 *
 * A plain `Error` because `packages/testing` carries no dependency on the library and therefore no `MatterError`.
 */
export class CertStepNotApplicableError extends Error {}

/**
 * Thrown by a step run that reached a defect of the framework or of a declaration rather than an outcome of the device
 * (see {@link StepVerdict}'s `"error"`).
 *
 * A plain `Error` because `packages/testing` carries no dependency on the library and therefore no `MatterError`.
 */
export class CertFrameworkError extends Error {}

/**
 * Thrown by a run that failed no step but skipped at least one for a gap of the controller under test. Every step of
 * a plan has to run for the plan to pass, so the runner reports such a run as skipped rather than passed; the
 * evidence settles it as `"controller-gap"`.
 *
 * A plain `Error` because `packages/testing` carries no dependency on the library and therefore no `MatterError`.
 */
export class CertControllerGapError extends Error {}

/**
 * The framework error for a refusal of `capability` that reached the step runner. A step or test case that declares
 * the capability is skipped before it runs wherever the controller lacks it, so the refusal means either the
 * declaration is missing or the implementation refuses a capability it declares neither as a gap nor out of scope.
 */
function undeclaredRefusal(
    tc: string,
    stepDef: CertStepDefinition,
    definition: CertTestDefinition,
    refusal: UnsupportedByControllerError,
): CertFrameworkError {
    const { capability } = refusal;
    const declared =
        stepDef.controllerCapabilities?.includes(capability) ||
        definition.controllerCapabilities?.includes(capability) ||
        capabilitiesFor({ transport: definition.transport }).includes(capability);
    const cause = declared
        ? `controller "${refusal.controller}" refused ${capability}, which its registration declares neither as a gap nor out of scope`
        : `the step needs ${capability} and neither it nor its test case declares it`;
    return new CertFrameworkError(`Cert test ${tc} step ${stepDef.number}: ${cause}. Refusal: ${refusal.message}`);
}

/**
 * {@link CertStepContext.picsMet}. Unlike a gate it cannot treat a missing PICS file as "met": a step
 * asking which outcome it is owed would then be owed both `X` and `!X`.
 */
function picsAnswer(expression: string, picsFile: PicsFile | undefined): boolean {
    const parsed = new PicsExpression(expression);
    if (!picsFile) {
        throw new PicsUnansweredError(`No active PICS answers "${expression}" for this step`);
    }

    return parsed.evaluate(picsFile);
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

/**
 * Persists a run-level summary and then announces it. In that order and in separate attempts: the
 * count is what a bundle with no attached logs has, so a banner that cannot be written must not cost
 * it.
 */
function recordSummary(record: () => void, announce: () => void, what: string): void {
    try {
        record();
    } catch (e) {
        console.warn(`Cert test ${what} summary could not be recorded:`, e);
    }
    try {
        announce();
    } catch (e) {
        console.warn(`Cert test ${what} summary could not be announced:`, e);
    }
}

function announceControllerSkipSummary(cx: CertStepContext, tc: string, count: number): void {
    announceStep(cx, [
        STEP_BANNER_RULE,
        `${tc} — ${count} step${count === 1 ? "" : "s"} skipped as unsupported by the controller`,
        STEP_BANNER_RULE,
    ]);
}

function announcePicsSkipSummary(cx: CertStepContext, tc: string, count: number): void {
    announceStep(cx, [
        STEP_BANNER_RULE,
        `${tc} — ${count} step${count === 1 ? "" : "s"} skipped by their own PICS`,
        STEP_BANNER_RULE,
    ]);
}

function announceLongRunningSkipSummary(cx: CertStepContext, tc: string, count: number): void {
    announceStep(cx, [
        STEP_BANNER_RULE,
        `${tc} — ${count} step${count === 1 ? "" : "s"} skipped for costing minutes on this flavor`,
        STEP_BANNER_RULE,
    ]);
}

function announcePlanConditionSkipSummary(cx: CertStepContext, tc: string, count: number): void {
    announceStep(cx, [
        STEP_BANNER_RULE,
        `${tc} — ${count} step${count === 1 ? "" : "s"} skipped by a condition of the plan for these devices`,
        STEP_BANNER_RULE,
    ]);
}

function announceOutOfScopeSkipSummary(cx: CertStepContext, tc: string, count: number): void {
    announceStep(cx, [
        STEP_BANNER_RULE,
        `${tc} — ${count} step${count === 1 ? "" : "s"} skipped as out of the controller's scope`,
        STEP_BANNER_RULE,
    ]);
}

function announceUnverifiedSummary(cx: CertStepContext, tc: string, count: number): void {
    announceStep(cx, [
        STEP_BANNER_RULE,
        `${tc} — ${count} check${count === 1 ? "" : "s"} could not be verified`,
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
    deviceExit: Promise<DeviceExit>,
    tc: string,
    timeoutMs: number,
): Promise<void> {
    const run = finalize(cx);
    const timeout = delay(timeoutMs);

    let outcome: "done" | "timeout" | { exited: DeviceExit };
    try {
        outcome = await Promise.race([
            run.then((): "done" => "done"),
            deviceExit.then(exited => ({ exited })),
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
        outcome === "timeout"
            ? `Cert test ${tc}: cleanup did not finish within ${timeoutMs}ms`
            : `Cert test ${tc}: device "${outcome.exited.role}" exited before the run's cleanup finished`,
    );
}

function announceFinalizationFailure(cx: CertStepContext, tc: string, e: unknown): void {
    announceStep(cx, [STEP_BANNER_RULE, `${tc} — Finalization: FAIL`, errorText(e), STEP_BANNER_RULE]);
}

/**
 * One evidence line for `check`. The verdict leads, since a reader of the log excerpt has nothing
 * else to tell a failed check from a passing one; a device-log check names its pattern and match, and
 * every check that carries a detail says it — that is where a failed log check puts its reason.
 */
function formatCheckLine(check: CheckRecord): string {
    const parts = new Array<string>();

    if (check.type === "device-log") {
        parts.push(`pattern=${check.pattern ?? "(none)"}`, `matched=${check.matched ?? "(none)"}`);
    }

    if (check.detail !== undefined) {
        parts.push(check.detail);
    }

    return `${check.verdict}: ${parts.length === 0 ? "(no detail)" : parts.join(" ")}`;
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
 * A device exit with the role that identifies which device it was — the run declares devices by role,
 * so an exit that names none cannot be attributed to a binary in a run that declares several.
 */
interface DeviceExit {
    role: string;
    info: DeviceExitInfo;
}

/**
 * A {@link watchDeviceExits} subscription: `exit` resolves the same way every time (first device to
 * exit wins), but the reaction that reports it to `recorder` must be {@link disarm}ed once the run is
 * done with it.
 */
interface DeviceExitWatch {
    exit: Promise<DeviceExit>;
    /**
     * The exit observed while the watch was armed, if any. A device exit can settle outside any
     * step race (all steps skipped, or after the last step) — {@link CertTest.invoke} checks this
     * after the step loop so such a run still rejects instead of reporting success while the
     * evidence says fail.
     */
    readonly observed: DeviceExit | undefined;
    /**
     * Drops the watch's reference to `recorder`. A matterjs device's `exit` never resolves, so
     * without this the reaction below stays attached to it for the process's lifetime, keeping
     * `recorder` (and the evidence/log history it holds for this one run) reachable indefinitely.
     */
    disarm(): void;
}

/**
 * Races every device's {@link CertDevice.exit} against the run and reports the first one that
 * settles to `recorder`. {@link CertDevice.exit} settles only for an exit the harness did not ask
 * for, so a resolution here means the device died independently of anything the test asked it to do.
 */
function watchDeviceExits(devices: Record<string, CertDevice>, recorder: StepRecorder): DeviceExitWatch {
    let observed: DeviceExit | undefined;
    let onExit: ((exit: DeviceExit) => void) | undefined = ({ role, info }) => recorder.deviceExited?.(role, info);
    const exit = Promise.race(
        Object.entries(devices).map(async ([role, device]): Promise<DeviceExit> => ({ role, info: await device.exit })),
    );

    void exit.then(exited => {
        if (onExit === undefined) {
            return;
        }
        observed = exited;
        try {
            onExit(exited);
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
async function raceAgainstDeviceExit<T>(
    stepRun: Promise<T>,
    deviceExit: Promise<DeviceExit>,
    tc: string,
    step: number | string,
): Promise<T> {
    const outcome = await Promise.race([
        stepRun.then(value => ({ value })),
        deviceExit.then(({ role }) => ({ exitedRole: role })),
    ]);
    if ("exitedRole" in outcome) {
        const { exitedRole } = outcome;
        // stepRun keeps running independently of this race and settles on its own time; observe
        // its eventual rejection so it can't surface as an unhandled rejection attributed to
        // whatever runs later, without trying to cancel the operation itself.
        void stepRun.catch(e => {
            console.warn(`Cert test ${tc} step ${step}: orphaned step run settled after the device exit:`, e);
        });
        throw new Error(`Cert-test device "${exitedRole}" exited unexpectedly while a step was running`);
    }
    return outcome.value;
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
