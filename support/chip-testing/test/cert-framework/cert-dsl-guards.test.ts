/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import {
    certTest,
    createRegisteredCertTest,
    DeviceIdentityExhaustedError,
    identityFor,
    LogFollower,
    PicsFile,
    CertControllerGapError,
    registerCertAppPics,
    registerMatterJsCertSubject,
    replaceControllerAdapterRegistrationForTesting,
    skipOnControllerGap,
    subjectFactoryFor,
    unmetControllerCapabilities,
    unregisterCertAppPics,
} from "@matter/testing";
import type {
    CertDevice,
    CertDeviceFactory,
    CertRunSetup,
    CertStepContext,
    CertStepSetting,
    ControllerAdapter,
    ControllerAdapterFactory,
    ControllerCapability,
    ControllerCapabilityGaps,
    ControllerRoleKind,
    DeviceExitInfo,
    PicsValues,
} from "@matter/testing";
import { expect } from "chai";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import "../../src/cert/index.js";

describe("certTest step declaration guard", () => {
    it("rejects an empty flavors list at declaration time", () => {
        // A single-device certTest() registers a mocha suite as a side effect; a real registration
        // from inside a running test would leak a rogue cert test into this run, so stub the global
        // out for the duration of the declaration. The suite body never runs, which also keeps the
        // harness/device wiring it would perform out of this check.
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", () => {});
        try {
            const builder = certTest("TC-EMPTY-FLAVORS-GUARD-0.0", {
                plan: "n/a",
                pics: [],
                app: "all-clusters",
            });

            expect(() => builder.step(1, "Step with an empty flavors list", async () => {}, { flavors: [] })).to.throw(
                'declares an empty "flavors" list',
            );

            expect(() => builder.step(2, "Valid step", async () => {})).to.not.throw();
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    });

    it("rejects a malformed step PICS expression at declaration time", () => {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", () => {});
        try {
            const builder = certTest("TC-BAD-PICS-GUARD-0.0", {
                plan: "n/a",
                pics: [],
                app: "all-clusters",
            });

            expect(() =>
                builder.step(1, "Step gated on a doubled operator", async () => {}, {
                    pics: "MCORE.DD.SCAN_QR_CODE && MCORE.DD.DISCOVERY_BLE",
                }),
            ).to.throw(/Invalid PICS expression/);

            expect(() =>
                builder.step(2, "Step gated on an expression", async () => {}, {
                    pics: "MCORE.DD.SCAN_QR_CODE & MCORE.DD.DISCOVERY_BLE",
                }),
            ).to.not.throw();
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    });

    it("rejects a blank longRunning reason at declaration time", () => {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", () => {});
        try {
            const builder = certTest("TC-BLANK-LR-GUARD-0.0", { plan: "n/a", pics: [], app: "all-clusters" });

            expect(() => builder.step(1, "Step with a blank reason", async () => {}, { longRunning: "  " })).to.throw(
                "declares a long-running step with no reason",
            );
            expect(() =>
                builder.step(2, "Step with a real reason", async () => {}, { longRunning: "waits out an interval" }),
            ).to.not.throw();
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    });

    it("rejects a blank notApplicable reason at declaration time", () => {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", () => {});
        try {
            const builder = certTest("TC-BLANK-NA-GUARD-0.0", {
                plan: "n/a",
                pics: [],
                app: "all-clusters",
            });

            expect(() => builder.step(1, "Step with an empty reason", async () => {}, { notApplicable: "" })).to.throw(
                'declares an empty "notApplicable" reason',
            );

            expect(() =>
                builder.step(2, "Step with a whitespace-only reason", async () => {}, { notApplicable: "   " }),
            ).to.throw('declares an empty "notApplicable" reason');

            expect(() =>
                builder.step(3, "Step with a real reason", async () => {}, { notApplicable: "Out of Scope" }),
            ).to.not.throw();
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    });

    it("rejects a second finalize declaration at declaration time", () => {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", () => {});
        try {
            const builder = certTest("TC-DOUBLE-FINALIZE-GUARD-0.0", {
                plan: "n/a",
                pics: [],
                app: "all-clusters",
            });

            expect(() => builder.finalize(async () => {})).to.not.throw();
            expect(() => builder.finalize(async () => {})).to.throw("declares finalize() twice");
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    });
});

describe("multi-device declaration guards", () => {
    function declare(tc: string, devices: Record<string, string>) {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", () => {});
        try {
            certTest(tc, { plan: "n/a", pics: [], app: "all-clusters", devices });
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    }

    /**
     * As {@link declare}, but runs the suite body `certTest()` passes to `describe`. The body is still
     * not registered as a suite: a real registration would leak a rogue cert test into this run.
     */
    function declareAndWire(tc: string, devices: Record<string, string>) {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", (_name: string, body: () => void) => body());
        try {
            certTest(tc, { plan: "n/a", pics: [], app: "all-clusters", devices });
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    }

    function declareWithAppArgs(tc: string, devices: Record<string, string>, appArgs: Record<string, string[]>) {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", () => {});
        try {
            certTest(tc, { plan: "n/a", pics: [], app: "all-clusters", devices, appArgs });
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    }

    // A role that does not exist takes no arguments and reports nothing, so the case would run against
    // a device started the default way while its declaration says otherwise
    it("rejects appArgs for a role no device uses", () => {
        expect(() =>
            declareWithAppArgs("TC-APPARGS-ROLE-0.0", { th: "all-clusters" }, { th2: ["--autoApplyImage"] }),
        ).to.throw(/declares appArgs for the role "th2"/);
    });

    it("accepts appArgs for a declared role", () => {
        expect(() =>
            declareWithAppArgs(
                "TC-APPARGS-ROLE-0.1",
                { th: "all-clusters", th2: "ota-requestor" },
                { th2: ["--autoApplyImage"] },
            ),
        ).to.not.throw();
    });

    // The default declaration names one role, `th`, and a case with no `devices` of its own still has
    // to be able to pass its app an argument
    it("accepts appArgs for the default role of a case declaring no devices", () => {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", () => {});
        try {
            expect(() =>
                certTest("TC-APPARGS-ROLE-0.2", {
                    plan: "n/a",
                    pics: [],
                    app: "ota-requestor",
                    appArgs: { th: ["--autoApplyImage"] },
                }),
            ).to.not.throw();
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    });

    // A role name becomes part of the subject's id, and a matter.js subject rejects a dot outright
    // because an id becomes an endpoint id
    it("rejects a role name a subject cannot carry in its id", () => {
        expect(() => declare("TC-ROLE-DOT-0.0", { th: "all-clusters", "th.2": "all-clusters" })).to.throw(
            /role name becomes part of the subject's id/,
        );
    });

    it("accepts the role names plans actually use", () => {
        expect(() => declare("TC-ROLE-OK-0.0", { th1: "all-clusters", th2: "all-clusters" })).to.not.throw();
    });

    // A plan pairing an OTA requestor with an OTA provider needs this; the bundle names each role's
    // binary and the revision it came from, so such a run can still say what it ran against
    it("accepts devices running different apps", () => {
        expect(() => declare("TC-MIXED-APP-0.0", { th: "all-clusters", th2: "ota-provider" })).to.not.throw();
    });

    // The declaration names one variant; `#buildContext` asks this for one factory per role, so a
    // variant applied to every role would spawn each of them from a binary name CHIP never builds
    it("gives a role running another app that app's plain binary rather than the declared variant", () => {
        const definition = { app: "all-clusters", appVariant: "nlfaultinject" };

        // chip-local, the only flavor that can run a variant at all; constructing a device neither
        // spawns nor touches the filesystem, so the variant it carries is readable here
        const primary = subjectFactoryFor("chip-local", definition, "all-clusters");
        const secondary = subjectFactoryFor("chip-local", definition, "ota-provider");

        expect(primary("cert-th", { identity: identityFor(0) }).appVariant).equal("nlfaultinject");
        expect(secondary("cert-th2", { identity: identityFor(1) }).appVariant).equal(undefined);
    });

    // Without it a role could be recorded as running the app it declared while being handed the one
    // the harness activates, and the evidence bundle would name a binary the run never started
    it("rejects a declaration no role of which names the app the harness activates", () => {
        expect(() => declareAndWire("TC-NO-PRIMARY-0.0", { th2: "ota-provider" })).to.throw(
            'has no role for app "all-clusters"',
        );
    });

    // The declaration is wrong on every flavor, so the flavor this run happens to use must not decide
    // whether it is caught — otherwise it hides until someone runs the one flavor that reaches the check
    it("rejects it on a flavor the test itself excludes", () => {
        const originalDescribe = Reflect.get(globalThis, "describe");
        Reflect.set(globalThis, "describe", (_name: string, body: () => void) => body());
        try {
            expect(() =>
                certTest("TC-NO-PRIMARY-0.1", {
                    plan: "n/a",
                    pics: [],
                    app: "all-clusters",
                    devices: { th2: "ota-provider" },
                    flavors: ["chip-docker"],
                }),
            ).to.throw('has no role for app "all-clusters"');
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
        }
    });
});

describe("per-device identity", () => {
    // Two subjects in one run cannot share an identity: mDNS discovery here matches on the long
    // discriminator alone, and two chip apps would contend for the same operational port.
    it("gives every declared device its own discriminator, passcode and port", () => {
        const identities = [0, 1, 2].map(index => identityFor(index));

        expect(new Set(identities.map(i => i.discriminator)).size).equal(3);
        expect(new Set(identities.map(i => i.passcode)).size).equal(3);
        expect(new Set(identities.map(i => i.port)).size).equal(3);
    });

    // Every existing single-device test case records this discriminator in its evidence and commissions
    // with this passcode; a change here rewrites all of them
    it("leaves the primary device on chip's own defaults", () => {
        expect(identityFor(0)).deep.equal({ discriminator: 3840, passcode: 20202021, port: 5540 });
    });

    it("is deterministic, so a role's identity is the same on every run", () => {
        expect(identityFor(1)).deep.equal(identityFor(1));
    });

    // At the boundary itself: 3840 + 255 is the last that fits, so an off-by-one in the guard shows
    // up here and nowhere else
    it("keeps every discriminator inside the 12 bits Matter gives it", () => {
        expect(identityFor(255).discriminator).equal(0xfff);
        expect(() => identityFor(256)).to.throw(DeviceIdentityExhaustedError, /does not fit the 12 bits/);
    });

    // Section 5.1.7.1 forbids the repeated-digit and sequential codes; a run that assigned one would
    // be refused by the commissionee rather than by us
    it("never assigns a passcode the specification forbids", () => {
        const forbidden = new Set([
            0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 99999999, 12345678,
            87654321,
        ]);

        for (let index = 0; index <= 255; index++) {
            expect(forbidden.has(identityFor(index).passcode)).equal(false);
        }
    });
});

async function* noLines(): AsyncGenerator<string> {}

/** A step body that records the one passing check a step needs to pass. */
async function passes(cx: CertStepContext): Promise<void> {
    cx.recorder.check({ type: "response", verdict: "pass", detail: "observed" });
}

/**
 * A matterjs {@link CertDeviceFactory} whose device reports `app` truthfully — never anything the
 * caller passed as `domain` — so a test can tell which registered factory actually built a device
 * from the device's own identity, independent of the role it was placed under.
 */
function fakeMatterJsCertDevice(app: string): CertDeviceFactory {
    return domain => ({
        id: domain,
        app,
        commissioning: { kind: "on-network", passcode: 20202021, discriminator: 3840, qrPairingCode: "" },
        pics: new PicsFile([]),
        async initialize() {},
        async start() {},
        async stop() {},
        async close() {},
        async snapshot() {
            return {};
        },
        async restore() {},
        async backchannel() {},
        flavor: "matterjs",
        log: new LogFollower(noLines(), domain),
        exit: new Promise<DeviceExitInfo>(() => {}),
    });
}

/** A stand-in for mocha's `it` that collects what `certTest` registers, and the titles it skips. */
function registeringIt(
    registered: { descriptor?: Parameters<typeof createRegisteredCertTest>[0] }[],
    skipped: string[],
) {
    const fakeIt = (_name: string, _fn: () => void) => {
        const fakeTest: { descriptor?: Parameters<typeof createRegisteredCertTest>[0] } = {};
        registered.push(fakeTest);
        return fakeTest;
    };
    fakeIt.skip = (name: string) => {
        skipped.push(name);
    };
    return fakeIt;
}

describe("certTest DUT app", () => {
    /** Declares a cert test without registering a real mocha test, and returns the definition it built. */
    function definitionOf(tc: string, options: Parameters<typeof certTest>[1]) {
        const originalDescribe = Reflect.get(globalThis, "describe");
        const originalIt = Reflect.get(globalThis, "it");
        const registered = new Array<{ descriptor?: Parameters<typeof createRegisteredCertTest>[0] }>();
        const skipped = new Array<string>();
        Reflect.set(globalThis, "describe", (_name: string, body: () => void) => body());
        Reflect.set(globalThis, "it", registeringIt(registered, skipped));
        try {
            certTest(tc, options);
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
            Reflect.set(globalThis, "it", originalIt);
        }

        expect(skipped).deep.equal([]);
        const descriptor = registered[0]?.descriptor;
        if (!descriptor) {
            expect.fail(`certTest("${tc}") did not register a descriptor`);
        }
        return createRegisteredCertTest(descriptor).definition;
    }

    it("takes the DUT's PICS app from the device role named dut when no controller is the DUT", () => {
        const definition = definitionOf("TC-DUT-APP-DEVICE-0.0", {
            plan: "n/a",
            pics: [],
            app: "all-clusters",
            controllers: { th1: "helper" },
            devices: { th2: "all-clusters", dut: "light-switch" },
        });

        expect(definition.dutIsDevice).equal(true);
        expect(definition.dutApp).equal("light-switch");
    });

    it("names no DUT app when a controller is the DUT", () => {
        const definition = definitionOf("TC-DUT-APP-CONTROLLER-0.0", {
            plan: "n/a",
            pics: [],
            app: "all-clusters",
        });

        expect(definition.dutIsDevice).equal(false);
        expect(definition.dutApp).undefined;
    });
});

describe("multi-device wiring", () => {
    // `#buildContext` (cert-dsl.ts) builds each non-primary role's device via
    // `subjectFactoryFor(flavor, definition, app)`, using the loop's own `app` for that role;
    // `deviceRecordsFor` separately states each role's app from the declaration
    // (`certTest`'s `devices` option). Nothing before this test drove both through one real run, so a
    // regression that fed `#buildContext` the primary's app instead of the loop's would start the
    // wrong binary for a secondary role while the evidence bundle kept claiming the declared one —
    // exactly the false claim this framework exists to prevent, and a green run would never say so.
    it("starts each declared role from its own app, matching what the evidence bundle records", async () => {
        const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const primaryApp = `wiring-primary-${suffix}`;
        const secondaryApp = `wiring-secondary-${suffix}`;
        const tc = `TC-WIRING-IDENTITY-${suffix}`;

        registerMatterJsCertSubject(primaryApp, fakeMatterJsCertDevice(primaryApp));
        registerMatterJsCertSubject(secondaryApp, fakeMatterJsCertDevice(secondaryApp));

        // `certTest()` registers a mocha suite/test as a side effect (see `declare`/`declareAndWire`
        // above); both are stubbed here too, since this must run to real completion — including the
        // `it()` call `defineCertTest` makes — without leaking a rogue test into this run. The fake
        // `it()` stands in for mocha's own and captures the descriptor `defineCertTest` assigns to it,
        // which is the same object `registerCertTestFactory` used as its key.
        const originalDescribe = Reflect.get(globalThis, "describe");
        const originalIt = Reflect.get(globalThis, "it");
        const registered = new Array<{ descriptor?: Parameters<typeof createRegisteredCertTest>[0] }>();
        const skipped = new Array<string>();
        Reflect.set(globalThis, "describe", (_name: string, body: () => void) => body());
        Reflect.set(globalThis, "it", registeringIt(registered, skipped));

        let capturedDevices: Record<string, CertDevice> | undefined;
        try {
            certTest(tc, {
                plan: "n/a",
                pics: [],
                app: primaryApp,
                devices: { th: primaryApp, th2: secondaryApp },
                controllers: {},
            }).step(1, "Capture which device each role actually started", async cx => {
                capturedDevices = cx.devices;
                await passes(cx);
            });
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
            Reflect.set(globalThis, "it", originalIt);
        }

        expect(skipped).deep.equal([]);
        const descriptor = registered[0]?.descriptor;
        if (!descriptor) {
            throw new InternalError(`certTest("${tc}") did not register a descriptor`);
        }

        // The real harness reads this from the environment (`cert-dsl.ts`'s `evidenceOutDir`); a temp
        // dir keeps this run's bundle out of whatever the rest of this suite writes to.
        const outDir = await mkdtemp(join(tmpdir(), "cert-dsl-wiring-"));
        const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
        env.MATTER_CERT_EVIDENCE_DIR = outDir;
        try {
            // Drives the registered `WiredCertTest` directly rather than through mocha/`State`: the
            // primary device a real run would get from `State.activateSubject` is supplied here
            // instead, so nothing beyond the two matterjs subjects above needs to exist.
            const test = createRegisteredCertTest(descriptor);
            const primary = fakeMatterJsCertDevice(primaryApp)("cert");

            await test.invoke(primary, () => {}, [], false);

            const entries = await readdir(outDir);
            const runDir = entries.find(name => name.endsWith(`-${tc}`));
            if (!runDir) {
                throw new InternalError(`No evidence directory found for ${tc} under ${outDir}`);
            }
            const result = JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8"));

            expect(result.verdict).equal("pass");
            expect(capturedDevices).to.not.equal(undefined);
            for (const record of result.run.devices) {
                expect(capturedDevices?.[record.role]?.app, `role "${record.role}"`).equal(record.app);
            }
        } finally {
            if (originalEvidenceDir === undefined) {
                delete env.MATTER_CERT_EVIDENCE_DIR;
            } else {
                env.MATTER_CERT_EVIDENCE_DIR = originalEvidenceDir;
            }
            await rm(outDir, { recursive: true, force: true });
        }
    });
});

describe("certTest under a controller that serves only the DUT role", () => {
    /** Runs `body` with the mocha registration functions stubbed; returns the titles `it` / `it.skip` received. */
    interface CollectedTest {
        name: string;
        fn: (this: { skip(): never }) => Promise<void> | void;
        descriptor?: Parameters<typeof createRegisteredCertTest>[0];
    }

    function collect(body: () => void) {
        const originalDescribe = Reflect.get(globalThis, "describe");
        const originalIt = Reflect.get(globalThis, "it");
        const pending = new Array<string>();
        const active = new Array<CollectedTest>();
        const fakeIt = (name: string, fn: CollectedTest["fn"]) => {
            const fakeTest: CollectedTest = { name, fn };
            active.push(fakeTest);
            return fakeTest;
        };
        fakeIt.skip = (name: string) => {
            pending.push(name);
        };
        Reflect.set(globalThis, "describe", (_name: string, run: () => void) => run());
        Reflect.set(globalThis, "it", fakeIt);
        try {
            body();
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
            Reflect.set(globalThis, "it", originalIt);
        }
        return { pending, active };
    }

    function withController<T>(selection: string, fn: () => T) {
        const original = env.MATTER_CERT_CONTROLLER;
        env.MATTER_CERT_CONTROLLER = selection;
        try {
            return fn();
        } finally {
            if (original === undefined) {
                delete env.MATTER_CERT_CONTROLLER;
            } else {
                env.MATTER_CERT_CONTROLLER = original;
            }
        }
    }

    function deviceDutCase(tc: string) {
        certTest(tc, {
            plan: "n/a",
            pics: [],
            app: "all-clusters",
            controllers: { th: "helper" },
            devices: { dut: "all-clusters" },
        });
    }

    it("skips a device-DUT case under a controller that serves only the DUT role", () => {
        const restore = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
            factory: id => fakeAdapter(id),
            helperImplementation: "matterjs",
        });
        try {
            const { pending, active } = withController("matterjs-server", () =>
                collect(() => deviceDutCase("TC-DUT-ONLY-SKIP-0.0")),
            );

            expect(pending).to.have.lengthOf(1);
            expect(pending[0]).to.contain("DUT is a device");
            expect(active).to.have.lengthOf(0);

            const underMatterJs = withController("matterjs", () =>
                collect(() => deviceDutCase("TC-DUT-ONLY-SKIP-0.1")),
            );
            expect(underMatterJs.pending).to.have.lengthOf(0);
            expect(underMatterJs.active).to.have.lengthOf(1);
        } finally {
            restore();
        }
    });

    it("skips a device-DUT case that also declares a gap of the controller as not applicable, without a gap run", () => {
        const gaps = { "group-messaging": "no groups" };
        const restoreServer = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
            factory: id => fakeAdapter(id),
            helperImplementation: "matterjs",
            gaps,
        });
        const restoreMatterJs = replaceControllerAdapterRegistrationForTesting("matterjs", {
            factory: id => fakeAdapter(id),
            gaps,
        });
        try {
            const { pending, active } = withController("matterjs-server", () =>
                collect(() =>
                    certTest("TC-DUT-ONLY-GAP-0.0", {
                        plan: "n/a",
                        pics: [],
                        app: "all-clusters",
                        controllers: { th: "helper" },
                        devices: { dut: "all-clusters" },
                        controllerCapabilities: ["group-messaging"],
                    }),
                ),
            );

            expect(pending).to.have.lengthOf(1);
            expect(pending[0]).to.contain("DUT is a device");
            expect(active).to.have.lengthOf(0);
        } finally {
            restoreMatterJs();
            restoreServer();
        }
    });

    it("skips a case before any device starts where its DUT controller lacks a capability it declares", () => {
        const declare = (tc: string) =>
            certTest(tc, {
                plan: "n/a",
                pics: [],
                app: "all-clusters",
                controllerCapabilities: ["session-introspection"],
            });

        const underServer = withController("matterjs-server", () => collect(() => declare("TC-CAPABILITY-SKIP-0.0")));
        expect(underServer.pending).to.have.lengthOf(0);
        expect(underServer.active).to.have.lengthOf(1);
        expect(underServer.active[0].name).to.contain('controller "matterjs-server" lacks session-introspection');
        expect(underServer.active[0].descriptor).undefined;

        const underMatterJs = withController("matterjs", () => collect(() => declare("TC-CAPABILITY-SKIP-0.1")));
        expect(underMatterJs.pending).to.have.lengthOf(0);
        expect(underMatterJs.active).to.have.lengthOf(1);
    });

    it("records a gap where a case needs a capability its DUT controller lacks besides one out of scope", async () => {
        const tc = `TC-OUT-OF-SCOPE-BUNDLE-${Date.now().toString(36)}`;
        const outDir = await mkdtemp(join(tmpdir(), "cert-dsl-out-of-scope-"));
        const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
        const restore = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
            factory: id => fakeAdapter(id),
            helperImplementation: "matterjs",
            gaps: { "group-messaging": "no groups" },
            outOfScope: { "icd-client": "not for controllers" },
        });
        try {
            env.MATTER_CERT_EVIDENCE_DIR = outDir;
            const declare = (name: string) =>
                certTest(name, {
                    plan: "n/a",
                    pics: [],
                    app: "all-clusters",
                    controllerCapabilities: ["group-messaging", "icd-client"],
                });

            const underServer = withController("matterjs-server", () => collect(() => declare(tc)));
            expect(underServer.pending).to.have.lengthOf(0);
            expect(underServer.active).to.have.lengthOf(1);
            expect(underServer.active[0].name).to.contain(
                'controller "matterjs-server" lacks group-messaging: no groups',
            );

            class Skipped extends InternalError {}
            let thrown: unknown;
            try {
                await withController("matterjs-server", () =>
                    underServer.active[0].fn.call({
                        skip(): never {
                            throw new Skipped("skipped");
                        },
                    }),
                );
            } catch (e) {
                thrown = e;
            }
            expect(thrown).instanceOf(Skipped);

            const runDir = (await readdir(outDir)).find(name => name.endsWith(`-${tc}`));
            if (!runDir) {
                throw new InternalError(`No evidence directory found for ${tc}`);
            }
            const result = JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8"));
            expect(result.verdict).equal("controller-gap");
            expect(result.controllerGap).contain('controller "matterjs-server" lacks group-messaging');
            expect(result.outOfScope).undefined;
            expect(result.run.devices).deep.equal([]);

            const underMatterJs = withController("matterjs", () => collect(() => declare(`${tc}-matterjs`)));
            expect(underMatterJs.active).to.have.lengthOf(1);
            expect(underMatterJs.active[0].descriptor).not.undefined;
        } finally {
            restore();
            if (originalEvidenceDir === undefined) {
                delete env.MATTER_CERT_EVIDENCE_DIR;
            } else {
                env.MATTER_CERT_EVIDENCE_DIR = originalEvidenceDir;
            }
            await rm(outDir, { recursive: true, force: true });
        }
    });

    it("writes an evidence bundle for a case skipped as a whole for a controller gap, then skips it", async () => {
        const tc = `TC-CAPABILITY-BUNDLE-${Date.now().toString(36)}`;
        const outDir = await mkdtemp(join(tmpdir(), "cert-dsl-gap-"));
        const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
        try {
            env.MATTER_CERT_EVIDENCE_DIR = outDir;
            const { active } = withController("matterjs-server", () =>
                collect(() =>
                    certTest(tc, {
                        plan: "n/a",
                        pics: [],
                        app: "all-clusters",
                        controllers: { dut: "dut", th: "helper" },
                        controllerCapabilities: ["session-introspection"],
                    }),
                ),
            );

            class Skipped extends InternalError {}
            let thrown: unknown;
            try {
                await withController("matterjs-server", () =>
                    active[0].fn.call({
                        skip(): never {
                            throw new Skipped("skipped");
                        },
                    }),
                );
            } catch (e) {
                thrown = e;
            }
            expect(thrown).instanceOf(Skipped);

            const runDir = (await readdir(outDir)).find(name => name.endsWith(`-${tc}`));
            if (!runDir) {
                throw new InternalError(`No evidence directory found for ${tc}`);
            }
            const result = JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8"));
            expect(result.verdict).equal("controller-gap");
            expect(result.controllerGap).contain('controller "matterjs-server" lacks session-introspection');
            expect(result.run.controllerImplementation).equal("matterjs-server");
            expect(result.run.helperControllerImplementation).equal("matterjs");
            expect(result.run.devices).deep.equal([]);
        } finally {
            if (originalEvidenceDir === undefined) {
                delete env.MATTER_CERT_EVIDENCE_DIR;
            } else {
                env.MATTER_CERT_EVIDENCE_DIR = originalEvidenceDir;
            }
            await rm(outDir, { recursive: true, force: true });
        }
    });

    it("skips a TCP case where the controller filling its helper role cannot establish a TCP session", () => {
        const declare = (tc: string) =>
            certTest(tc, {
                plan: "n/a",
                pics: [],
                app: "all-clusters",
                controllers: { th: "helper" },
                devices: { dut: "all-clusters" },
                transport: "tcp",
            });

        const underChipTool = withController("chip-tool", () => collect(() => declare("TC-CAPABILITY-SKIP-1.0")));
        expect(underChipTool.active).to.have.lengthOf(1);
        expect(underChipTool.active[0].name).to.contain('controller "chip-tool" lacks tcp-transport');

        const underMatterJs = withController("matterjs", () => collect(() => declare("TC-CAPABILITY-SKIP-1.1")));
        expect(underMatterJs.active).to.have.lengthOf(1);
    });

    it("finds what a test's controllers lack from its declaration and its transport", () => {
        withController("matterjs-server", () => {
            const dut = { dut: "dut" } as const;
            expect(unmetControllerCapabilities({ transport: "tcp", controllers: dut })).to.contain(
                "lacks tcp-transport",
            );
            expect(
                unmetControllerCapabilities({ controllerCapabilities: ["session-introspection"], controllers: dut }),
            ).to.contain("lacks session-introspection");
            expect(unmetControllerCapabilities({ transport: "tcp", controllers: { th: "helper" } })).equal(undefined);
            expect(unmetControllerCapabilities({ controllers: dut })).equal(undefined);
        });
    });

    it("builds helper roles from matterjs and records that in the evidence", async () => {
        const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const app = `dut-only-primary-${suffix}`;
        const tc = `TC-DUT-ONLY-RUN-${suffix}`;
        registerMatterJsCertSubject(app, fakeMatterJsCertDevice(app));

        const built = new Array<string>();
        const restoreMatterJs = replaceControllerAdapterRegistrationForTesting("matterjs", {
            factory: id => {
                built.push(`matterjs:${id}`);
                return fakeAdapter(id);
            },
        });
        const restoreServer = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
            factory: id => {
                built.push(`matterjs-server:${id}`);
                return { ...fakeAdapter(id), build: { entry: "fake-entry", sdkVersion: "1.2.3" } };
            },
            helperImplementation: "matterjs",
        });

        const outDir = await mkdtemp(join(tmpdir(), "cert-dsl-dut-only-"));
        const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
        const originalController = env.MATTER_CERT_CONTROLLER;
        try {
            env.MATTER_CERT_EVIDENCE_DIR = outDir;
            const { active } = withController("matterjs-server", () =>
                collect(() => {
                    certTest(tc, {
                        plan: "n/a",
                        pics: [],
                        app,
                        controllers: { dut: "dut", th: "helper" },
                    }).step(1, "Nothing to do", passes);
                }),
            );
            const descriptor = active[0]?.descriptor;
            if (!descriptor) {
                throw new InternalError(`certTest("${tc}") did not register a descriptor`);
            }

            env.MATTER_CERT_CONTROLLER = "matterjs-server";
            await createRegisteredCertTest(descriptor).invoke(fakeMatterJsCertDevice(app)("cert"), () => {}, [], false);

            const runDir = (await readdir(outDir)).find(name => name.endsWith(`-${tc}`));
            if (!runDir) {
                throw new InternalError(`No evidence directory found for ${tc}`);
            }
            const result = JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8"));

            expect(result.run.controllerImplementation).equal("matterjs-server");
            expect(result.run.helperControllerImplementation).equal("matterjs");
            expect(result.run.controllerBuild).deep.equal({ entry: "fake-entry", sdkVersion: "1.2.3" });
            expect(built).deep.equal(["matterjs-server:dut", "matterjs:th"]);
        } finally {
            restoreServer();
            restoreMatterJs();
            if (originalController === undefined) {
                delete env.MATTER_CERT_CONTROLLER;
            } else {
                env.MATTER_CERT_CONTROLLER = originalController;
            }
            if (originalEvidenceDir === undefined) {
                delete env.MATTER_CERT_EVIDENCE_DIR;
            } else {
                env.MATTER_CERT_EVIDENCE_DIR = originalEvidenceDir;
            }
            await rm(outDir, { recursive: true, force: true });
        }
    });

    describe("controller groups", () => {
        const KEY_SET = {
            groupKeySetId: 1,
            groupKeySecurityPolicy: 0,
            epochKey0: new Uint8Array(16).fill(0xd0),
            epochStartTime0: 1_600_000_000_000_000n,
        };
        const GROUPS = [{ groupId: 1, keySet: KEY_SET, addressPolicy: "ianaAddr" as const }];

        /** Runs a case under `matterjs-server` with a `matterjs` helper and returns the options each role was built with. */
        async function optionsPerRole(controllerGroups: Parameters<typeof certTest>[1]["controllerGroups"]) {
            const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            const app = `groups-app-${suffix}`;
            const tc = `TC-GROUPS-WIRING-${suffix}`;
            registerMatterJsCertSubject(app, fakeMatterJsCertDevice(app));

            const built = new Map<string, unknown>();
            const factory = (id: string, options?: Parameters<ControllerAdapterFactory>[1]) => {
                built.set(id, options?.groups);
                return fakeAdapter(id);
            };
            const restoreMatterJs = replaceControllerAdapterRegistrationForTesting("matterjs", { factory });
            const restoreServer = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
                factory,
                helperImplementation: "matterjs",
            });

            const outDir = await mkdtemp(join(tmpdir(), "cert-dsl-groups-"));
            const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
            const originalController = env.MATTER_CERT_CONTROLLER;
            try {
                env.MATTER_CERT_EVIDENCE_DIR = outDir;
                const { active } = withController("matterjs-server", () =>
                    collect(() => {
                        certTest(tc, {
                            plan: "n/a",
                            pics: [],
                            app,
                            controllers: { dut: "dut", th: "helper" },
                            controllerGroups,
                        }).step(1, "Nothing to do", passes);
                    }),
                );
                const descriptor = active[0]?.descriptor;
                if (!descriptor) {
                    throw new InternalError(`certTest("${tc}") did not register a descriptor`);
                }

                env.MATTER_CERT_CONTROLLER = "matterjs-server";
                await createRegisteredCertTest(descriptor).invoke(
                    fakeMatterJsCertDevice(app)("cert"),
                    () => {},
                    [],
                    false,
                );
                return built;
            } finally {
                restoreServer();
                restoreMatterJs();
                if (originalController === undefined) {
                    delete env.MATTER_CERT_CONTROLLER;
                } else {
                    env.MATTER_CERT_CONTROLLER = originalController;
                }
                if (originalEvidenceDir === undefined) {
                    delete env.MATTER_CERT_EVIDENCE_DIR;
                } else {
                    env.MATTER_CERT_EVIDENCE_DIR = originalEvidenceDir;
                }
                await rm(outDir, { recursive: true, force: true });
            }
        }

        it("hands a declared group list to the DUT controller only", async () => {
            const built = await optionsPerRole(GROUPS);

            expect(built.get("dut")).equals(GROUPS);
            expect(built.has("th")).equals(true);
            expect(built.get("th")).equals(undefined);
        });

        it("resolves a group function against the run's controller selection and device flavor, for the DUT only", async () => {
            const calls = new Array<CertRunSetup>();
            const built = await optionsPerRole(setup => {
                calls.push({ controllerSelection: setup.controllerSelection, deviceFlavor: setup.deviceFlavor });
                return GROUPS;
            });

            expect(calls).deep.equals([
                { controllerSelection: { dut: "matterjs-server", helper: "matterjs" }, deviceFlavor: "matterjs" },
            ]);
            expect(built.get("dut")).equals(GROUPS);
            expect(built.get("th")).equals(undefined);
        });

        it("builds the DUT without groups where the case declares none", async () => {
            const built = await optionsPerRole(undefined);

            expect(built.has("dut")).equals(true);
            expect(built.get("dut")).equals(undefined);
        });
    });

    /**
     * Registers `matterjs` and a `matterjs-server` that serves only the DUT role with the given capability gaps for the
     * duration of `body`, and restores the production registrations afterwards.
     */
    async function withFakeControllers<T>(
        gaps: { matterjs?: ControllerCapabilityGaps; server?: ControllerCapabilityGaps },
        body: () => Promise<T>,
    ) {
        const restoreMatterJs = replaceControllerAdapterRegistrationForTesting("matterjs", {
            factory: id => fakeAdapter(id),
            gaps: gaps.matterjs,
        });
        const restoreServer = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
            factory: id => fakeAdapter(id),
            gaps: gaps.server,
            helperImplementation: "matterjs",
        });
        try {
            return await body();
        } finally {
            restoreServer();
            restoreMatterJs();
        }
    }

    /**
     * Declares `tc` under `declaredWith`, runs it under `runWith` (and `MATTER_CERT_DEVICE` set to `deviceAtRun`) and
     * returns the evidence record it wrote. `appPics` are the matterjs app's own PICS declarations.
     */
    async function runCase(
        tc: string,
        options: Omit<Parameters<typeof certTest>[1], "plan" | "pics" | "app">,
        steps: {
            caps?: ControllerCapability[];
            pics?: string;
            notApplicable?: CertStepSetting;
            run?: (cx: CertStepContext) => Promise<void>;
        }[],
        selection: { declaredWith: string; runWith?: string; deviceAtRun?: string; appPics?: PicsValues },
    ) {
        const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const app = `roles-app-${suffix}`;
        registerMatterJsCertSubject(app, fakeMatterJsCertDevice(app));
        if (selection.appPics !== undefined) {
            registerCertAppPics("matterjs", app, selection.appPics);
        }

        const outDir = await mkdtemp(join(tmpdir(), "cert-dsl-roles-"));
        const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
        const originalController = env.MATTER_CERT_CONTROLLER;
        const originalDevice = env.MATTER_CERT_DEVICE;
        try {
            env.MATTER_CERT_EVIDENCE_DIR = outDir;
            const { active } = withController(selection.declaredWith, () =>
                collect(() => {
                    const builder = certTest(tc, { plan: "n/a", pics: [], app, ...options });
                    steps.forEach(({ caps, pics, notApplicable, run }, index) =>
                        builder.step(index + 1, `Step ${index + 1}`, run ?? passes, {
                            controllerCapabilities: caps,
                            pics,
                            notApplicable,
                        }),
                    );
                }),
            );
            const descriptor = active[0]?.descriptor;
            if (!descriptor) {
                throw new InternalError(`certTest("${tc}") did not register a descriptor`);
            }

            env.MATTER_CERT_CONTROLLER = selection.runWith ?? selection.declaredWith;
            if (selection.deviceAtRun !== undefined) {
                env.MATTER_CERT_DEVICE = selection.deviceAtRun;
            }
            try {
                await createRegisteredCertTest(descriptor).invoke(
                    fakeMatterJsCertDevice(app)("cert"),
                    () => {},
                    [],
                    false,
                );
            } catch (e) {
                if (!(e instanceof CertControllerGapError)) {
                    throw e;
                }
            }

            const runDir = (await readdir(outDir)).find(name => name.endsWith(`-${tc}`));
            if (!runDir) {
                throw new InternalError(`No evidence directory found for ${tc}`);
            }
            return JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8"));
        } finally {
            unregisterCertAppPics("matterjs", app);
            if (originalDevice === undefined) {
                delete env.MATTER_CERT_DEVICE;
            } else {
                env.MATTER_CERT_DEVICE = originalDevice;
            }
            if (originalController === undefined) {
                delete env.MATTER_CERT_CONTROLLER;
            } else {
                env.MATTER_CERT_CONTROLLER = originalController;
            }
            if (originalEvidenceDir === undefined) {
                delete env.MATTER_CERT_EVIDENCE_DIR;
            } else {
                env.MATTER_CERT_EVIDENCE_DIR = originalEvidenceDir;
            }
            await rm(outDir, { recursive: true, force: true });
        }
    }

    const tcSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    describe("helper controller implementation in the evidence", () => {
        const cases = [
            { name: "a DUT-only controller with only a dut role", selection: "matterjs-server", roles: { dut: "dut" } },
            {
                name: "the same implementation for dut and helper roles",
                selection: "matterjs",
                roles: { dut: "dut", th: "helper" },
            },
            {
                name: "a DUT-only controller whose helper role runs on matterjs",
                selection: "matterjs-server",
                roles: { dut: "dut", th: "helper" },
                expected: "matterjs",
            },
        ] as const;

        for (const { name, selection, roles, ...rest } of cases) {
            const expected = "expected" in rest ? rest.expected : undefined;
            it(`${expected === undefined ? "omits" : "records"} the helper implementation for ${name}`, async () => {
                await withFakeControllers({}, async () => {
                    const result = await runCase(`TC-HELPER-IMPL-${tcSuffix()}`, { controllers: roles }, [{}], {
                        declaredWith: selection,
                    });

                    expect(result.run.controllerImplementation).equal(selection);
                    if (expected === undefined) {
                        expect(result.run).not.to.have.property("helperControllerImplementation");
                    } else {
                        expect(result.run.helperControllerImplementation).equal(expected);
                    }
                });
            });
        }
    });

    describe("controller capabilities of the roles", () => {
        const roles = { dut: "dut", th: "helper" } as const;
        const helperLacksGroups: ControllerCapabilityGaps = { "group-messaging": "helper gap" };

        it("skips a step whose capability only the helper role's controller lacks", async () => {
            await withFakeControllers({ matterjs: helperLacksGroups }, async () => {
                const result = await runCase(
                    `TC-ROLE-STEP-${tcSuffix()}`,
                    { controllers: roles },
                    [{ caps: ["group-messaging"] }, {}],
                    { declaredWith: "matterjs-server" },
                );

                expect(result.steps.map((step: { verdict: string }) => step.verdict)).deep.equal(["skipped", "pass"]);
                expect(result.steps[0].skipReason).contain('controller "matterjs" lacks group-messaging');
            });
        });

        it("runs a step whose capability no role's controller lacks", async () => {
            await withFakeControllers({}, async () => {
                const result = await runCase(
                    `TC-ROLE-STEP-${tcSuffix()}`,
                    { controllers: roles },
                    [{ caps: ["group-messaging"] }],
                    { declaredWith: "matterjs-server" },
                );

                expect(result.steps.map((step: { verdict: string }) => step.verdict)).deep.equal(["pass"]);
            });
        });

        it("skips a case at declaration where only the helper role's controller lacks a declared capability", async () => {
            await withFakeControllers({ matterjs: helperLacksGroups }, async () => {
                const declare = (tc: string, controllers: Record<string, ControllerRoleKind>) =>
                    withController("matterjs-server", () =>
                        collect(() =>
                            certTest(tc, {
                                plan: "n/a",
                                pics: [],
                                app: "all-clusters",
                                controllers,
                                controllerCapabilities: ["group-messaging"],
                            }),
                        ),
                    );

                const withHelper = declare(`TC-ROLE-DECL-${tcSuffix()}`, roles);
                expect(withHelper.active).to.have.lengthOf(1);
                expect(withHelper.active[0].name).to.contain('controller "matterjs" lacks group-messaging');
                expect(withHelper.active[0].descriptor).undefined;

                const dutOnly = declare(`TC-ROLE-DECL-${tcSuffix()}`, { dut: "dut" });
                expect(dutOnly.active).to.have.lengthOf(1);
                expect(dutOnly.active[0].descriptor).not.undefined;
            });
        });
    });

    describe("controller selection changing after collection", () => {
        const BATCH_COMMANDS = "MCORE.IDM.C.InvokeRequest.BatchCommands";

        /** A key only the case's app declares, on the matterjs flavor alone. */
        const APP_ONLY_PICS = "MCORE.SELECTION.APP_ONLY";

        /** Runs `fn` with `MATTER_CERT_DEVICE` set to `flavor` until the promise it returns settles. */
        async function withDeviceUntilSettled<T>(flavor: string, fn: () => Promise<T>) {
            const original = env.MATTER_CERT_DEVICE;
            env.MATTER_CERT_DEVICE = flavor;
            try {
                return await fn();
            } finally {
                if (original === undefined) {
                    delete env.MATTER_CERT_DEVICE;
                } else {
                    env.MATTER_CERT_DEVICE = original;
                }
            }
        }

        class Skipped extends InternalError {}

        /** Runs `fn` with `selection` in place until the promise it returns settles, not only until it returns one. */
        async function withControllerUntilSettled<T>(selection: string, fn: () => Promise<T>) {
            const original = env.MATTER_CERT_CONTROLLER;
            env.MATTER_CERT_CONTROLLER = selection;
            try {
                return await fn();
            } finally {
                if (original === undefined) {
                    delete env.MATTER_CERT_CONTROLLER;
                } else {
                    env.MATTER_CERT_CONTROLLER = original;
                }
            }
        }

        async function runSkipBody(test: CollectedTest, selection: string) {
            let thrown: unknown;
            try {
                await withControllerUntilSettled(selection, async () =>
                    test.fn.call({
                        skip(): never {
                            throw new Skipped("skipped");
                        },
                    }),
                );
            } catch (e) {
                thrown = e;
            }
            expect(thrown).instanceOf(Skipped);
        }

        /** Runs `body` with evidence written to a fresh directory; returns the record written for `tc`, if any. */
        async function evidenceOf(tc: string, body: () => Promise<void>) {
            const outDir = await mkdtemp(join(tmpdir(), "cert-dsl-selection-"));
            const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
            try {
                env.MATTER_CERT_EVIDENCE_DIR = outDir;
                await body();
                const runDir = (await readdir(outDir)).find(name => name.endsWith(`-${tc}`));
                if (runDir === undefined) {
                    return undefined;
                }
                return JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8"));
            } finally {
                if (originalEvidenceDir === undefined) {
                    delete env.MATTER_CERT_EVIDENCE_DIR;
                } else {
                    env.MATTER_CERT_EVIDENCE_DIR = originalEvidenceDir;
                }
                await rm(outDir, { recursive: true, force: true });
            }
        }

        /** A `matterjs-server` that declares timed writes out of its scope and answers `BATCH_COMMANDS` with 0. */
        function withOutOfScopeServer<T>(body: () => Promise<T>) {
            const restore = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
                factory: id => fakeAdapter(id),
                helperImplementation: "matterjs",
                pics: { [BATCH_COMMANDS]: 0 },
                outOfScope: { "icd-client": "not for controllers" },
            });
            return body().finally(restore);
        }

        it("does not skip a case on out-of-scope declarations of the implementation filling its helper roles", async () => {
            const restore = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
                factory: id => fakeAdapter(id),
                outOfScope: { "icd-client": "not for controllers" },
            });
            try {
                const { active } = withController("matterjs-server", () =>
                    collect(() =>
                        certTest(`TC-SCOPE-HELPER-${tcSuffix()}`, {
                            plan: "n/a",
                            pics: [],
                            app: "all-clusters",
                            controllers: { th: "helper" },
                            controllerCapabilities: ["icd-client"],
                        }),
                    ),
                );
                expect(active).to.have.lengthOf(1);
                expect(active[0].descriptor).not.undefined;
            } finally {
                restore();
            }
        });

        it("writes the gap bundle of a case collected under one controller for that controller", async () => {
            const tc = `TC-SELECTION-GAP-${tcSuffix()}`;
            const result = await evidenceOf(tc, async () => {
                const { active } = withController("chip-tool", () =>
                    collect(() => certTest(tc, { plan: "n/a", pics: [], app: "all-clusters", transport: "tcp" })),
                );
                expect(active[0].name).contain('controller "chip-tool" lacks tcp-transport');
                await runSkipBody(active[0], "matterjs");
            });

            expect(result?.verdict).equal("controller-gap");
            expect(result?.controllerGap).contain('controller "chip-tool" lacks tcp-transport');
            expect(result?.run.controllerImplementation).equal("chip-tool");
        });

        it("judges the test PICS of a gap-skipped case by the controller it was collected under", async () => {
            const tc = `TC-SELECTION-GAP-PICS-${tcSuffix()}`;
            const result = await evidenceOf(tc, async () => {
                const { active } = withController("chip-tool", () =>
                    collect(() =>
                        certTest(tc, { plan: "n/a", pics: [BATCH_COMMANDS], app: "all-clusters", transport: "tcp" }),
                    ),
                );
                await runSkipBody(active[0], "matterjs");
            });

            expect(result).undefined;
        });

        it("writes the out-of-scope bundle of a case collected under one controller for that controller", async () => {
            const tc = `TC-SELECTION-SCOPE-${tcSuffix()}`;
            const result = await withOutOfScopeServer(() =>
                evidenceOf(tc, async () => {
                    const { active } = withController("matterjs-server", () =>
                        collect(() =>
                            certTest(tc, {
                                plan: "n/a",
                                pics: [],
                                app: "all-clusters",
                                controllerCapabilities: ["icd-client"],
                            }),
                        ),
                    );
                    await runSkipBody(active[0], "matterjs");
                }),
            );

            expect(result?.verdict).equal("skipped");
            expect(result?.outOfScope).contain('controller "matterjs-server" does not offer icd-client');
            expect(result?.run.controllerImplementation).equal("matterjs-server");
        });

        it("judges the test PICS of an out-of-scope case by the controller it was collected under", async () => {
            const tc = `TC-SELECTION-SCOPE-PICS-${tcSuffix()}`;
            const result = await withOutOfScopeServer(() =>
                evidenceOf(tc, async () => {
                    const { active } = withController("matterjs-server", () =>
                        collect(() =>
                            certTest(tc, {
                                plan: "n/a",
                                pics: [BATCH_COMMANDS],
                                app: "all-clusters",
                                controllerCapabilities: ["icd-client"],
                            }),
                        ),
                    );
                    await runSkipBody(active[0], "matterjs");
                }),
            );

            expect(result).undefined;
        });

        it("runs a collected case with the controllers, step gates and evidence of the collected selection", async () => {
            const restoreChipTool = replaceControllerAdapterRegistrationForTesting("chip-tool", {
                factory: () => {
                    throw new InternalError("chip-tool is not the collected controller and must not be built");
                },
                gaps: { "group-messaging": "no groups" },
                outOfScope: { "icd-client": "not for controllers" },
                pics: { [BATCH_COMMANDS]: 1 },
            });
            try {
                await withFakeControllers({}, async () => {
                    const seen = new Array<CertRunSetup>();
                    const observe = async (cx: CertStepContext) => {
                        seen.push({ controllerSelection: cx.controllerSelection, deviceFlavor: cx.deviceFlavor });
                        await passes(cx);
                    };
                    const result = await runCase(
                        `TC-SELECTION-RUN-${tcSuffix()}`,
                        { controllers: { dut: "dut" } },
                        [
                            { caps: ["group-messaging"] },
                            { caps: ["icd-client"] },
                            { pics: BATCH_COMMANDS },
                            { pics: APP_ONLY_PICS, run: observe },
                            {
                                notApplicable: setup => {
                                    seen.push(setup);
                                    return setup.deviceFlavor === "matterjs" ? undefined : "not on this flavor";
                                },
                            },
                        ],
                        {
                            declaredWith: "matterjs",
                            runWith: "chip-tool",
                            deviceAtRun: "chip-local",
                            appPics: { [APP_ONLY_PICS]: 1 },
                        },
                    );

                    expect(result.run.controllerImplementation).equal("matterjs");
                    expect(result.steps.map((step: { verdict: string }) => step.verdict)).deep.equal([
                        "pass",
                        "pass",
                        "skipped",
                        "pass",
                        "pass",
                    ]);
                    expect(result.steps[2].skipReason).contain(BATCH_COMMANDS);
                    const collected = {
                        controllerSelection: { dut: "matterjs", helper: "matterjs" },
                        deviceFlavor: "matterjs",
                    };
                    expect(
                        seen.map(({ controllerSelection, deviceFlavor }) => ({ controllerSelection, deviceFlavor })),
                    ).deep.equal([collected, collected]);
                });
            } finally {
                restoreChipTool();
            }
        });

        it("starts the device of a collected case without judging it again by the selection at run time", async () => {
            class ActivationReached extends InternalError {}
            const app = `selection-hook-${tcSuffix()}`;
            registerMatterJsCertSubject(app, () => {
                throw new ActivationReached("the hook went on to start the device");
            });
            registerCertAppPics("matterjs", app, { [APP_ONLY_PICS]: 1 });

            let thrown: unknown;
            try {
                // The TCP transport and the batched-invoke PICS fail under chip-tool and pass under matterjs, and the
                // app's own PICS hold only on the matterjs flavor
                const { active } = withController("matterjs", () =>
                    collect(() =>
                        certTest(`TC-SELECTION-HOOK-${tcSuffix()}`, {
                            plan: "n/a",
                            pics: [BATCH_COMMANDS, APP_ONLY_PICS],
                            app,
                            transport: "tcp",
                        }),
                    ),
                );
                expect(active).to.have.lengthOf(1);

                await withDeviceUntilSettled("chip-local", () =>
                    withControllerUntilSettled("chip-tool", async () =>
                        Reflect.apply(
                            beforeHookOf(active[0]),
                            {
                                skip: () => {
                                    throw new Skipped("skipped");
                                },
                            },
                            [],
                        ),
                    ),
                );
            } catch (e) {
                thrown = e;
            } finally {
                unregisterCertAppPics("matterjs", app);
            }
            expect(thrown).instanceOf(ActivationReached);
        });

        for (const { kind, declaredWith, options, verdict } of [
            { kind: "gap", declaredWith: "chip-tool", options: { transport: "tcp" }, verdict: "controller-gap" },
            {
                kind: "out-of-scope",
                declaredWith: "matterjs-server",
                options: { controllerCapabilities: ["icd-client"] },
                verdict: "skipped",
            },
        ] as const) {
            it(`judges the app PICS of a ${kind} case by the device flavor it was collected under`, async () => {
                const tc = `TC-SELECTION-FLAVOR-${tcSuffix()}`;
                const app = `selection-flavor-${tcSuffix()}`;
                registerCertAppPics("matterjs", app, { [APP_ONLY_PICS]: 1 });
                try {
                    const result = await withOutOfScopeServer(() =>
                        evidenceOf(tc, async () => {
                            const { active } = withController(declaredWith, () =>
                                collect(() => certTest(tc, { plan: "n/a", pics: [APP_ONLY_PICS], app, ...options })),
                            );
                            await withDeviceUntilSettled("chip-local", () => runSkipBody(active[0], declaredWith));
                        }),
                    );
                    expect(result?.verdict).equal(verdict);
                } finally {
                    unregisterCertAppPics("matterjs", app);
                }
            });
        }

        function beforeHookOf(test: object) {
            for (const symbol of Object.getOwnPropertySymbols(test)) {
                const hook = Reflect.get(test, symbol);
                if (symbol.description === "before-hook" && typeof hook === "function") {
                    return hook;
                }
            }
            throw new InternalError("The declared test has no before hook");
        }
    });
});

