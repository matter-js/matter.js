/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mode } from "../../src/tlv/diag/Mode.js";

describe("Mode", () => {
    it("decodes a router-grade FTD mode (0x0F)", () => {
        // Router: rxOnIdle=1, reserved=1, ftd=1, fullData=1.
        const m = Mode.decode(new Uint8Array([0x0f]));
        expect(m.rxOnWhenIdle).to.equal(true);
        expect(m.fullThreadDevice).to.equal(true);
        expect(m.fullNetworkData).to.equal(true);
    });

    it("decodes a sleepy MED mode (0x04)", () => {
        // Sleepy minimal: only the reserved bit is set.
        const m = Mode.decode(new Uint8Array([0x04]));
        expect(m.rxOnWhenIdle).to.equal(false);
        expect(m.fullThreadDevice).to.equal(false);
        expect(m.fullNetworkData).to.equal(false);
    });

    it("encodes always sets the reserved bit (Thread spec / OpenThread DeviceMode::Set)", () => {
        const encoded = Mode.encode({ rxOnWhenIdle: false, fullThreadDevice: false, fullNetworkData: false });
        expect(encoded).to.deep.equal(new Uint8Array([0x04]));
    });

    it("round-trips a router-grade Mode", () => {
        const m: Mode = { rxOnWhenIdle: true, fullThreadDevice: true, fullNetworkData: true };
        expect(Mode.decode(Mode.encode(m))).to.deep.equal(m);
    });

    it("round-trips a non-sleepy MTD (REED) Mode", () => {
        const m: Mode = { rxOnWhenIdle: true, fullThreadDevice: false, fullNetworkData: true };
        expect(Mode.decode(Mode.encode(m))).to.deep.equal(m);
    });

    it("rejects values that are not exactly 1 byte", () => {
        expect(() => Mode.decode(new Uint8Array())).to.throw(/1 byte/);
        expect(() => Mode.decode(new Uint8Array([1, 2]))).to.throw(/1 byte/);
    });
});
