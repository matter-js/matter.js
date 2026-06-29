/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import {
    Address16,
    BatteryLevel,
    ChannelPages,
    Eui64,
    ExtMacAddress,
    MaxChildTimeout,
    SupplyVoltage,
} from "../../src/tlv/diag/Primitives.js";

describe("ExtMacAddress", () => {
    it("decodes an 8-byte EUI-64", () => {
        const hex = "0011223344556677";
        expect(ExtMacAddress.decode(Bytes.of(Bytes.fromHex(hex)))).to.deep.equal(Bytes.of(Bytes.fromHex(hex)));
    });

    it("round-trips and returns a defensive copy", () => {
        const input = Bytes.of(Bytes.fromHex("a1a2a3a4a5a6a7a8"));
        const encoded = ExtMacAddress.encode(input);
        encoded[0] = 0xff;
        expect(input[0]).to.equal(0xa1);
    });

    it("rejects bad sizes", () => {
        expect(() => ExtMacAddress.decode(new Uint8Array(7))).to.throw(/8 bytes/);
        expect(() => ExtMacAddress.encode(new Uint8Array(9))).to.throw(/8 bytes/);
    });
});

describe("Eui64", () => {
    it("round-trips an 8-byte factory-assigned EUI-64", () => {
        const v = Bytes.of(Bytes.fromHex("0123456789abcdef"));
        expect(Eui64.decode(Eui64.encode(v))).to.deep.equal(v);
    });
});

describe("Address16", () => {
    it("decodes an RLOC16", () => {
        expect(Address16.decode(Bytes.of(Bytes.fromHex("ac00")))).to.equal(0xac00);
    });

    it("round-trips 0..0xFFFF", () => {
        for (const v of [0, 1, 0x1234, 0xfffe, 0xffff]) {
            expect(Address16.decode(Address16.encode(v))).to.equal(v);
        }
    });

    it("rejects out-of-range", () => {
        expect(() => Address16.encode(0x10000)).to.throw(/range/);
        expect(() => Address16.decode(new Uint8Array(3))).to.throw(/2 bytes/);
    });
});

describe("BatteryLevel", () => {
    it("decodes percent values", () => {
        expect(BatteryLevel.decode(new Uint8Array([100]))).to.equal(100);
    });

    it("round-trips 0..255", () => {
        for (const v of [0, 50, 100, 255]) {
            expect(BatteryLevel.decode(BatteryLevel.encode(v))).to.equal(v);
        }
    });

    it("rejects bad sizes", () => {
        expect(() => BatteryLevel.decode(new Uint8Array(2))).to.throw(/1 byte/);
    });
});

describe("SupplyVoltage", () => {
    it("decodes uint16 BE millivolts (3300mV)", () => {
        expect(SupplyVoltage.decode(Bytes.of(Bytes.fromHex("0ce4")))).to.equal(3300);
    });

    it("round-trips 0..65535", () => {
        for (const v of [0, 3300, 0xffff]) {
            expect(SupplyVoltage.decode(SupplyVoltage.encode(v))).to.equal(v);
        }
    });
});

describe("MaxChildTimeout", () => {
    it("decodes uint32 BE seconds", () => {
        expect(MaxChildTimeout.decode(Bytes.of(Bytes.fromHex("00015180")))).to.equal(86400);
    });

    it("round-trips edge values", () => {
        for (const v of [0, 1, 86400, 0xffffffff]) {
            expect(MaxChildTimeout.decode(MaxChildTimeout.encode(v))).to.equal(v);
        }
    });
});

describe("ChannelPages", () => {
    it("decodes a list of supported page bytes", () => {
        expect(ChannelPages.decode(new Uint8Array([0]))).to.deep.equal([0]);
        expect(ChannelPages.decode(new Uint8Array([0, 2]))).to.deep.equal([0, 2]);
    });

    it("round-trips arbitrary page lists", () => {
        const pages = [0, 2, 9, 20];
        expect(ChannelPages.decode(ChannelPages.encode(pages))).to.deep.equal(pages);
    });

    it("decodes an empty list", () => {
        expect(ChannelPages.decode(new Uint8Array())).to.deep.equal([]);
    });

    it("rejects invalid entries", () => {
        expect(() => ChannelPages.encode([300])).to.throw(/range/);
    });
});
