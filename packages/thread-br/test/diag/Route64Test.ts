/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Route64 } from "../../src/tlv/diag/Route64.js";

describe("Route64", () => {
    it("decodes a single-router (singleton) entry", () => {
        // seq=0x80, mask byte 0 = 0x80 (router 0 only), routeData = 0x01 (LQOut=0, LQIn=0, cost=1).
        const value = Bytes.of(Bytes.fromHex("808000000000000000" + "01"));
        const r = Route64.decode(value);
        expect(r.idSequence).to.equal(0x80);
        expect(r.entries).to.deep.equal([{ routerId: 0, linkQualityIn: 0, linkQualityOut: 0, routeCost: 1 }]);
    });

    it("decodes routers spread across mask bytes (ids 0, 7, 8, 62)", () => {
        // mask bits: id 0 -> byte 0 MSB (0x80); id 7 -> byte 0 LSB (0x01);
        //           id 8 -> byte 1 MSB (0x80); id 62 -> byte 7 bit (62%8 = 6) -> 0x80>>6 = 0x02.
        const mask = "8180000000000002";
        // four route-data bytes, one per allocated router, in ascending id order:
        // id 0: lqOut=3, lqIn=2, cost=1 -> 0b11_10_0001 = 0xe1
        // id 7: lqOut=0, lqIn=0, cost=0 -> 0x00
        // id 8: lqOut=2, lqIn=3, cost=4 -> 0b10_11_0100 = 0xb4
        // id 62: lqOut=1, lqIn=1, cost=15 -> 0b01_01_1111 = 0x5f
        const dataBytes = "e100b45f";
        const value = Bytes.of(Bytes.fromHex(`12${mask}${dataBytes}`));

        const r = Route64.decode(value);
        expect(r.idSequence).to.equal(0x12);
        expect(r.entries).to.deep.equal([
            { routerId: 0, linkQualityOut: 3, linkQualityIn: 2, routeCost: 1 },
            { routerId: 7, linkQualityOut: 0, linkQualityIn: 0, routeCost: 0 },
            { routerId: 8, linkQualityOut: 2, linkQualityIn: 3, routeCost: 4 },
            { routerId: 62, linkQualityOut: 1, linkQualityIn: 1, routeCost: 15 },
        ]);
    });

    it("decodes a Route64 with no allocated routers (header only)", () => {
        const r = Route64.decode(new Uint8Array(9));
        expect(r.idSequence).to.equal(0);
        expect(r.entries).to.deep.equal([]);
    });

    it("round-trips a multi-router Route64 in any input order", () => {
        const r: Route64 = {
            idSequence: 0xa5,
            entries: [
                { routerId: 8, linkQualityIn: 1, linkQualityOut: 2, routeCost: 3 },
                { routerId: 0, linkQualityIn: 3, linkQualityOut: 3, routeCost: 1 },
                { routerId: 31, linkQualityIn: 2, linkQualityOut: 1, routeCost: 7 },
            ],
        };
        const decoded = Route64.decode(Route64.encode(r));
        expect(decoded.idSequence).to.equal(0xa5);
        expect(decoded.entries).to.deep.equal([...r.entries].sort((a, b) => a.routerId - b.routerId));
    });

    it("rejects size mismatches", () => {
        // Mask reserves router 0 (0x80 in byte 0) but no route-data byte follows.
        expect(() => Route64.decode(Bytes.of(Bytes.fromHex("008000000000000000")))).to.throw(/Route64/);
    });

    it("rejects truncated headers", () => {
        expect(() => Route64.decode(new Uint8Array(8))).to.throw(/Route64/);
    });

    it("rejects router IDs out of range on encode", () => {
        expect(() =>
            Route64.encode({
                idSequence: 0,
                entries: [{ routerId: 63, linkQualityIn: 0, linkQualityOut: 0, routeCost: 0 }],
            }),
        ).to.throw(/range/);
    });

    it("rejects duplicate router IDs on encode", () => {
        expect(() =>
            Route64.encode({
                idSequence: 0,
                entries: [
                    { routerId: 1, linkQualityIn: 0, linkQualityOut: 0, routeCost: 0 },
                    { routerId: 1, linkQualityIn: 0, linkQualityOut: 0, routeCost: 0 },
                ],
            }),
        ).to.throw(/duplicate/);
    });
});
