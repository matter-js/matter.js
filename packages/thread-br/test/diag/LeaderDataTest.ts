/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { LeaderData } from "../../src/tlv/diag/LeaderData.js";

describe("LeaderData", () => {
    it("decodes a typical leader data block", () => {
        // partition=0x12345678, weight=64, dataVer=10, stableVer=8, leaderRouterId=2.
        const ld = LeaderData.decode(Bytes.of(Bytes.fromHex("12345678400a0802")));
        expect(ld.partitionId).to.equal(0x12345678);
        expect(ld.weighting).to.equal(0x40);
        expect(ld.dataVersion).to.equal(10);
        expect(ld.stableDataVersion).to.equal(8);
        expect(ld.leaderRouterId).to.equal(2);
    });

    it("round-trips arbitrary values", () => {
        const ld: LeaderData = {
            partitionId: 0xdeadbeef,
            weighting: 64,
            dataVersion: 200,
            stableDataVersion: 199,
            leaderRouterId: 31,
        };
        expect(LeaderData.decode(LeaderData.encode(ld))).to.deep.equal(ld);
    });

    it("decodes an all-zero leader data block", () => {
        const ld = LeaderData.decode(new Uint8Array(8));
        expect(ld.partitionId).to.equal(0);
        expect(ld.leaderRouterId).to.equal(0);
    });

    it("rejects values that are not exactly 8 bytes", () => {
        expect(() => LeaderData.decode(new Uint8Array(7))).to.throw(/8 bytes/);
        expect(() => LeaderData.decode(new Uint8Array(9))).to.throw(/8 bytes/);
    });
});
