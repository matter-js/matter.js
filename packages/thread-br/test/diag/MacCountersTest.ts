/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { MacCounters } from "../../src/tlv/diag/MacCounters.js";

describe("MacCounters", () => {
    it("decodes nine consecutive uint32 BE fields in OpenThread order", () => {
        const hex =
            "00000001" + // ifInUnknownProtos
            "00000002" + // ifInErrors
            "00000003" + // ifOutErrors
            "0000000a" + // ifInUcastPkts
            "0000000b" + // ifInBroadcastPkts
            "00000004" + // ifInDiscards
            "0000000c" + // ifOutUcastPkts
            "0000000d" + // ifOutBroadcastPkts
            "00000005"; // ifOutDiscards
        const c = MacCounters.decode(Bytes.of(Bytes.fromHex(hex)));
        expect(c).to.deep.equal({
            ifInUnknownProtos: 1,
            ifInErrors: 2,
            ifOutErrors: 3,
            ifInUcastPkts: 10,
            ifInBroadcastPkts: 11,
            ifInDiscards: 4,
            ifOutUcastPkts: 12,
            ifOutBroadcastPkts: 13,
            ifOutDiscards: 5,
        });
    });

    it("decodes maximum values (saturated counters)", () => {
        const c = MacCounters.decode(new Uint8Array(36).fill(0xff));
        expect(c.ifInUnknownProtos).to.equal(0xffffffff);
        expect(c.ifOutDiscards).to.equal(0xffffffff);
    });

    it("round-trips arbitrary counters", () => {
        const c: MacCounters = {
            ifInUnknownProtos: 0xdeadbeef,
            ifInErrors: 0,
            ifOutErrors: 1,
            ifInUcastPkts: 0xcafe,
            ifInBroadcastPkts: 0x12345678,
            ifInDiscards: 0xabcd,
            ifOutUcastPkts: 0x80000000,
            ifOutBroadcastPkts: 0x7fffffff,
            ifOutDiscards: 42,
        };
        expect(MacCounters.decode(MacCounters.encode(c))).to.deep.equal(c);
    });

    it("rejects malformed lengths", () => {
        expect(() => MacCounters.decode(new Uint8Array(35))).to.throw(/36/);
        expect(() => MacCounters.decode(new Uint8Array(40))).to.throw(/36/);
    });

    it("rejects out-of-range encode inputs", () => {
        const base: MacCounters = {
            ifInUnknownProtos: 0,
            ifInErrors: 0,
            ifOutErrors: 0,
            ifInUcastPkts: 0,
            ifInBroadcastPkts: 0,
            ifInDiscards: 0,
            ifOutUcastPkts: 0,
            ifOutBroadcastPkts: 0,
            ifOutDiscards: 0,
        };
        expect(() => MacCounters.encode({ ...base, ifInErrors: -1 })).to.throw(/range/);
        expect(() => MacCounters.encode({ ...base, ifInErrors: 0x100000000 })).to.throw(/range/);
    });
});
