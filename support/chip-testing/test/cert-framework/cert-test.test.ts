/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import type {
    CertDevice,
    CertNodeApi,
    CertStepContext,
    CertTestDefinition,
    CheckRecord,
    Container,
    ControllerAdapter,
    DeviceExitInfo,
    Docker,
    StepRecorder,
    StepVerdict,
    Subject,
    TestFileDescriptor,
} from "@matter/testing";
import {
    CertTest,
    LogFollower,
    PicsFile,
    PicsUnavailableError,
    unmetTestPics,
    UnsupportedByControllerError,
} from "@matter/testing";
import { env } from "node:process";
import { CommissionedRefs } from "../cert/tc-support.js";

async function notImplemented(..._args: unknown[]): Promise<never> {
    throw new Error("Container access is not available in this unit test");
}

// `docker.ts` pulls in dockerode, which isn't browser-bundleable; importing it only as a type
// keeps this suite's web run out of that dependency graph. `Docker` also carries an ECMAScript
// private field, so a stub object can't otherwise satisfy the type structurally.
const stubDocker = {} as Docker;

function stubContainer(): Container {
    return {
        docker: stubDocker,
        image: Promise.resolve({ inspect: notImplemented }),
        start: notImplemented,
        kill: notImplemented,
        remove: notImplemented,
        attach: notImplemented,
        wait: notImplemented,
        exec: notImplemented,
        read: notImplemented,
        follow: notImplemented,
        execAndRead: notImplemented,
        write: notImplemented,
        delete: notImplemented,
        edit: notImplemented,
        resolveGlob: notImplemented,
        createPipe: notImplemented,
    };
}

function stubDescriptor(): TestFileDescriptor {
    return {
        name: "TC-CADMIN-1.17",
        kind: "cert",
        path: "test/cert/fixtures/TC-CADMIN-1.17.adoc",
    };
}

function stubRecorder(overrides: Partial<StepRecorder> = {}): StepRecorder {
    return {
        beginStep() {},
        check() {},
        endStep() {
            return [];
        },
        async flush() {
            return "";
        },
        ...overrides,
    };
}

/** A {@link stubRecorder} whose `endStep` returns whatever `check()` recorded since the last `endStep`. */
function recordingRecorder(): StepRecorder {
    let checks = new Array<CheckRecord>();
    return stubRecorder({
        check(record) {
            checks.push(record);
        },
        endStep() {
            const recorded = checks;
            checks = [];
            return recorded;
        },
    });
}

function stubSubject(pics: PicsFile): Subject {
    return {
        id: "stub",
        app: "all-clusters",
        commissioning: {
            kind: "on-network",
            passcode: 20202021,
            discriminator: 3840,
            qrPairingCode: "",
        },
        pics,
        async initialize() {},
        async start() {},
        async stop() {},
        async close() {},
        async snapshot() {
            return {};
        },
        async restore() {},
        async backchannel() {},
    };
}

function stubSubjectWithThrowingPics(error: Error): Subject {
    return {
        ...stubSubject(new PicsFile([])),
        get pics(): PicsFile {
            throw error;
        },
    };
}

async function* noLines(): AsyncGenerator<string> {}

function stubCertDevice(exit: Promise<DeviceExitInfo>): CertDevice {
    return {
        ...stubSubject(new PicsFile([])),
        flavor: "matterjs",
        log: new LogFollower(noLines(), "stub-device"),
        exit,
    };
}

function stubControllerAdapter(log: LogFollower): ControllerAdapter {
    return {
        id: "dut",
        log,
        async start() {},
        async close() {},
        async parseQrPayload(): Promise<never> {
            throw new InternalError("not used in this test");
        },
        async parseManualPairingCode(): Promise<never> {
            throw new InternalError("not used in this test");
        },
        async commission() {
            return "ref";
        },
        node() {
            throw new Error("not implemented in this test");
        },
    };
}

function stubSubjectWithoutPics(): Subject {
    return {
        ...stubSubject(new PicsFile([])),
        // Subject.pics is typed as a required PicsFile, but a real implementation's accessor can still
        // resolve to nothing at runtime (e.g. an unset factory override) — model that case directly.
        pics: undefined as unknown as PicsFile,
    };
}

/**
 * Injects a stub {@link CertStepContext} without wiring the real controller/device plumbing later tasks add.
 */
class TestCertTest extends CertTest {
    #cx: CertStepContext;
    #finalizationTimeoutMs?: number;

    constructor(
        definition: CertTestDefinition,
        descriptor: TestFileDescriptor,
        container: Container,
        cx: CertStepContext,
        finalizationTimeoutMs?: number,
    ) {
        super(definition, descriptor, container);
        this.#cx = cx;
        this.#finalizationTimeoutMs = finalizationTimeoutMs;
    }

    protected override contextFor(_subject: Subject): CertStepContext {
        return this.#cx;
    }

