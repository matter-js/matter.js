/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { type ChildTableEntry, ChildTable } from "../../src/tlv/diag/ChildTable.js";

describe("ChildTable", () => {
    it("decodes a single entry: timeout=11 (128s), ilq=2, childId=0x42, sleepy MED mode", () => {
        // word = (11<<11) | (2<<9) | 0x42 = 0x5c42 -> bytes 5c 42; mode 04 (only reserved bit).
        const entries = ChildTable.decode(Bytes.of(Bytes.fromHex("5c4204")));
        expect(entries).to.have.lengthOf(1);
        expect(entries[0].timeoutExponent).to.equal(11);
        expect(entries[0].timeoutSeconds).to.equal(128);
        expect(entries[0].incomingLinkQuality).to.equal(2);
        expect(entries[0].childId).to.equal(0x42);
        expect(entries[0].mode).to.deep.equal({
            rxOnWhenIdle: false,
            fullThreadDevice: false,
            fullNetworkData: false,
        });
    });

    it("decodes an empty child table", () => {
        expect(ChildTable.decode(new Uint8Array())).to.deep.equal([]);
    });

    it("decodes multiple entries", () => {
        // Entry 1: exp=4 -> 1s timeout, ilq=0, id=0; mode router (0x0F).
        // Entry 2: exp=20 -> 65536s, ilq=3, id=0x1ff; mode FTD-only (0x06 — reserved+ftd).
        const entries = ChildTable.decode(Bytes.of(Bytes.fromHex("20000fa7ff06")));
        expect(entries).to.have.lengthOf(2);
        expect(entries[0]).to.deep.include({
            timeoutExponent: 4,
            timeoutSeconds: 1,
            incomingLinkQuality: 0,
            childId: 0,
        });
        expect(entries[0].mode.rxOnWhenIdle).to.equal(true);
        expect(entries[1]).to.deep.include({
            timeoutExponent: 20,
            timeoutSeconds: 65536,
            incomingLinkQuality: 3,
            childId: 0x1ff,
        });
        expect(entries[1].mode.fullThreadDevice).to.equal(true);
        expect(entries[1].mode.rxOnWhenIdle).to.equal(false);
    });

    it("round-trips arbitrary entries", () => {
        const entries: ChildTableEntry[] = [
            {
                timeoutExponent: 8,
                timeoutSeconds: 16,
                incomingLinkQuality: 1,
                childId: 5,
                mode: { rxOnWhenIdle: true, fullThreadDevice: false, fullNetworkData: true },
            },
            {
                timeoutExponent: 31,
                timeoutSeconds: 1 << 27,
                incomingLinkQuality: 3,
                childId: 0x100,
                mode: { rxOnWhenIdle: false, fullThreadDevice: false, fullNetworkData: false },
            },
        ];
        const decoded = ChildTable.decode(ChildTable.encode(entries));
        expect(decoded).to.deep.equal(entries);
    });

    it("rejects malformed lengths", () => {
        expect(() => ChildTable.decode(new Uint8Array(2))).to.throw(/multiple of 3/);
        expect(() => ChildTable.decode(new Uint8Array(4))).to.throw(/multiple of 3/);
    });

    it("rejects encode inputs that are out of range", () => {
        const base: ChildTableEntry = {
            timeoutExponent: 8,
            timeoutSeconds: 16,
            incomingLinkQuality: 0,
            childId: 0,
            mode: { rxOnWhenIdle: false, fullThreadDevice: false, fullNetworkData: false },
        };
        expect(() => ChildTable.encode([{ ...base, timeoutExponent: 32 }])).to.throw(/timeoutExponent/);
        expect(() => ChildTable.encode([{ ...base, incomingLinkQuality: 4 }])).to.throw(/incomingLinkQuality/);
        expect(() => ChildTable.encode([{ ...base, childId: 0x200 }])).to.throw(/childId/);
    });
});
