/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { RouterNeighbor } from "../../src/tlv/diag/RouterNeighbor.js";

// Per-entry layout from OpenThread `src/core/thread/net_diag_tlvs.hpp`
// `RouterNeighborTlvValue` (packed struct, 24 bytes total):
//
//   [0]      uint8     mFlags — bit 7 = kFlagsTrackErrRate
//   [1..2]   uint16 BE mRloc16
//   [3..10]  uint8[8]  mExtAddress
//   [11..12] uint16 BE mVersion
//   [13..16] uint32 BE mConnectionTime (seconds since link establishment)
//   [17]     uint8     mLinkMargin (dB)
//   [18]     int8      mAverageRssi (dBm; 127 = unknown)
//   [19]     int8      mLastRssi   (dBm; 127 = unknown)
//   [20..21] uint16 BE mFrameErrorRate   (0x0000=0%, 0xffff=100%; valid only when kFlagsTrackErrRate set)
//   [22..23] uint16 BE mMessageErrorRate (0x0000=0%, 0xffff=100%; valid only when kFlagsTrackErrRate set)

describe("RouterNeighbor.decode", () => {
    // Hand-built fixture — two entries, 48 bytes total.
    //
    // Entry 1 (byte 0..23):
    //   flags=0x80 (TrackErrRate=1), rloc16=0x1400, ext=0102030405060708,
    //   version=0x0004, connTime=0x00000078 (120 s), linkMargin=20,
    //   averageRssi=0xce (-50 dBm), lastRssi=0xd8 (-40 dBm),
    //   frameErrorRate=0x0666 (~2.5%), messageErrorRate=0x0333 (~1.25%)
    //
    // Entry 2 (byte 24..47):
    //   flags=0x00 (TrackErrRate=0), rloc16=0x2800, ext=0807060504030201,
    //   version=0x0003, connTime=0x0000012c (300 s), linkMargin=15,
    //   averageRssi=0xe2 (-30 dBm), lastRssi=0xec (-20 dBm),
    //   frameErrorRate=0x0000, messageErrorRate=0x0000 (invalid — flag unset)
    const entry1 = "80" + "1400" + "0102030405060708" + "0004" + "00000078" + "14" + "ce" + "d8" + "0666" + "0333";
    const entry2 = "00" + "2800" + "0807060504030201" + "0003" + "0000012c" + "0f" + "e2" + "ec" + "0000" + "0000";
    const twoEntries = Bytes.fromHex(entry1 + entry2);

    it("decodes two entries with all fields", () => {
        const result = RouterNeighbor.decode(Bytes.of(twoEntries));
        expect(result).to.have.length(2);

        const e0 = result[0];
        expect(e0.rloc16).to.equal(0x1400);
        expect(Bytes.toHex(e0.extAddress)).to.equal("0102030405060708");
        expect(e0.version).to.equal(4);
        expect(e0.connectionTime).to.equal(120);
        expect(e0.linkMargin).to.equal(20);
        expect(e0.supportsErrorRate).to.equal(true);
        expect(e0.averageRssi).to.equal(-50);
        expect(e0.lastRssi).to.equal(-40);
        expect(e0.frameErrorRate).to.equal(0x0666);
        expect(e0.messageErrorRate).to.equal(0x0333);

        const e1 = result[1];
        expect(e1.rloc16).to.equal(0x2800);
        expect(Bytes.toHex(e1.extAddress)).to.equal("0807060504030201");
        expect(e1.version).to.equal(3);
        expect(e1.connectionTime).to.equal(300);
        expect(e1.linkMargin).to.equal(15);
        expect(e1.supportsErrorRate).to.equal(false);
        expect(e1.averageRssi).to.equal(-30);
        expect(e1.lastRssi).to.equal(-20);
        expect(e1.frameErrorRate).to.equal(0x0000);
        expect(e1.messageErrorRate).to.equal(0x0000);
    });

    it("decodes a single entry", () => {
        const result = RouterNeighbor.decode(Bytes.of(Bytes.fromHex(entry1)));
        expect(result).to.have.length(1);
        expect(result[0].rloc16).to.equal(0x1400);
        expect(result[0].supportsErrorRate).to.equal(true);
    });

    it("returns empty array for empty value", () => {
        expect(RouterNeighbor.decode(new Uint8Array())).to.deep.equal([]);
    });

    it("degrades gracefully on truncated value (drops partial trailing entry)", () => {
        // 24 + 10 bytes — second entry is incomplete; only one entry parsed.
        // entry2.slice(0, 20) takes 20 hex chars = 10 bytes.
        const partial = Bytes.of(Bytes.fromHex(entry1 + entry2.slice(0, 20)));
        const result = RouterNeighbor.decode(partial);
        expect(result).to.have.length(1);
        expect(result[0].rloc16).to.equal(0x1400);
    });

    it("degrades gracefully when value is shorter than one entry", () => {
        expect(RouterNeighbor.decode(new Uint8Array(10))).to.deep.equal([]);
    });

    it("decodes averageRssi=127 as 127 (not-available sentinel)", () => {
        // Replace averageRssi byte (offset 18) with 0x7f (127).
        const raw = Bytes.of(Bytes.fromHex(entry1)).slice();
        raw[18] = 0x7f;
        const result = RouterNeighbor.decode(raw);
        expect(result[0].averageRssi).to.equal(127);
    });

    it("decodes the int8 RSSI boundaries (0x80 = -128, 0xff = -1)", () => {
        const raw = Bytes.of(Bytes.fromHex(entry1)).slice();
        raw[18] = 0x80;
        raw[19] = 0xff;
        const result = RouterNeighbor.decode(raw);
        expect(result[0].averageRssi).to.equal(-128);
        expect(result[0].lastRssi).to.equal(-1);
    });
});