    protected override get finalizationTimeoutMs(): number {
        return this.#finalizationTimeoutMs ?? super.finalizationTimeoutMs;
    }
}

describe("CertTest", () => {
    it("evaluates step PICS at run time, aborts remaining steps on failure, and always flushes evidence", async () => {
        const ran = { step1: false, step2: false, step3: false };

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step one text",
                    run: async () => {
                        ran.step1 = true;
                    },
                },
                {
                    number: 2,
                    text: "Step two text",
                    pics: "CADMIN.S.UnmetToken",
                    run: async () => {
                        ran.step2 = true;
                    },
                },
                {
                    number: 3,
                    text: "Step three text",
                    run: async () => {
                        ran.step3 = true;
                        throw new Error("boom");
                    },
                },
            ],
        };

        const beginStepNumbers = new Array<number | string>();
        const endStepCalls = new Array<{ number: number | string; verdict: StepVerdict; skipReason?: string }>();
        let flushed = false;

        const recorder: StepRecorder = {
            beginStep(step) {
                beginStepNumbers.push(step.number);
            },
            check() {},
            endStep(step, verdict, skipReason) {
                endStepCalls.push({ number: step.number, verdict, skipReason });
                return [];
            },
            async flush() {
                flushed = true;
                return "";
            },
        };

        const cx: CertStepContext = { controllers: {}, devices: {}, recorder };
        const subject = stubSubject(new PicsFile([]));
        const reportedTitles = new Array<string>();

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await expect(test.invoke(subject, title => reportedTitles.push(title), [], false)).rejectedWith("boom");

        expect(reportedTitles).deep.equal(["Test Step 1: Step one text", "Test Step 3: Step three text"]);

        expect(ran).deep.equal({ step1: true, step2: false, step3: true });

        expect(beginStepNumbers).deep.equal([1, 3]);
        expect(endStepCalls).deep.equal([
            { number: 1, verdict: "pass", skipReason: undefined },
            { number: 2, verdict: "skipped", skipReason: 'PICS "CADMIN.S.UnmetToken" not met' },
            { number: 3, verdict: "fail", skipReason: undefined },
        ]);

        expect(flushed).equal(true);
    });

    it("does not let a flush failure mask a step failure, but still logs it", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Failing step",
                    run: async () => {
                        throw new Error("boom");
                    },
                },
            ],
        };

        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                async flush() {
                    throw new Error("flush blew up");
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        const warnings = new Array<unknown>();
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => warnings.push(args);
        try {
            await expect(test.invoke(subject, () => {}, [], false)).rejectedWith("boom");
        } finally {
            console.warn = originalWarn;
        }

        expect(warnings.length).equal(1);
    });

    it("surfaces a flush failure when no step failed", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Passing step",
                    run: async () => {},
                },
            ],
        };

        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                async flush() {
                    throw new Error("flush blew up");
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await expect(test.invoke(subject, () => {}, [], false)).rejectedWith("flush blew up");
    });

    it("runs a gated step (no fail, no skip) when Subject.pics throws PicsUnavailableError — no active PICS means every step's PICS is met", async () => {
        let ran = false;

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step gated on PICS",
                    pics: "CADMIN.S.SomeToken",
                    run: async () => {
                        ran = true;
                    },
                },
            ],
        };

        const endStepVerdicts = new Array<{ number: number | string; verdict: StepVerdict }>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                endStep(step, verdict) {
                    endStepVerdicts.push({ number: step.number, verdict });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubjectWithThrowingPics(new PicsUnavailableError("PICS not initialized"));

        await test.invoke(subject, () => {}, [], false);

        expect(ran).equal(true);
        expect(endStepVerdicts).deep.equal([{ number: 1, verdict: "pass" }]);
    });

    it("propagates a non-PicsUnavailableError from Subject.pics instead of treating it as 'no active PICS'", async () => {
        let ran = false;

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step that must not run",
                    run: async () => {
                        ran = true;
                    },
                },
            ],
        };

        const cx: CertStepContext = { controllers: {}, devices: {}, recorder: stubRecorder() };
        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubjectWithThrowingPics(new Error("PICS file is corrupt"));

        await expect(test.invoke(subject, () => {}, [], false)).rejectedWith("PICS file is corrupt");
        expect(ran).equal(false);
    });

    it("runs a gated step (no fail, no skip) when Subject.pics is undefined — no active PICS means every step's PICS is met", async () => {
        let ran = false;

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step gated on PICS",
                    pics: "CADMIN.S.SomeToken",
                    run: async () => {
                        ran = true;
                    },
                },
            ],
        };

        const endStepVerdicts = new Array<{ number: number | string; verdict: StepVerdict }>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                endStep(step, verdict) {
                    endStepVerdicts.push({ number: step.number, verdict });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubjectWithoutPics();

        await test.invoke(subject, () => {}, [], false);

        expect(ran).equal(true);
        expect(endStepVerdicts).deep.equal([{ number: 1, verdict: "pass" }]);
    });

    for (const [controller, expectation] of [
        ["matterjs", { ran: true, verdict: "pass" }],
        ["chip-tool", { ran: false, verdict: "skipped" }],
    ] as const) {
        it(`gates a step on what the ${controller} controller declares, over the device's own PICS`, async () => {
            const originalController = env.MATTER_CERT_CONTROLLER;
            env.MATTER_CERT_CONTROLLER = controller;

            let ran = false;

            const definition: CertTestDefinition = {
                tc: "TC-IDM-1.3",
                plan: "interactiondatamodel.adoc",
                pics: [],
                app: "all-clusters",
                steps: [
                    {
                        number: 1,
                        text: "Step gated on a capability only the controller can claim",
                        pics: "MCORE.IDM.C.InvokeRequest.BatchCommands",
                        run: async () => {
                            ran = true;
                        },
                    },
                ],
            };

            const endStepVerdicts = new Array<{ number: number | string; verdict: StepVerdict }>();
            const cx: CertStepContext = {
                controllers: {},
                devices: {},
                recorder: stubRecorder({
                    endStep(step, verdict) {
                        endStepVerdicts.push({ number: step.number, verdict });
                        return [];
                    },
                }),
            };

            const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

            // The device says nothing about the controller's own batch support, which is the point.
            const subject = stubSubject(new PicsFile(["MCORE.IDM.C=1"]));

            try {
                await test.invoke(subject, () => {}, [], false);
            } finally {
                if (originalController === undefined) {
                    delete env.MATTER_CERT_CONTROLLER;
                } else {
                    env.MATTER_CERT_CONTROLLER = originalController;
                }
            }

            expect(ran).equal(expectation.ran);
            expect(endStepVerdicts).deep.equal([{ number: 1, verdict: expectation.verdict }]);
        });
    }

    it("fails a step whose PICS expression is malformed, even though a PICS file is available", async () => {
        let ran = false;

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step with a broken PICS expression",
                    pics: "",
                    run: async () => {
                        ran = true;
                    },
                },
                {
                    number: 2,
                    text: "Step after the PICS-expression failure",
                    run: async () => {},
                },
            ],
        };

        const endStepVerdicts = new Array<{ number: number | string; verdict: StepVerdict }>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                endStep(step, verdict) {
                    endStepVerdicts.push({ number: step.number, verdict });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await expect(test.invoke(subject, () => {}, [], false)).rejectedWith("Invalid PICS expression");

        expect(ran).equal(false);
        expect(endStepVerdicts).deep.equal([
            { number: 1, verdict: "fail" },
            { number: 2, verdict: "aborted" },
        ]);
    });

    it("skips a step whose flavors list excludes the current run's device flavor", async () => {
        let step1Ran = false;
        let step2Ran = false;

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step restricted to chip flavors",
                    flavors: ["chip-docker", "chip-local"],
                    run: async () => {
                        step1Ran = true;
                    },
                },
                {
                    number: 2,
                    text: "Step that includes the current flavor",
                    flavors: ["matterjs"],
                    run: async () => {
                        step2Ran = true;
                    },
                },
            ],
        };

        const endStepCalls = new Array<{ number: number | string; verdict: StepVerdict; skipReason?: string }>();
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: stubCertDevice(new Promise<DeviceExitInfo>(() => {})) },
            recorder: stubRecorder({
                endStep(step, verdict, skipReason) {
                    endStepCalls.push({ number: step.number, verdict, skipReason });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        expect(step1Ran).equal(false);
        expect(step2Ran).equal(true);
        expect(endStepCalls).deep.equal([
            { number: 1, verdict: "skipped", skipReason: 'unsupported on device flavor "matterjs"' },
            { number: 2, verdict: "pass", skipReason: undefined },
        ]);
    });

    it("never runs a step declared not applicable, and records the reason ahead of any flavor or PICS gate", async () => {
        let step1Ran = false;
        let step2Ran = false;

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "A step CHIP's harness cannot execute",
                    notApplicable: "Out of Scope in CHIP's harness",
                    run: async () => {
                        step1Ran = true;
                    },
                },
                {
                    number: 2,
                    text: "A step that is also flavor-restricted and PICS-gated",
                    notApplicable: "No attribute of the required data type exists",
                    flavors: ["chip-docker"],
                    pics: "CADMIN.S.UnmetToken",
                    run: async () => {
                        step2Ran = true;
                    },
                },
            ],
        };

        const beginStepNumbers = new Array<number | string>();
        const endStepCalls = new Array<{ number: number | string; verdict: StepVerdict; skipReason?: string }>();
        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: stubRecorder({
                beginStep(step) {
                    beginStepNumbers.push(step.number);
                },
                endStep(step, verdict, skipReason) {
                    endStepCalls.push({ number: step.number, verdict, skipReason });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        const reportedTitles = new Array<string>();
        await test.invoke(subject, title => reportedTitles.push(title), [], false);

        expect(step1Ran).equal(false);
        expect(step2Ran).equal(false);
        expect(reportedTitles).deep.equal([]);
        expect(beginStepNumbers).deep.equal([]);
        expect(endStepCalls).deep.equal([
            { number: 1, verdict: "skipped", skipReason: "Out of Scope in CHIP's harness" },
            { number: 2, verdict: "skipped", skipReason: "No attribute of the required data type exists" },
        ]);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).deep.equal([
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: SKIPPED",
            "-".repeat(70),
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 2: SKIPPED",
            "-".repeat(70),
        ]);
    });

    it("records a not-applicable step's own reason even after an earlier step failed", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Failing step",
                    run: async () => {
                        throw new Error("boom");
                    },
                },
                {
                    number: 2,
                    text: "Step the plan itself declares untestable",
                    notApplicable: "Out of Scope in CHIP's harness",
                    run: async () => {},
                },
                {
                    number: 3,
                    text: "Step that would have run",
                    run: async () => {},
                },
            ],
        };

        const endStepCalls = new Array<{ number: number | string; verdict: StepVerdict; skipReason?: string }>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                endStep(step, verdict, skipReason) {
                    endStepCalls.push({ number: step.number, verdict, skipReason });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith("boom");

        expect(endStepCalls).deep.equal([
            { number: 1, verdict: "fail", skipReason: undefined },
            { number: 2, verdict: "skipped", skipReason: "Out of Scope in CHIP's harness" },
            { number: 3, verdict: "aborted", skipReason: undefined },
        ]);
    });

    it("runs finalize after a step whose PICS skipped it, and flushes evidence afterward", async () => {
        const order = new Array<string>();

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step gated on an unmet PICS",
                    pics: "CADMIN.S.UnmetToken",
                    run: async () => {
                        order.push("step1");
                    },
                },
            ],
            finalize: async () => {
                order.push("finalize");
            },
        };

        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                async flush() {
                    order.push("flush");
                    return "";
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await test.invoke(stubSubject(new PicsFile([])), () => {}, [], false);

        expect(order).deep.equal(["finalize", "flush"]);
    });

    it("fails the run and records the reason when finalize throws after passing steps", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [{ number: 1, text: "Passing step", run: async () => {} }],
            finalize: async () => {
                throw new Error("decommission failed");
            },
        };

        const finalizationFailures = new Array<string>();
        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: stubRecorder({
                finalizationFailed(detail) {
                    finalizationFailures.push(detail);
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith(
            "decommission failed",
        );

        expect(finalizationFailures).deep.equal(["decommission failed"]);
        expect(deviceLog.lines.filter(line => line.synthetic).map(line => line.text)).to.include(
            "TC-CADMIN-1.17 — Finalization: FAIL",
        );
    });

    it("keeps a step failure as the run's outcome when finalize also fails", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Failing step",
                    run: async () => {
                        throw new Error("boom");
                    },
                },
            ],
            finalize: async () => {
                throw new Error("decommission failed");
            },
        };

        const finalizationFailures = new Array<string>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                finalizationFailed(detail) {
                    finalizationFailures.push(detail);
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith("boom");

        expect(finalizationFailures).deep.equal(["decommission failed"]);
    });

    it("still decommissions a role via finalize when a step defers CommissionedRefs.clear() until its own evidence check confirms removal", async () => {
        // Mirrors TC-CADMIN-1.17 step 7: an invoke() resolving only proves the peer accepted the
        // interaction, not that the follow-up evidence (a device-log check here, standing in for
        // that TC's two) actually confirms what the invoke claimed. Surrendering the ref before that
        // evidence is in would leave `commissioned` believing nothing needs cleanup while the fabric
        // may still be live — this pins the fix: clear() must wait for the check, so a check failure
        // leaves the role for the finalizer.
        const decommissioned = new Array<string>();
        const commissioned = new CommissionedRefs<"dut">();

        function nodeFor(role: "dut"): CertNodeApi {
            const unused = () => Promise.reject(new Error("not used by this test"));
            return {
                invoke: unused,
                invokeBatch: unused,
                readAttribute: unused,
                readAttributes: unused,
                writeAttribute: unused,
                writeAttributes: unused,
                subscribe: unused,
                readEvents: unused,
                subscribeEvents: unused,
                openCommissioningWindow: unused,
                operationalMdnsInstanceName: unused,
                decommission: async () => void decommissioned.push(role),
            };
        }
        const noLines = async function* (): AsyncGenerator<string> {};
        const controller: ControllerAdapter = {
            id: "dut",
            log: new LogFollower(noLines(), "dut"),
            async start() {},
            async close() {},
            async commission() {
                return "ref-dut";
            },
            async parseQrPayload(): Promise<never> {
                throw new InternalError("not used in this test");
            },
            async parseManualPairingCode(): Promise<never> {
                throw new InternalError("not used in this test");
            },
            node: () => nodeFor("dut"),
        };

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 7,
                    text: "Step that only clears its ref once a check confirms the claimed effect",
                    run: async () => {
                        commissioned.set("dut", "ref-dut");
                        const evidenceConfirmedRemoval = false;
                        if (!evidenceConfirmedRemoval) {
                            throw new Error("evidence check failed");
                        }
                        commissioned.clear("dut");
                    },
                },
            ],
            finalize: cx => commissioned.decommissionAll(cx),
        };

        const cx: CertStepContext = { controllers: { dut: controller }, devices: {}, recorder: stubRecorder() };
        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith(
            "evidence check failed",
        );

        expect(decommissioned).deep.equal(["dut"]);
    });

    it("abandons cleanup that outlives its budget, so the evidence still gets flushed", async () => {
        let flushed = false;
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [{ number: 1, text: "Passing step", run: async () => {} }],
            finalize: () => new Promise<void>(() => {}),
        };

        const finalizationFailures = new Array<string>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                finalizationFailed(detail) {
                    finalizationFailures.push(detail);
                },
                async flush() {
                    flushed = true;
                    return "";
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx, 10);

        await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith(
            "cleanup did not finish within 10ms",
        );

        expect(finalizationFailures).to.have.lengthOf(1);
        expect(flushed).equal(true);
    });

    it("abandons cleanup when a device exits while it is running", async () => {
        let exitDevice!: (info: DeviceExitInfo) => void;
        const exitPromise = new Promise<DeviceExitInfo>(resolve => {
            exitDevice = resolve;
        });

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [{ number: 1, text: "Passing step", run: async () => {} }],
            finalize: () =>
                new Promise<void>(() => {
                    exitDevice({ code: 1, signal: null });
                }),
        };

        const cx: CertStepContext = {
            controllers: {},
            devices: { th: stubCertDevice(exitPromise) },
            recorder: stubRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith(
            "a device exited before the run's cleanup finished",
        );
    });

    it("contains an abandoned cleanup's eventual rejection instead of letting it escape unhandled", async () => {
        let rejectCleanup!: (e: unknown) => void;
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [{ number: 1, text: "Passing step", run: async () => {} }],
            finalize: () =>
                new Promise<void>((_, reject) => {
                    rejectCleanup = reject;
                }),
        };

        const cx: CertStepContext = { controllers: {}, devices: {}, recorder: stubRecorder() };
        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx, 10);

        const unhandled = new Array<unknown>();
        const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
        const originalWarn = console.warn;
        process.on("unhandledRejection", onUnhandledRejection);
        console.warn = () => {};
        try {
            await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith(
                "cleanup did not finish within 10ms",
            );

            rejectCleanup(new Error("teardown closed the controller out from under the abandoned cleanup"));

            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));
        } finally {
            process.off("unhandledRejection", onUnhandledRejection);
            console.warn = originalWarn;
        }

        expect(unhandled).deep.equal([]);
    });

    it("fails the run and reports deviceExited when a device exits mid-step", async () => {
        let exit!: (info: DeviceExitInfo) => void;
        const exitPromise = new Promise<DeviceExitInfo>(resolve => {
            exit = resolve;
        });

        let step2Ran = false;
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step that outlives its device",
                    run: () =>
                        new Promise<void>(resolve => {
                            // Device exits while this step is still awaiting its own work.
                            exit({ code: 1, signal: null });
                            setTimeout(resolve, 0);
                        }),
                },
                {
                    number: 2,
                    text: "Step that must not run after the device exited",
                    run: async () => {
                        step2Ran = true;
                    },
                },
            ],
        };

        const endStepVerdicts = new Array<{ number: number | string; verdict: StepVerdict }>();
        const deviceExitedCalls = new Array<DeviceExitInfo>();
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: stubCertDevice(exitPromise) },
            recorder: stubRecorder({
                endStep(step, verdict) {
                    endStepVerdicts.push({ number: step.number, verdict });
                    return [];
                },
                deviceExited(info) {
                    deviceExitedCalls.push(info);
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await expect(test.invoke(subject, () => {}, [], false)).rejectedWith(
            "device exited unexpectedly while a step was running",
        );

        expect(step2Ran).equal(false);
        expect(endStepVerdicts).deep.equal([
            { number: 1, verdict: "fail" },
            { number: 2, verdict: "aborted" },
        ]);
        expect(deviceExitedCalls).deep.equal([{ code: 1, signal: null }]);
    });

    it("contains an orphaned step run's eventual rejection instead of letting it escape unhandled", async () => {
        let exitDevice!: (info: DeviceExitInfo) => void;
        const exitPromise = new Promise<DeviceExitInfo>(resolve => {
            exitDevice = resolve;
        });

        let rejectStepRun!: (e: unknown) => void;
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step that outlives its device and rejects only after the run has moved on",
                    run: () =>
                        new Promise<void>((_, reject) => {
                            rejectStepRun = reject;
                            exitDevice({ code: 1, signal: null });
                        }),
                },
            ],
        };

        const cx: CertStepContext = {
            controllers: {},
            devices: { th: stubCertDevice(exitPromise) },
            recorder: stubRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        const unhandled = new Array<unknown>();
        const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
        process.on("unhandledRejection", onUnhandledRejection);
        try {
            await expect(test.invoke(subject, () => {}, [], false)).rejectedWith(
                "device exited unexpectedly while a step was running",
            );

            // The step's own run() promise is still pending here — it's the orphaned loser of the
            // race. Settle it only now, simulating teardown pulling the rug out from under it after
            // the run has already reported its outcome.
            rejectStepRun(new Error("teardown closed the controller out from under the orphaned step"));

            // Let the rejection's microtask queue drain so an unhandled rejection would have a
            // chance to surface if nothing were containing it.
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));
        } finally {
            process.off("unhandledRejection", onUnhandledRejection);
        }

        expect(unhandled).deep.equal([]);
    });

    it("rejects the run when a device exits after the last step completed, so the runner outcome matches the evidence", async () => {
        let exitDevice!: (info: DeviceExitInfo) => void;
        const exitPromise = new Promise<DeviceExitInfo>(resolve => {
            exitDevice = resolve;
        });

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step that completes before the device dies",
                    run: async () => {
                        // The device exits only after this step has already resolved — no step
                        // race is pending to observe it.
                        setTimeout(() => exitDevice({ code: 1, signal: null }), 0);
                    },
                },
            ],
        };

        const endStepVerdicts = new Array<{ number: number | string; verdict: StepVerdict }>();
        const deviceExitedCalls = new Array<DeviceExitInfo>();
        let flushed = false;
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: stubCertDevice(exitPromise) },
            recorder: stubRecorder({
                endStep(step, verdict) {
                    endStepVerdicts.push({ number: step.number, verdict });
                    return [];
                },
                deviceExited(info) {
                    deviceExitedCalls.push(info);
                },
                async flush() {
                    // Give the exit scheduled by step 1 time to settle before the run concludes,
                    // modeling a crash landing between the last step and the end of evidence flush.
                    await new Promise(resolve => setTimeout(resolve, 20));
                    flushed = true;
                    return "";
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await expect(test.invoke(subject, () => {}, [], false)).rejectedWith(
            "exited unexpectedly (code 1, signal null) during the run",
        );

        expect(endStepVerdicts).deep.equal([{ number: 1, verdict: "pass" }]);
        expect(deviceExitedCalls).deep.equal([{ code: 1, signal: null }]);
        expect(flushed).equal(true);
    });

    it("disarms the device-exit watch once invoke() finishes, so a later exit isn't reported to a finished run's recorder", async () => {
        let exitDevice!: (info: DeviceExitInfo) => void;
        const exitPromise = new Promise<DeviceExitInfo>(resolve => {
            exitDevice = resolve;
        });

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step that finishes before the device ever exits",
                    run: async () => {},
                },
            ],
        };

        const deviceExitedCalls = new Array<DeviceExitInfo>();
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: stubCertDevice(exitPromise) },
            recorder: stubRecorder({
                deviceExited(info) {
                    deviceExitedCalls.push(info);
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        // The device only exits after the run already finished (e.g. matterjs teardown killing it).
        exitDevice({ code: 0, signal: null });
        await Promise.resolve();
        await Promise.resolve();

        expect(deviceExitedCalls).deep.equal([]);
    });

    it("injects a step-boundary banner pair into every device's and controller's log for a step that runs", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step one text",
                    run: async () => {},
                },
            ],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const controllerLog = new LogFollower(noLines(), "controller");
        const cx: CertStepContext = {
            controllers: { dut: stubControllerAdapter(controllerLog) },
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: stubRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        for (const log of [deviceLog, controllerLog]) {
            const banners = log.lines.filter(line => line.synthetic).map(line => line.text);
            expect(banners).deep.equal([
                "-".repeat(70),
                "TC-CADMIN-1.17 — Test Step 1: Step one text",
                "-".repeat(70),
                "-".repeat(70),
                "TC-CADMIN-1.17 — Test Step 1: PASS",
                "-".repeat(70),
            ]);
        }
    });

    it("adds a step's single check as one unindexed line in the end banner", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step one text",
                    run: async cx => {
                        cx.recorder.check({ type: "response", verdict: "pass", detail: "single check detail" });
                    },
                },
            ],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: recordingRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).deep.equal([
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: Step one text",
            "-".repeat(70),
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: PASS",
            "pass: single check detail",
            "-".repeat(70),
        ]);
    });

    it("prefixes each line with its index when a step records more than one check, rendering device-log checks by pattern/matched", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step one text",
                    run: async cx => {
                        cx.recorder.check({
                            type: "device-log",
                            verdict: "pass",
                            pattern: "AttributePathIB {}",
                            matched: "raw log line",
                            logLine: 42,
                        });
                        cx.recorder.check({ type: "response", verdict: "pass", detail: "second check detail" });
                    },
                },
            ],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: recordingRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).deep.equal([
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: Step one text",
            "-".repeat(70),
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: PASS",
            "0: pass: pattern=AttributePathIB {} matched=raw log line",
            "1: pass: second check detail",
            "-".repeat(70),
        ]);
    });

    it("names the verdict and the reason of a failing device-log check in the banner", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-IDM-1.3",
            plan: "interactiondatamodel.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step one text",
                    run: async cx => {
                        cx.recorder.check({
                            type: "device-log",
                            verdict: "fail",
                            pattern: "two commands",
                            detail: "Timed out waiting for two commands",
                            logLine: 7,
                        });
                        throw new Error("step failed on its log check");
                    },
                },
            ],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: recordingRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith(
            "step failed on its log check",
        );

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).includes("fail: pattern=two commands matched=(none) Timed out waiting for two commands");
    });

    it("keeps the step's own error when reporting its failure throws", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-IDM-1.3",
            plan: "interactiondatamodel.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step one text",
                    run: async () => {
                        throw new Error("the step's own failure");
                    },
                },
            ],
        };

        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                endStep() {
                    throw new Error("reporting exploded");
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);

        await expect(test.invoke(stubSubject(new PicsFile([])), () => {}, [], false)).rejectedWith(
            "the step's own failure",
        );
    });

    it("records a step that throws UnsupportedByControllerError as skipped with a reason naming the operation and controller, and still runs later steps", async () => {
        let step2Ran = false;

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step whose controller cannot express the operation",
                    run: async () => {
                        throw new UnsupportedByControllerError("writeAttributes", "chip-tool");
                    },
                },
                {
                    number: 2,
                    text: "Step after the unsupported-operation skip",
                    run: async () => {
                        step2Ran = true;
                    },
                },
            ],
        };

        const endStepCalls = new Array<{ number: number | string; verdict: StepVerdict; skipReason?: string }>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                endStep(step, verdict, skipReason) {
                    endStepCalls.push({ number: step.number, verdict, skipReason });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        expect(step2Ran).equal(true);
        expect(endStepCalls).deep.equal([
            {
                number: 1,
                verdict: "skipped",
                skipReason: 'not implementable on controller "chip-tool": writeAttributes',
            },
            { number: 2, verdict: "pass", skipReason: undefined },
        ]);
    });

    it("still fails the step and aborts the run for a generic error, unlike UnsupportedByControllerError", async () => {
        let step2Ran = false;

        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step that throws a generic error",
                    run: async () => {
                        throw new Error("boom");
                    },
                },
                {
                    number: 2,
                    text: "Step that must not run after the failure",
                    run: async () => {
                        step2Ran = true;
                    },
                },
            ],
        };

        const endStepCalls = new Array<{ number: number | string; verdict: StepVerdict }>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                endStep(step, verdict) {
                    endStepCalls.push({ number: step.number, verdict });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await expect(test.invoke(subject, () => {}, [], false)).rejectedWith("boom");

        expect(step2Ran).equal(false);
        expect(endStepCalls).deep.equal([
            { number: 1, verdict: "fail" },
            { number: 2, verdict: "aborted" },
        ]);
    });

    it("appends UnsupportedByControllerError's detail to the skip reason when supplied", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step whose controller cannot express the operation, with detail",
                    run: async () => {
                        throw new UnsupportedByControllerError(
                            "readAttributes",
                            "chip-tool",
                            "spans more than one cluster",
                        );
                    },
                },
            ],
        };

        const endStepCalls = new Array<{ verdict: StepVerdict; skipReason?: string }>();
        const cx: CertStepContext = {
            controllers: {},
            devices: {},
            recorder: stubRecorder({
                endStep(_step, verdict, skipReason) {
                    endStepCalls.push({ verdict, skipReason });
                    return [];
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        expect(endStepCalls).deep.equal([
            {
                verdict: "skipped",
                skipReason: 'not implementable on controller "chip-tool": readAttributes — spans more than one cluster',
            },
        ]);
    });

    it("keeps a step's already-recorded checks, and the step's start banner, when it then throws UnsupportedByControllerError", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step that records a check before hitting an unsupported operation",
                    run: async cx => {
                        cx.recorder.check({ type: "response", verdict: "pass", detail: "read the data version" });
                        throw new UnsupportedByControllerError("writeAttributes", "chip-tool");
                    },
                },
            ],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: recordingRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).deep.equal([
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: Step that records a check before hitting an unsupported operation",
            "-".repeat(70),
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: SKIPPED",
            "pass: read the data version",
            "-".repeat(70),
            "-".repeat(70),
            "TC-CADMIN-1.17 — 1 step skipped as unsupported by the controller",
            "-".repeat(70),
        ]);
    });

    it("injects only an end banner (SKIPPED) for a step the flavor gate skips before it starts", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step restricted to chip flavors",
                    flavors: ["chip-docker"],
                    run: async () => {},
                },
            ],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: stubRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await test.invoke(subject, () => {}, [], false);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).deep.equal(["-".repeat(70), "TC-CADMIN-1.17 — Test Step 1: SKIPPED", "-".repeat(70)]);
    });

    it("emits the recorder's run header before the first step's own banner, and emits nothing when the recorder has no header to give", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [{ number: 1, text: "Step one text", run: async () => {} }],
        };

        const headerLines = [
            "===== TC-CADMIN-1.17 =====",
            "controller : chip-tool (dut)",
            "device     : matterjs:all-clusters",
        ];
        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: stubRecorder({ runHeaderLines: () => headerLines }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        await test.invoke(stubSubject(new PicsFile([])), () => {}, [], false);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).deep.equal([
            ...headerLines,
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: Step one text",
            "-".repeat(70),
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: PASS",
            "-".repeat(70),
        ]);
    });

    it("emits no header banner when the recorder implements no runHeaderLines hook", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [{ number: 1, text: "Step one text", run: async () => {} }],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: stubRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        await test.invoke(stubSubject(new PicsFile([])), () => {}, [], false);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).deep.equal([
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: Step one text",
            "-".repeat(70),
            "-".repeat(70),
            "TC-CADMIN-1.17 — Test Step 1: PASS",
            "-".repeat(70),
        ]);
    });

    it("reports a run-level summary line counting steps skipped as unsupported by the controller", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step whose controller cannot express the operation",
                    run: async () => {
                        throw new UnsupportedByControllerError("writeAttributes", "chip-tool");
                    },
                },
                {
                    number: 2,
                    text: "Another step whose controller cannot express the operation",
                    run: async () => {
                        throw new UnsupportedByControllerError("readAttributes", "chip-tool");
                    },
                },
                { number: 3, text: "Passing step", run: async () => {} },
            ],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: stubRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        await test.invoke(stubSubject(new PicsFile([])), () => {}, [], false);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners).to.include("TC-CADMIN-1.17 — 2 steps skipped as unsupported by the controller");
    });

    it("reports no controller-unsupported-skip summary line for a run that had none", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                { number: 1, text: "Passing step", run: async () => {} },
                {
                    number: 2,
                    text: "Step skipped for an unrelated reason",
                    pics: "CADMIN.S.UnmetToken",
                    run: async () => {},
                },
            ],
        };

        const deviceLog = new LogFollower(noLines(), "device");
        const cx: CertStepContext = {
            controllers: {},
            devices: { th: { ...stubCertDevice(new Promise<DeviceExitInfo>(() => {})), log: deviceLog } },
            recorder: stubRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        await test.invoke(stubSubject(new PicsFile([])), () => {}, [], false);

        const banners = deviceLog.lines.filter(line => line.synthetic).map(line => line.text);
        expect(banners.some(line => line.includes("skipped as unsupported by the controller"))).equal(false);
    });
});

