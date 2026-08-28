/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest, DeviceIdentityExhaustedError, identityFor } from "@matter/testing";
import { expect } from "chai";

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

    // The bundle records one app and one chip image revision, so a mixed-app run could not say what
    // it ran against
    it("rejects devices running different apps", () => {
        expect(() => declare("TC-MIXED-APP-0.0", { th: "all-clusters", helper: "bridge" })).to.throw(
            /could not say what it ran against/,
        );
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
