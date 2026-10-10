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
    registerControllerAdapterFactory,
    resetControllerAdapterFactoryForTesting,
    registerMatterJsCertSubject,
    subjectFactoryFor,
    unmetControllerCapabilities,
} from "@matter/testing";
import type {
    CertDevice,
    CertDeviceFactory,
    ControllerAdapter,
    ControllerCapability,
    ControllerCapabilityGaps,
    DeviceExitInfo,
} from "@matter/testing";
import { expect } from "chai";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { registerCertControllerAdapter } from "../../src/cert/index.js";

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

describe("certTest DUT app", () => {
    /** Declares a cert test without registering a real mocha test, and returns the definition it built. */
    function definitionOf(tc: string, options: Parameters<typeof certTest>[1]) {
        const originalDescribe = Reflect.get(globalThis, "describe");
        const originalIt = Reflect.get(globalThis, "it");
        const registered = new Array<{ descriptor?: Parameters<typeof createRegisteredCertTest>[0] }>();
        Reflect.set(globalThis, "describe", (_name: string, body: () => void) => body());
        Reflect.set(globalThis, "it", (_name: string, _fn: () => void) => {
            const fakeTest: { descriptor?: Parameters<typeof createRegisteredCertTest>[0] } = {};
            registered.push(fakeTest);
            return fakeTest;
        });
        try {
            certTest(tc, options);
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
            Reflect.set(globalThis, "it", originalIt);
        }

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
        Reflect.set(globalThis, "describe", (_name: string, body: () => void) => body());
        Reflect.set(globalThis, "it", (_name: string, _fn: () => void) => {
            const fakeTest: { descriptor?: Parameters<typeof createRegisteredCertTest>[0] } = {};
            registered.push(fakeTest);
            return fakeTest;
        });

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
            });
        } finally {
            Reflect.set(globalThis, "describe", originalDescribe);
            Reflect.set(globalThis, "it", originalIt);
        }

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

