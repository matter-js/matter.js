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
