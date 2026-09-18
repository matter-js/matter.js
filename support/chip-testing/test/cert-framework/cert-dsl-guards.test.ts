/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    certTest,
    createRegisteredCertTest,
    DeviceIdentityExhaustedError,
    identityFor,
    LogFollower,
    PicsFile,
    registerMatterJsCertSubject,
    subjectFactoryFor,
} from "@matter/testing";
import type { CertDevice, CertDeviceFactory, DeviceExitInfo } from "@matter/testing";
import { expect } from "chai";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

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
            throw new Error(`certTest("${tc}") did not register a descriptor`);
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
                throw new Error(`No evidence directory found for ${tc} under ${outDir}`);
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
