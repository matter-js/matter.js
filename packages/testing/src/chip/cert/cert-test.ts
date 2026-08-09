/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subject } from "../../device/subject.js";
import { BaseTest } from "../../device/test.js";
import type { Container } from "../../docker/container.js";
import { TestDescriptor, TestFileDescriptor } from "../../test-descriptor.js";
import { PicsExpression } from "../pics/expression.js";
import type { PicsFile } from "../pics/file.js";
import {
    CertDevice,
    CertStepContext,
    CertStepDefinition,
    CertTestDefinition,
    DeviceExitInfo,
    DeviceFlavor,
    StepRecorder,
} from "./cert-context.js";

const inertRecorder: StepRecorder = {
    beginStep() {},
    check() {},
    endStep() {},
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

        let aborted = false;
        let failure: unknown;
        let failed = false;

        try {
            for (const stepDef of this.#definition.steps) {
                if (aborted) {
                    recorder.endStep(stepDef, "aborted");
                    continue;
                }

                try {
                    if (stepDef.flavors?.length === 0) {
                        throw new Error(
                            `Step ${stepDef.number} declares an empty "flavors" list, which would skip it on ` +
                                "every flavor — omit the option instead if that's genuinely intended",
                        );
                    }

                    if (stepDef.flavors && flavor !== undefined && !stepDef.flavors.includes(flavor)) {
                        recorder.endStep(stepDef, "skipped", `unsupported on device flavor "${flavor}"`);
                        continue;
                    }

                    if (!stepPicsMet(stepDef, picsFile)) {
                        recorder.endStep(stepDef, "skipped", `PICS "${stepDef.pics}" not met`);
                        continue;
                    }

                    step(`Test Step ${stepDef.number}: ${stepDef.text}`);
                    recorder.beginStep(stepDef);

                    await raceAgainstDeviceExit(
                        stepDef.run(cx),
                        deviceExitWatch.exit,
                        this.#definition.tc,
                        stepDef.number,
                    );
                } catch (e) {
                    recorder.endStep(stepDef, "fail");
                    aborted = true;
                    failed = true;
                    failure = e;
                    continue;
                }

                recorder.endStep(stepDef, "pass");
            }
        } finally {
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
 * (e.g. the harness has no active PICS file yet) rather than return one. Failing to obtain a PICS file
 * means no PICS gating is active, not that the test failed — every step's PICS is then treated as met.
 */
function resolvePicsFile(subject: Subject): PicsFile | undefined {
    try {
        return subject.pics ?? undefined;
    } catch {
        return undefined;
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

/**
 * A {@link watchDeviceExits} subscription: `exit` resolves the same way every time (first device to
 * exit wins), but the reaction that reports it to `recorder` must be {@link disarm}ed once the run is
 * done with it.
 */
interface DeviceExitWatch {
    exit: Promise<DeviceExitInfo>;
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
    let onExit: ((info: DeviceExitInfo) => void) | undefined = info => recorder.deviceExited?.(info);
    const exit = Promise.race(Object.values(devices).map(device => device.exit));

    void exit.then(info => {
        try {
            onExit?.(info);
        } catch (e) {
            console.warn("Cert test deviceExited hook failed:", e);
        }
    });

    return {
        exit,
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
            console.debug(`Cert test ${tc} step ${step}: orphaned step run settled after the device exit:`, e);
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