function fakeAdapter(id: string): ControllerAdapter {
    return {
        id,
        log: new LogFollower(noLines(), id),
        async start() {},
        async close() {},
        async commission() {
            throw new InternalError("not used in this test");
        },
        async parseQrPayload() {
            throw new InternalError("not used in this test");
        },
        async parseManualPairingCode(): Promise<never> {
            throw new InternalError("not used in this test");
        },
        group(): never {
            throw new InternalError("not used in this test");
        },
        node() {
            throw new InternalError("not used in this test");
        },
    };
}

describe("skipOnControllerGap", () => {
    class Skipped extends InternalError {}
    const context = {
        skip(): never {
            throw new Skipped("skipped");
        },
    };

    async function underController<T>(selection: string, outDir: string, fn: () => Promise<T>) {
        const originalController = env.MATTER_CERT_CONTROLLER;
        const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
        env.MATTER_CERT_CONTROLLER = selection;
        env.MATTER_CERT_EVIDENCE_DIR = outDir;
        try {
            return await fn();
        } finally {
            for (const [name, value] of [
                ["MATTER_CERT_CONTROLLER", originalController],
                ["MATTER_CERT_EVIDENCE_DIR", originalEvidenceDir],
            ] as const) {
                if (value === undefined) {
                    delete env[name];
                } else {
                    env[name] = value;
                }
            }
        }
    }

    it("writes a controller-gap bundle and skips where the controller lacks a required capability", async () => {
        const tc = `TC-GAP-HELPER-${Date.now().toString(36)}`;
        const outDir = await mkdtemp(join(tmpdir(), "cert-gap-helper-"));
        try {
            let thrown: unknown;
            await underController("matterjs-server", outDir, async () => {
                try {
                    await skipOnControllerGap(context, { tc, plan: "n/a", controllers: { dut: "dut" } }, [
                        "webrtc-requestor",
                    ]);
                } catch (e) {
                    thrown = e;
                }
            });
            expect(thrown).instanceOf(Skipped);

            const runDir = (await readdir(outDir)).find(name => name.endsWith(`-${tc}`));
            if (!runDir) {
                throw new InternalError(`No evidence directory found for ${tc}`);
            }
            const result = JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8"));
            expect(result.verdict).equal("controller-gap");
            expect(result.controllerGap).contain('controller "matterjs-server" lacks webrtc-requestor');
            expect(result.run.controller).equal("dut");
            expect(result.run.devices).deep.equal([]);
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });

    /** The result record `skipOnControllerGap` writes for `required` under a server declaring a gap and an out-of-scope capability. */
    async function skippedUnderServer(required: ControllerCapability[]) {
        const outDir = await mkdtemp(join(tmpdir(), "cert-gap-helper-"));
        const restore = replaceControllerAdapterRegistrationForTesting("matterjs-server", {
            factory: id => fakeAdapter(id),
            helperImplementation: "matterjs",
            gaps: { "webrtc-requestor": "no requestor" },
            outOfScope: { "icd-client": "not for controllers" },
        });
        try {
            let thrown: unknown;
            await underController("matterjs-server", outDir, async () => {
                try {
                    await skipOnControllerGap(
                        context,
                        { tc: "TC-OUT-OF-SCOPE-HELPER", plan: "n/a", controllers: { dut: "dut" } },
                        required,
                    );
                } catch (e) {
                    thrown = e;
                }
            });
            const [runDir, ...more] = await readdir(outDir);
            expect(more).deep.equal([]);
            return {
                thrown,
                result:
                    runDir === undefined
                        ? undefined
                        : JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8")),
            };
        } finally {
            restore();
            await rm(outDir, { recursive: true, force: true });
        }
    }

    it("records the reason and skips where the controller declares a required capability out of scope", async () => {
        const { thrown, result } = await skippedUnderServer(["icd-client"]);

        expect(thrown).instanceOf(Skipped);
        expect(result.verdict).equal("skipped");
        expect(result.outOfScope).contain('controller "matterjs-server" does not offer icd-client');
        expect(result.controllerGap).undefined;
    });

    it("records a gap where a required capability is a gap and another out of scope", async () => {
        const { thrown, result } = await skippedUnderServer(["icd-client", "webrtc-requestor"]);

        expect(thrown).instanceOf(Skipped);
        expect(result.verdict).equal("controller-gap");
        expect(result.controllerGap).contain('controller "matterjs-server" lacks webrtc-requestor');
        expect(result.outOfScope).undefined;
    });

    it("neither skips nor writes evidence where the controller has every required capability", async () => {
        const outDir = await mkdtemp(join(tmpdir(), "cert-gap-helper-"));
        try {
            await underController("matterjs", outDir, () =>
                skipOnControllerGap(context, { tc: "TC-GAP-HELPER-NONE", plan: "n/a", controllers: { dut: "dut" } }, [
                    "webrtc-requestor",
                ]),
            );
            expect(await readdir(outDir)).deep.equal([]);
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });

    it("returns the selection it judged by, for the case to build its controllers and evidence from", async () => {
        const outDir = await mkdtemp(join(tmpdir(), "cert-gap-helper-"));
        try {
            const selection = await underController("matterjs-server", outDir, () =>
                skipOnControllerGap(context, { tc: "TC-GAP-HELPER-SELECTION", plan: "n/a", controllers: {} }, []),
            );
            expect(selection).deep.equal({ dut: "matterjs-server", helper: "matterjs" });
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });
});
