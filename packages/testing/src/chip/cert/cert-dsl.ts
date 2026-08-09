/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "node:process";
import { promisify } from "node:util";
import type { Subject } from "../../device/subject.js";
import type { Container } from "../../docker/container.js";
import { Docker } from "../../docker/docker.js";
import { Image } from "../../docker/image.js";
import { afterOne, beforeOne } from "../../mocha.js";
import { TestFileDescriptor } from "../../test-descriptor.js";
import { chip } from "../chip.js";
import { State } from "../state.js";
import { chipImageBase, ChipDockerSubject, ChipLocalSubject, resolveChipLocalAppDir } from "./chip-app-subject.js";
import {
    CertDevice,
    CertDeviceFactory,
    CertStepContext,
    CertStepDefinition,
    CertTestDefinition,
    DeviceFlavor,
} from "./cert-context.js";
import { CertTest, registerCertTestFactory } from "./cert-test.js";
import { ControllerAdapter, createControllerAdapter } from "./controller-adapter.js";
import { resolveDeviceFlavor } from "./device-config.js";
import { EvidenceRecorder } from "./evidence.js";
import { matterJsCertSubjectFor } from "./matterjs-subject-registry.js";

const execFileAsync = promisify(execFile);

export interface CertTestOptions {
    plan: string;
    pics: string[];
    app: string;
    /** Role name → "dut" (device under test) or "helper" (auxiliary controller). Default: `{ dut: "dut" }`. */
    controllers?: Record<string, "dut" | "helper">;
    /** Role name → app name. Default: `{ th: options.app }`. */
    devices?: Record<string, string>;
}

export interface CertStepOptions {
    pics?: string;
    expected?: string;
    /**
     * Restricts this step to the listed device flavors — the minimal declaration mechanism for a TC
     * whose TH app lacks a cluster/command on some flavors (see `TC-ACT-3.2.test.ts`'s AGENTS.md
     * entry). Absent runs the step on every flavor, matching prior behavior.
     */
    flavors?: DeviceFlavor[];
}

export interface CertTestBuilder {
    step(
        number: number | string,
        text: string,
        run: (cx: CertStepContext) => Promise<void>,
        opts?: CertStepOptions,
    ): CertTestBuilder;
}

/**
 * Thrown by {@link certTest} when `options.devices` declares more than one device. Every device
 * flavor (`ChipDockerSubject`/`ChipLocalSubject`/the matterjs registry) currently starts every
 * device with the same hardcoded discriminator (3840), passcode (20202021), and operational port
 * — fine for one device per run, but two devices in the same run would advertise identical mDNS
 * commissionable records and (for chip flavors) contend for the same UDP port. Multi-device cert
 * tests need per-role discriminator/passcode/port assignment before this can work; until then this
 * throws instead of silently producing a flaky, ambiguous run.
 */
export class MultiDeviceUnsupportedError extends Error {
    constructor(tc: string, roles: string[]) {
        super(
            `certTest "${tc}" declares ${roles.length} devices (${roles.join(", ")}) via options.devices; ` +
                "every device flavor hardcodes discriminator 3840/passcode 20202021 (and, for chip flavors, " +
                "a fixed operational port), so more than one device in a single run collides on mDNS " +
                "advertisement and likely UDP port contention. Multi-device cert tests need per-role " +
                "discriminator/passcode/port assignment in the device flavors before this can be supported.",
        );
    }
}

/**
 * Declares a cert test. Registers a mocha `it()` for `tc` immediately (mirroring
 * `chip.ts`'s `defineTest`); the returned builder's `.step()` calls append to the step list that
 * `it()`'s test body reads once mocha actually runs it, so step declarations may continue after
 * this call returns.
 */
export function certTest(tc: string, options: CertTestOptions): CertTestBuilder {
    const controllerRoles = options.controllers ?? { dut: "dut" };
    const deviceRoles = options.devices ?? { th: options.app };

    const deviceRoleNames = Object.keys(deviceRoles);
    if (deviceRoleNames.length > 1) {
        throw new MultiDeviceUnsupportedError(tc, deviceRoleNames);
    }

    const definition: CertTestDefinition = {
        tc,
        plan: options.plan,
        pics: options.pics,
        app: options.app,
        steps: new Array<CertStepDefinition>(),
    };

    const descriptor: TestFileDescriptor = {
        kind: "cert",
        name: tc,
        path: tc,
        app: options.app,
        pics: options.pics.length ? options.pics.join(" && ") : undefined,
    };

    defineCertTest(descriptor, definition, controllerRoles, deviceRoles);

    const builder: CertTestBuilder = {
        step(number, text, run, opts) {
            definition.steps.push({
                number,
                text,
                run,
                pics: opts?.pics,
                expected: opts?.expected,
                flavors: opts?.flavors,
            });
            return builder;
        },
    };

    return builder;
}

function primaryDeviceRole(deviceRoles: Record<string, string>, app: string): string {
    for (const [role, roleApp] of Object.entries(deviceRoles)) {
        if (roleApp === app) {
            return role;
        }
    }
    throw new Error(`certTest options.devices has no role for app "${app}" (the app the harness activates)`);
}

