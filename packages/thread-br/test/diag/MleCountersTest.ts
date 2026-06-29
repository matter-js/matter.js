/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { MleCounters } from "../../src/tlv/diag/MleCounters.js";

describe("MleCounters", () => {
    it("decodes a typical 66-byte counter block", () => {
        const buf = new Uint8Array(66);
        // 9 × uint16 BE: 1, 2, 3, ..., 9 in role-counter order.
        for (let i = 0; i < 9; i++) {
            buf[i * 2] = 0;
            buf[i * 2 + 1] = i + 1;
        }
        // First u64 (trackedTime) = 0x0000_0001_0000_0000 (just over uint32).
        buf[18 + 3] = 1;

        const c = MleCounters.decode(buf);
        expect(c.disabledRole).to.equal(1);
        expect(c.detachedRole).to.equal(2);
        expect(c.childRole).to.equal(3);
        expect(c.routerRole).to.equal(4);
        expect(c.leaderRole).to.equal(5);
        expect(c.attachAttempts).to.equal(6);
        expect(c.partitionIdChanges).to.equal(7);
        expect(c.betterPartitionAttachAttempts).to.equal(8);
        expect(c.parentChanges).to.equal(9);
        expect(c.trackedTime).to.equal(0x100000000n);
        expect(c.disabledTime).to.equal(0n);
    });

    it("decodes the maximum 64-bit accumulator without precision loss", () => {
        const buf = new Uint8Array(66);
        for (let i = 18; i < 18 + 8; i++) buf[i] = 0xff;

        const c = MleCounters.decode(buf);
        expect(c.trackedTime).to.equal((1n << 64n) - 1n);
    });

    it("round-trips arbitrary counters", () => {
        const c: MleCounters = {
            disabledRole: 100,
            detachedRole: 200,
            childRole: 300,
            routerRole: 400,
            leaderRole: 500,
            attachAttempts: 600,
            partitionIdChanges: 700,
            betterPartitionAttachAttempts: 800,
            parentChanges: 900,
            trackedTime: 1234567890123456789n,
            disabledTime: 1n,
            detachedTime: 2n,
            childTime: 0xdeadbeefcafebaben,
            routerTime: 0n,
            leaderTime: (1n << 63n) + 7n,
        };
        expect(MleCounters.decode(MleCounters.encode(c))).to.deep.equal(c);
    });

    it("rejects malformed lengths", () => {
        expect(() => MleCounters.decode(new Uint8Array(65))).to.throw(/66/);
    });

    it("rejects out-of-range encode inputs", () => {
        const base: MleCounters = {
            disabledRole: 0,
            detachedRole: 0,
            childRole: 0,
            routerRole: 0,
            leaderRole: 0,
            attachAttempts: 0,
            partitionIdChanges: 0,
            betterPartitionAttachAttempts: 0,
            parentChanges: 0,
            trackedTime: 0n,
            disabledTime: 0n,
            detachedTime: 0n,
            childTime: 0n,
            routerTime: 0n,
            leaderTime: 0n,
        };
        expect(() => MleCounters.encode({ ...base, disabledRole: 0x10000 })).to.throw(/range/);
        expect(() => MleCounters.encode({ ...base, trackedTime: -1n })).to.throw(/range/);
        expect(() => MleCounters.encode({ ...base, trackedTime: 1n << 64n })).to.throw(/range/);
    });
});
