/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subject } from "../../device/subject.js";
import { BaseTest } from "../../device/test.js";
import type { Container } from "../../docker/container.js";
import { TestFileDescriptor } from "../../test-descriptor.js";
import { PicsExpression } from "../pics/expression.js";
import type { PicsFile } from "../pics/file.js";
import { CertStepContext, CertStepDefinition, CertTestDefinition, StepRecorder } from "./cert-context.js";

const inertRecorder: StepRecorder = {
    beginStep() {},
    check() {},
    endStep() {},
    async flush() {},
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
        const { recorder } = cx;
        const picsFile = resolvePicsFile(subject);

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
                    if (!stepPicsMet(stepDef, picsFile)) {
                        recorder.endStep(stepDef, "skipped");
                        continue;
                    }

                    step(`Test Step ${stepDef.number}: ${stepDef.text}`);
                    recorder.beginStep(stepDef);

                    await stepDef.run(cx);
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
 * A malformed step PICS expression, evaluated against a PICS file that *is* available, is a step-level
 * failure — unlike a missing PICS file (see {@link resolvePicsFile}), the expression itself is broken.
 */
function stepPicsMet(stepDef: CertStepDefinition, picsFile: PicsFile | undefined): boolean {
    if (stepDef.pics === undefined || !picsFile) {
        return true;
    }

    return new PicsExpression(stepDef.pics).evaluate(picsFile);
}