function subjectFactoryFor(flavor: DeviceFlavor, app: string): CertDeviceFactory {
    switch (flavor) {
        case "chip-docker":
            return ChipDockerSubject(app);

        case "chip-local":
            return ChipLocalSubject(app);

        case "matterjs": {
            const factory = matterJsCertSubjectFor(app);
            if (!factory) {
                throw new Error(
                    `No matterjs cert subject registered for app "${app}"; a consumer (e.g. ` +
                        `support/chip-testing/src/cert/index.ts) must call registerMatterJsCertSubject(...) first`,
                );
            }
            return factory;
        }
    }
}

/**
 * Registers the mocha test for `descriptor`, mirroring `chip.ts`'s `defineTest` (`it()` body only
 * calls `State.run`; activation/deactivation happen in `beforeOne`/`afterOne` so a failure there
 * doesn't read as a failure of the test itself).
 *
 * Cert devices always start uncommissioned (`startCommissioned = false`): a step commissions
 * explicitly via `cx.controllers`, so the harness must hand it a factory-reset device, not a cached
 * paired one.
 *
 * Wraps the `it()` in its own `describe()` rather than registering it at whatever level `certTest()`
 * was called from. `mocha.ts`'s `instrumentSuites` only attaches the per-suite `Boot.reboot`/`Boot.reset`
 * hooks to direct children of the root suite — a test registered straight on the root suite (no
 * enclosing `describe`) never gets them. Without them, a mock/global-state reset a *different* file's
 * test depends on can go missing, and that shows up as an unrelated test hanging, not as a failure in
 * the cert test itself (observed empirically: running this file's test alongside another cert-free
 * suite stalled the other suite's teardown for a full 30s mocha timeout).
 */
function defineCertTest(
    descriptor: TestFileDescriptor,
    definition: CertTestDefinition,
    controllerRoles: Record<string, "dut" | "helper">,
    deviceRoles: Record<string, string>,
) {
    describe(descriptor.name, () => {
        const flavor = resolveDeviceFlavor();
        const primaryRole = primaryDeviceRole(deviceRoles, definition.app);
        const factory = subjectFactoryFor(flavor, definition.app);

        registerCertTestFactory(
            descriptor,
            () =>
                new WiredCertTest(
                    definition,
                    descriptor,
                    State.container,
                    flavor,
                    primaryRole,
                    controllerRoles,
                    deviceRoles,
                ),
        );

        State.install();
        const test = chip.testFor(descriptor);

        const mochaTest = it(descriptor.name, function () {
            this.timeout(descriptor.timeoutMs ?? chip.defaultTimeoutMs);
            return State.run(test, [], async () => {});
        });

        beforeOne(mochaTest, async function () {
            await State.activateSubject(factory, false, test);
        });

        mochaTest.descriptor = test.descriptor;

        afterOne(mochaTest, State.deactivateSubject);
    });
}

let matterJsCommitPromise: Promise<string> | undefined;

/** Computed once per process and cached; every cert test run in this process shares one value. */
function matterJsCommit(): Promise<string> {
    matterJsCommitPromise ??= execFileAsync("git", ["rev-parse", "HEAD"])
        .then(({ stdout }) => stdout.trim())
        .catch(() => "(unknown)");
    return matterJsCommitPromise;
}

/** Best-effort: a missing image/marker/label means no chip ref is available, not a test failure. */
async function chipRefFor(flavor: DeviceFlavor, app: string): Promise<string | undefined> {
    try {
        switch (flavor) {
            case "chip-docker":
                return await chipDockerImageRevision(app);
            case "chip-local":
                return await chipLocalMarkerRevision();
            case "matterjs":
                return undefined;
        }
    } catch {
        return undefined;
    }
}

async function chipDockerImageRevision(app: string): Promise<string | undefined> {
    const docker = new Docker();
    const image = Image(docker, `${chipImageBase()}-${app}:latest`);
    const info = await image.inspect();
    return info.Config.Labels?.["org.opencontainers.image.revision"];
}

async function chipLocalMarkerRevision(): Promise<string | undefined> {
    const dir = await resolveChipLocalAppDir();
    const text = await readFile(join(dir, "CHIP_REF"), "utf-8");
    const trimmed = text.trim();
    return trimmed === "" ? undefined : trimmed;
}

/**
 * Where {@link EvidenceRecorder} writes evidence. This module is generic (no knowledge of
 * `support/chip-testing`'s own directory layout), so the registering package controls the location
 * via `MATTER_CERT_EVIDENCE_DIR`; `support/chip-testing/src/cert/index.ts` sets a default pointing at
 * its own `build/cert-evidence` before any cert test runs.
 */
function evidenceOutDir(): string {
    return env.MATTER_CERT_EVIDENCE_DIR || join(process.cwd(), "cert-evidence");
}

/**
 * `CertTest.invoke`'s `subject` parameter is typed as the generic `Subject` (shared with
 * PythonTest/YamlTest), but a cert test's primary device always comes from `subjectFactoryFor()`, so
 * it's actually a {@link CertDevice} at runtime. Narrows without a cast.
 */
