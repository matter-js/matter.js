/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
    CertDevice,
    CertStepContext,
    CertTestDefinition,
    DeviceExitInfo,
    StepRecorder,
    StepVerdict,
} from "../../src/chip/cert/cert-context.js";
import { CertTest } from "../../src/chip/cert/cert-test.js";
import { LogFollower } from "../../src/chip/cert/log-follower.js";
import { PicsFile } from "../../src/chip/pics/file.js";
import type { Subject } from "../../src/device/subject.js";
import type { Container } from "../../src/docker/container.js";
import type { Docker } from "../../src/docker/docker.js";
import type { TestFileDescriptor } from "../../src/test-descriptor.js";

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
        endStep() {},
        async flush() {
            return "";
        },
        ...overrides,
    };
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

function stubSubjectWithThrowingPics(): Subject {
    return {
        ...stubSubject(new PicsFile([])),
        get pics(): PicsFile {
            throw new Error("PICS not initialized");
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

    constructor(
        definition: CertTestDefinition,
        descriptor: TestFileDescriptor,
        container: Container,
        cx: CertStepContext,
    ) {
        super(definition, descriptor, container);
        this.#cx = cx;
    }

    protected override contextFor(_subject: Subject): CertStepContext {
        return this.#cx;
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

    it("runs a gated step (no fail, no skip) when Subject.pics throws — no active PICS means every step's PICS is met", async () => {
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
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubjectWithThrowingPics();

        await test.invoke(subject, () => {}, [], false);

        expect(ran).equal(true);
        expect(endStepVerdicts).deep.equal([{ number: 1, verdict: "pass" }]);
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
                },
            }),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubjectWithoutPics();

        await test.invoke(subject, () => {}, [], false);

        expect(ran).equal(true);
        expect(endStepVerdicts).deep.equal([{ number: 1, verdict: "pass" }]);
    });

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

    it("fails a step that declares an empty flavors list, rather than silently skipping it forever", async () => {
        const definition: CertTestDefinition = {
            tc: "TC-CADMIN-1.17",
            plan: "multiplefabrics.adoc",
            pics: [],
            app: "all-clusters",
            steps: [
                {
                    number: 1,
                    text: "Step with an empty flavors list",
                    flavors: [],
                    run: async () => {},
                },
            ],
        };

        const cx: CertStepContext = {
            controllers: {},
            devices: { th: stubCertDevice(new Promise<DeviceExitInfo>(() => {})) },
            recorder: stubRecorder(),
        };

        const test = new TestCertTest(definition, stubDescriptor(), stubContainer(), cx);
        const subject = stubSubject(new PicsFile([]));

        await expect(test.invoke(subject, () => {}, [], false)).rejectedWith('Step 1 declares an empty "flavors"');
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

    // `process` isn't available in the web bundle; this test's process-level unhandledRejection spy only
    // makes sense in a Node host.
    (typeof window === "undefined" ? it : it.skip)(
        "contains an orphaned step run's eventual rejection instead of letting it escape unhandled",
        async () => {
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
        },
    );

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
});