describe("test-level PICS gate", () => {
    const originalController = env.MATTER_CERT_CONTROLLER;

    afterEach(() => {
        if (originalController === undefined) {
            delete env.MATTER_CERT_CONTROLLER;
        } else {
            env.MATTER_CERT_CONTROLLER = originalController;
        }
    });

    function definitionWith(pics: string[]): CertTestDefinition {
        return { tc: "TC-IDM-1.3", plan: "interactiondatamodel.adoc", pics, app: "all-clusters", steps: [] };
    }

    it("is met for a controller that declares the capability", () => {
        env.MATTER_CERT_CONTROLLER = "matterjs";

        expect(unmetTestPics(definitionWith(["MCORE.IDM.C.InvokeRequest.BatchCommands"]))).undefined;
    });

    it("is unmet for a controller that declares the capability absent", () => {
        env.MATTER_CERT_CONTROLLER = "chip-tool";

        expect(unmetTestPics(definitionWith(["MCORE.IDM.C.InvokeRequest.BatchCommands"]))).equal(
            "MCORE.IDM.C.InvokeRequest.BatchCommands",
        );
    });

    it("still reads the device's PICS for everything the controller says nothing about", () => {
        env.MATTER_CERT_CONTROLLER = "chip-tool";

        expect(unmetTestPics(definitionWith(["MCORE.IDM.C"]))).undefined;
        expect(unmetTestPics(definitionWith(["MCORE.IDM.C.NoSuchCapability"]))).equal("MCORE.IDM.C.NoSuchCapability");
    });

    it("is met for a test declaring no PICS at all", () => {
        expect(unmetTestPics(definitionWith([]))).undefined;
    });
});