function isCertDevice(subject: Subject): subject is CertDevice {
    return "flavor" in subject && "log" in subject && "exit" in subject;
}

/**
 * Wires a {@link CertTest} to real controllers and devices, built fresh for each run and closed once
 * it finishes (success, failure, or a device exiting). `contextFor` itself stays synchronous (the
 * signature `CertTest.invoke` expects); the async setup/teardown wraps `super.invoke()` instead.
 */
class WiredCertTest extends CertTest {
    #flavor: DeviceFlavor;
    #primaryRole: string;
    #controllerRoles: Record<string, "dut" | "helper">;
    #deviceRoles: Record<string, string>;
    #cx?: CertStepContext;
    #extraDevices = new Array<CertDevice>();
    #recorder?: EvidenceRecorder;

    constructor(
        definition: CertTestDefinition,
        descriptor: TestFileDescriptor,
        container: Container,
        flavor: DeviceFlavor,
        primaryRole: string,
        controllerRoles: Record<string, "dut" | "helper">,
        deviceRoles: Record<string, string>,
    ) {
        super(definition, descriptor, container);
        this.#flavor = flavor;
        this.#primaryRole = primaryRole;
        this.#controllerRoles = controllerRoles;
        this.#deviceRoles = deviceRoles;
    }

    override async invoke(
        subject: Subject,
        step: (title: string) => void,
        args: string[],
        uncommissioned: boolean,
    ): Promise<void> {
        const cx = await this.#buildContext(subject);
        this.#cx = cx;
        try {
            await super.invoke(subject, step, args, uncommissioned);
        } finally {
            this.#cx = undefined;
            await this.#teardown(cx.controllers);
        }
    }

    protected override contextFor(_subject: Subject): CertStepContext {
        if (!this.#cx) {
            throw new Error("WiredCertTest.contextFor() called outside invoke()");
        }
        return this.#cx;
    }

    async #buildContext(subject: Subject): Promise<CertStepContext> {
        if (!isCertDevice(subject)) {
            throw new Error(
                `Cert-test subject for "${this.descriptor.name}" does not implement CertDevice ` +
                    "(missing log/flavor/exit) — its Subject.Factory must come from subjectFactoryFor()",
            );
        }

        const devices: Record<string, CertDevice> = { [this.#primaryRole]: subject };
        const extra = new Array<CertDevice>();
        const controllers: Record<string, ControllerAdapter> = {};

        // A failure partway through must still close whatever this loop already started —
        // `invoke()`'s own finally only runs #teardown once #buildContext has returned successfully.
        try {
            for (const [role, app] of Object.entries(this.#deviceRoles)) {
                if (role === this.#primaryRole) {
                    continue;
                }
                const factory = subjectFactoryFor(this.#flavor, app);
                const device = factory(`${this.descriptor.name}-${role}`);
                extra.push(device);
                await device.initialize();
                await device.start();
                devices[role] = device;
            }

            for (const name of Object.keys(this.#controllerRoles)) {
                const controller = createControllerAdapter(name);
                controllers[name] = controller;
                await controller.start();
            }
        } catch (e) {
            this.#extraDevices = extra;
            await this.#teardown(controllers);
            throw e;
        }

        const [matterJsRef, chipRef] = await Promise.all([
            matterJsCommit(),
            chipRefFor(this.#flavor, this.definition.app),
        ]);

        const recorder = new EvidenceRecorder(evidenceOutDir(), {
            tc: this.definition.tc,
            plan: this.definition.plan,
            timestamp: new Date().toISOString(),
            controller: Object.keys(this.#controllerRoles).join(","),
            device: `${this.#flavor}:${this.definition.app}`,
            matterJsCommit: matterJsRef,
            chipRef,
        });

        this.#extraDevices = extra;
        this.#recorder = recorder;

        return { controllers, devices, recorder };
    }

    /**
     * Attaches every device's and controller's accumulated log before {@link EvidenceRecorder.flush}
     * writes it to disk. `cx.recorder` is typed as the generic `StepRecorder` (no `attachLog`), so
     * this uses the concrete instance `#buildContext` kept a reference to instead.
     */
    protected override async beforeFlush(cx: CertStepContext): Promise<void> {
        if (!this.#recorder) {
            return;
        }
        for (const [role, device] of Object.entries(cx.devices)) {
            this.#recorder.attachLog(`device-${role}`, device.log.lines);
        }
        for (const [name, controller] of Object.entries(cx.controllers)) {
            this.#recorder.attachLog(`controller-${name}`, controller.log.lines);
        }
    }

    async #teardown(controllers: Record<string, ControllerAdapter>): Promise<void> {
        const errors = new Array<unknown>();

        for (const controller of Object.values(controllers)) {
            try {
                await controller.close();
            } catch (e) {
                errors.push(e);
            }
        }

        for (const device of this.#extraDevices) {
            try {
                await device.close();
            } catch (e) {
                errors.push(e);
            }
        }
        this.#extraDevices = [];
        this.#recorder = undefined;

        for (const error of errors) {
            console.warn("Error tearing down cert-test controller/device:", error);
        }
    }
}
