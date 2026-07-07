/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnssdParameters } from "#net/dns-sd/DnssdParameters.js";
import { Bytes } from "#util/Bytes.js";

describe("DnssdParameters", () => {
    const xaBytes = Bytes.fromHex("5aaf359c0501a1b0");

    function fixture() {
        return new DnssdParameters(
            new Map<string, Bytes>([
                ["SII", Bytes.fromString("5000")],
                ["flag", new Uint8Array(0)],
                ["xa", xaBytes],
            ]),
        );
    }

    describe("get", () => {
        it("UTF-8 decodes ASCII values", () => {
            expect(fixture().get("SII")).equal("5000");
        });

        it("returns empty string for empty values", () => {
            expect(fixture().get("flag")).equal("");
        });

        it("returns undefined for missing keys", () => {
            expect(fixture().get("missing")).equal(undefined);
        });
    });

    describe("raw", () => {
        it("returns the original bytes losslessly", () => {
            const raw = fixture().raw("xa");
            expect(raw).not.equal(undefined);
            expect(Bytes.areEqual(raw!, xaBytes)).true;
        });

        it("returns undefined for missing keys", () => {
            expect(fixture().raw("missing")).equal(undefined);
        });
    });

    describe("has", () => {
        it("reflects presence", () => {
            const p = fixture();
            expect(p.has("SII")).true;
            expect(p.has("xa")).true;
            expect(p.has("missing")).false;
        });
    });

    describe("size", () => {
        it("matches the underlying entry count", () => {
            expect(fixture().size).equal(3);
        });
    });

    describe("keys", () => {
        it("yields all keys", () => {
            expect([...fixture().keys()]).deep.equals(["SII", "flag", "xa"]);
        });
    });

    describe("values", () => {
        it("yields UTF-8 decoded strings", () => {
            expect([...fixture().values()]).deep.equals(["5000", "", Bytes.toString(xaBytes)]);
        });
    });

    describe("entries", () => {
        it("yields [key, decoded-value] pairs", () => {
            expect([...fixture().entries()]).deep.equals([
                ["SII", "5000"],
                ["flag", ""],
                ["xa", Bytes.toString(xaBytes)],
            ]);
        });
    });

    describe("Symbol.iterator", () => {
        it("yields the same shape as entries()", () => {
            expect([...fixture()]).deep.equals([...fixture().entries()]);
        });
    });

    describe("forEach", () => {
        it("invokes callback with (value, key, map)", () => {
            const seen = new Array<[string, string, ReadonlyMap<string, string>]>();
            const p = fixture();
            p.forEach((value, key, map) => seen.push([value, key, map]));
            expect(seen).deep.equals([
                ["5000", "SII", p],
                ["", "flag", p],
                [Bytes.toString(xaBytes), "xa", p],
            ]);
        });

        it("honours thisArg", () => {
            const ctx = { tag: "captured" };
            const seen = new Array<string>();
            fixture().forEach(function (this: typeof ctx) {
                seen.push(this.tag);
            }, ctx);
            expect(seen).deep.equals(["captured", "captured", "captured"]);
        });
    });
});
