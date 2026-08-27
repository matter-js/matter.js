/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest, MultiDeviceUnsupportedError } from "@matter/testing";
import { expect } from "chai";

// Calling certTest() with more than one declared device must reject synchronously, before it
// registers anything with mocha — a `describe`/`it` registered straight at module scope in this
// spec glob would otherwise crash the whole cert-dir run's collection phase, not just this check.
describe("certTest multi-device guard", () => {
    it("rejects a definition with more than one device", () => {
        expect(() =>
            certTest("TC-MULTI-DEVICE-GUARD-0.0", {
                plan: "n/a",
                pics: [],
                app: "all-clusters",
                devices: { th: "all-clusters", th2: "bridge" },
            }),
        ).to.throw(MultiDeviceUnsupportedError, /declares 2 devices \(th, th2\)/);
    });
});

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
