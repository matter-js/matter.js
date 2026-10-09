/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryData } from "#common/Scanner.js";
import { Millis } from "@matter/general";

describe("DiscoveryData", () => {
    function decode(entries: Record<string, string>) {
        return DiscoveryData(new Map(Object.entries(entries)));
    }

    describe("SII/SAI/SAT decoding", () => {
        it("decodes valid values", () => {
            expect(decode({ SII: "5000", SAI: "300", SAT: "4000" })).deep.equal({
                SII: Millis(5000),
                SAI: Millis(300),
                SAT: Millis(4000),
            });
        });

        it("accepts SII/SAI at the maximum of 3600000 ms and zero", () => {
            expect(decode({ SII: "3600000", SAI: "0" })).deep.equal({
                SII: Millis(3600000),
                SAI: Millis(0),
            });
        });

        it("accepts SAT at the maximum of 65535 ms", () => {
            expect(decode({ SAT: "65535" })).deep.equal({ SAT: Millis(65535) });
        });

        it("drops SII/SAI above 3600000 ms", () => {
            expect(decode({ SII: "3600001", SAI: "4000000" })).deep.equal({});
        });

        it("drops SAT above 65535 ms and SAT of zero", () => {
            expect(decode({ SAT: "65536" })).deep.equal({});
            expect(decode({ SAT: "0" })).deep.equal({});
        });

        it("drops empty values", () => {
            expect(decode({ SII: "", SAI: "", SAT: "" })).deep.equal({});
        });

        it("drops non-numeric and non-integer values", () => {
            expect(decode({ SII: "abc", SAI: "12.5", SAT: "-5" })).deep.equal({});
            expect(decode({ SII: "1e3", SAI: " 5", SAT: "0x10" })).deep.equal({});
        });

        it("drops values with leading zeros", () => {
            expect(decode({ SII: "0500", SAI: "007", SAT: "065535" })).deep.equal({});
        });
    });

    describe("VP/DT/PH decoding", () => {
        it("decodes valid values", () => {
            expect(decode({ VP: "65521+32768", DT: "4293984257", PH: "33" })).deep.equal({
                VP: "65521+32768",
                DT: 0xfff10001,
                PH: 33,
            });
            expect(decode({ VP: "65521" })).deep.equal({ VP: "65521" });
        });

        it("accepts values at their maximum", () => {
            expect(decode({ VP: "65535+65535", DT: "4294967295", PH: "4294967295" })).deep.equal({
                VP: "65535+65535",
                DT: 4294967295,
                PH: 4294967295,
            });
        });

        it("keeps the VP vendor when only the product is invalid", () => {
            expect(decode({ VP: "1+65536" })).deep.equal({ VP: "1" });
            expect(decode({ VP: "1+" })).deep.equal({ VP: "1" });
            expect(decode({ VP: "1+02" })).deep.equal({ VP: "1" });
        });

        it("drops VP with an invalid vendor", () => {
            expect(decode({ VP: "65536+1" })).deep.equal({});
            expect(decode({ VP: "+1" })).deep.equal({});
            expect(decode({ VP: "065521+1" })).deep.equal({});
            expect(decode({ VP: " 1" })).deep.equal({});
            expect(decode({ VP: "abc" })).deep.equal({});
        });

        it("drops DT and PH outside 32 bits, non-integers, leading zeros and PH of zero", () => {
            expect(decode({ DT: "4294967296", PH: "4294967296" })).deep.equal({});
            expect(decode({ DT: "-1", PH: "1.5" })).deep.equal({});
            expect(decode({ DT: "0256", PH: "033" })).deep.equal({});
            expect(decode({ PH: "0" })).deep.equal({});
        });
    });
});