describe("certTest under a dut-only controller", () => {
    /** Runs `body` with the mocha registration functions stubbed; returns the titles `it` / `it.skip` received. */
    function collect(body: () => void) {
        const originalDescribe = Reflect.get(globalThis, "describe");
        const originalIt = Reflect.get(globalThis, "it");
        const pending = new Array<string>();
        const active = new Array<{ descriptor?: Parameters<typeof createRegisteredCertTest>[0] }>();
        const fakeIt = (_name: string, _fn: () => void) => {
            const fakeTest: { descriptor?: Parameters<typeof createRegisteredCertTest>[0] } = {};
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

    it("skips a device-DUT case under a dut-only controller", () => {
        resetControllerAdapterFactoryForTesting("matterjs-server");
        registerControllerAdapterFactory("matterjs-server", id => fakeAdapter(id), undefined, "dut-only");
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
            resetControllerAdapterFactoryForTesting("matterjs-server");
            registerCertControllerAdapter("matterjs-server");
        }
    });

    it("skips a case before any device starts where its DUT controller lacks a capability it declares", () => {
        const declare = (tc: string) =>
            certTest(tc, {
                plan: "n/a",
                pics: [],
                app: "all-clusters",
                controllerCapabilities: ["group-messaging"],
            });

        const underServer = withController("matterjs-server", () => collect(() => declare("TC-CAPABILITY-SKIP-0.0")));
        expect(underServer.pending).to.have.lengthOf(1);
        expect(underServer.pending[0]).to.contain('controller "matterjs-server" lacks group-messaging');
        expect(underServer.active).to.have.lengthOf(0);

        const underMatterJs = withController("matterjs", () => collect(() => declare("TC-CAPABILITY-SKIP-0.1")));
        expect(underMatterJs.pending).to.have.lengthOf(0);
        expect(underMatterJs.active).to.have.lengthOf(1);
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
        expect(underChipTool.pending).to.have.lengthOf(1);
        expect(underChipTool.pending[0]).to.contain('controller "chip-tool" lacks tcp-transport');

        const underMatterJs = withController("matterjs", () => collect(() => declare("TC-CAPABILITY-SKIP-1.1")));
        expect(underMatterJs.active).to.have.lengthOf(1);
    });

    it("finds what a test's controllers lack from its declaration and its transport", () => {
        withController("matterjs-server", () => {
            expect(unmetControllerCapabilities({ transport: "tcp" })).to.contain("lacks tcp-transport");
            expect(unmetControllerCapabilities({ controllerCapabilities: ["data-versions"] })).to.contain(
                "lacks data-versions",
            );
            expect(unmetControllerCapabilities({ transport: "tcp", controllers: { th: "helper" } })).equal(undefined);
            expect(unmetControllerCapabilities({})).equal(undefined);
        });
    });

    it("builds helper roles from matterjs and records that in the evidence", async () => {
        const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const app = `dut-only-primary-${suffix}`;
        const tc = `TC-DUT-ONLY-RUN-${suffix}`;
        registerMatterJsCertSubject(app, fakeMatterJsCertDevice(app));

        const built = new Array<string>();
        resetControllerAdapterFactoryForTesting("matterjs");
        resetControllerAdapterFactoryForTesting("matterjs-server");
        registerControllerAdapterFactory("matterjs", id => {
            built.push(`matterjs:${id}`);
            return fakeAdapter(id);
        });
        registerControllerAdapterFactory(
            "matterjs-server",
            id => {
                built.push(`matterjs-server:${id}`);
                return { ...fakeAdapter(id), build: { entry: "fake-entry", sdkVersion: "1.2.3" } };
            },
            undefined,
            "dut-only",
        );

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
                    }).step(1, "Nothing to do", async () => {});
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
            resetControllerAdapterFactoryForTesting("matterjs-server");
            registerCertControllerAdapter("matterjs-server");
            resetControllerAdapterFactoryForTesting("matterjs");
            registerCertControllerAdapter("matterjs");
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

    /**
     * Registers `matterjs` and a dut-only `matterjs-server` with the given capability gaps for the duration of `body`,
     * and restores the production registrations afterwards.
     */
    async function withFakeControllers<T>(
        gaps: { matterjs?: ControllerCapabilityGaps; server?: ControllerCapabilityGaps },
        body: () => Promise<T>,
    ) {
        resetControllerAdapterFactoryForTesting("matterjs");
        resetControllerAdapterFactoryForTesting("matterjs-server");
        registerControllerAdapterFactory("matterjs", id => fakeAdapter(id), undefined, "all-roles", gaps.matterjs);
        registerControllerAdapterFactory("matterjs-server", id => fakeAdapter(id), undefined, "dut-only", gaps.server);
        try {
            return await body();
        } finally {
            resetControllerAdapterFactoryForTesting("matterjs-server");
            registerCertControllerAdapter("matterjs-server");
            resetControllerAdapterFactoryForTesting("matterjs");
            registerCertControllerAdapter("matterjs");
        }
    }

    /** Declares `tc` under `declaredWith`, runs it under `runWith` and returns the evidence record it wrote. */
    async function runCase(
        tc: string,
        options: Omit<Parameters<typeof certTest>[1], "plan" | "pics" | "app">,
        steps: { caps?: ControllerCapability[] }[],
        selection: { declaredWith: string; runWith?: string },
    ) {
        const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const app = `roles-app-${suffix}`;
        registerMatterJsCertSubject(app, fakeMatterJsCertDevice(app));

        const outDir = await mkdtemp(join(tmpdir(), "cert-dsl-roles-"));
        const originalEvidenceDir = env.MATTER_CERT_EVIDENCE_DIR;
        const originalController = env.MATTER_CERT_CONTROLLER;
        try {
            env.MATTER_CERT_EVIDENCE_DIR = outDir;
            const { active } = withController(selection.declaredWith, () =>
                collect(() => {
                    const builder = certTest(tc, { plan: "n/a", pics: [], app, ...options });
                    steps.forEach(({ caps }, index) =>
                        builder.step(index + 1, `Step ${index + 1}`, async () => {}, {
                            controllerCapabilities: caps,
                        }),
                    );
                }),
            );
            const descriptor = active[0]?.descriptor;
            if (!descriptor) {
                throw new InternalError(`certTest("${tc}") did not register a descriptor`);
            }

            env.MATTER_CERT_CONTROLLER = selection.runWith ?? selection.declaredWith;
            await createRegisteredCertTest(descriptor).invoke(fakeMatterJsCertDevice(app)("cert"), () => {}, [], false);

            const runDir = (await readdir(outDir)).find(name => name.endsWith(`-${tc}`));
            if (!runDir) {
                throw new InternalError(`No evidence directory found for ${tc}`);
            }
            return JSON.parse(await readFile(join(outDir, runDir, "result.json"), "utf-8"));
        } finally {
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
            { name: "a dut-only controller with only a dut role", selection: "matterjs-server", roles: { dut: "dut" } },
            {
                name: "the same implementation for dut and helper roles",
                selection: "matterjs",
                roles: { dut: "dut", th: "helper" },
            },
            {
                name: "a dut-only controller whose helper role falls back to matterjs",
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
                const declare = (tc: string, controllers: Record<string, "dut" | "helper">) =>
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
                expect(withHelper.pending).to.have.lengthOf(1);
                expect(withHelper.pending[0]).to.contain('controller "matterjs" lacks group-messaging');

                const dutOnly = declare(`TC-ROLE-DECL-${tcSuffix()}`, { dut: "dut" });
                expect(dutOnly.pending).to.have.lengthOf(0);
                expect(dutOnly.active).to.have.lengthOf(1);
            });
        });
    });

    describe("controller selection changing after collection", () => {
        class HookSkipped extends InternalError {}

        function beforeHookOf(test: object) {
            for (const symbol of Object.getOwnPropertySymbols(test)) {
                const hook = Reflect.get(test, symbol);
                if (symbol.description === "before-hook" && typeof hook === "function") {
                    return hook;
                }
            }
            throw new InternalError("The declared test has no before hook");
        }

        it("skips the case when the selection at run time lacks a capability the collected one had", async () => {
            const { active, pending } = withController("matterjs", () =>
                collect(() =>
                    certTest(`TC-SELECTION-CHANGE-${tcSuffix()}`, {
                        plan: "n/a",
                        pics: [],
                        app: "all-clusters",
                        transport: "tcp",
                    }),
                ),
            );
            expect(pending).to.have.lengthOf(0);
            expect(active).to.have.lengthOf(1);

            const hook = beforeHookOf(active[0]);
            const context = {
                skip() {
                    throw new HookSkipped("skipped");
                },
            };

            const original = env.MATTER_CERT_CONTROLLER;
            try {
                env.MATTER_CERT_CONTROLLER = "chip-tool";
                let thrown: unknown;
                try {
                    await Reflect.apply(hook, context, []);
                } catch (e) {
                    thrown = e;
                }
                expect(thrown).instanceOf(HookSkipped);
            } finally {
                if (original === undefined) {
                    delete env.MATTER_CERT_CONTROLLER;
                } else {
                    env.MATTER_CERT_CONTROLLER = original;
                }
            }
        });
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
