/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Timestamp, TimestampFormatError } from "#time/Timestamp.js";

describe("Timestamp", () => {
    describe("construction", () => {
        it("accepts a millisecond number", () => {
            expect(Timestamp(1_577_836_800_000)).equal(1_577_836_800_000);
        });

        it("converts a bigint", () => {
            expect(Timestamp(1_577_836_800_000n)).equal(1_577_836_800_000);
        });

        it("converts a Date", () => {
            expect(Timestamp(new Date(1_577_836_800_000))).equal(1_577_836_800_000);
        });

        it("parses a date string", () => {
            expect(Timestamp("2020-01-01T00:00:00.000Z")).equal(1_577_836_800_000);
        });

        it("throws on an unparseable string", () => {
            expect(() => Timestamp("not a date")).throws(TimestampFormatError, "Invalid timestamp format");
        });

        it("throws on an invalid Date", () => {
            expect(() => Timestamp(new Date("not a date"))).throws(TimestampFormatError);
        });

        it("throws on a non-finite number", () => {
            expect(() => Timestamp(Number.NaN)).throws(TimestampFormatError, "finite");
        });
    });

    describe("namespace helpers", () => {
        it("fromSeconds scales to milliseconds", () => {
            expect(Timestamp.fromSeconds(1.5)).equal(1_500);
        });

        it("fromMicroseconds scales down to milliseconds", () => {
            expect(Timestamp.fromMicroseconds(2_500)).equal(2.5);
            expect(Timestamp.fromMicroseconds(2_500n)).equal(2.5);
        });

        it("toMicroseconds scales up to microseconds as a bigint", () => {
            expect(Timestamp.toMicroseconds(Timestamp(2.5))).equal(2_500n);
            expect(Timestamp.toMicroseconds(Timestamp(0))).equal(0n);
        });

        it("toMicroseconds rounds sub-microsecond fractions", () => {
            expect(Timestamp.toMicroseconds(Timestamp(2.5006))).equal(2_501n);
        });

        it("toMicroseconds round-trips fromMicroseconds", () => {
            expect(Timestamp.toMicroseconds(Timestamp.fromMicroseconds(1_577_836_800_000_000n))).equal(
                1_577_836_800_000_000n,
            );
        });

        it("dateOf round-trips a timestamp", () => {
            expect(Timestamp.dateOf(Timestamp(1_577_836_800_000)).getTime()).equal(1_577_836_800_000);
        });

        it("delta computes the difference", () => {
            expect(Timestamp.delta(Timestamp(1_000), Timestamp(3_500))).equal(2_500);
        });

        it("zero is the epoch", () => {
            expect(Timestamp.zero).equal(0);
        });
    });
});
