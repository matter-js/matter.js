/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, DurationFormatError } from "#time/Duration.js";
import { Days, Hours, Microseconds, Millis, Minutes, Seconds } from "#time/TimeUnit.js";

describe("Duration", () => {
    describe("parse", () => {
        it("parses seconds", () => {
            expect(Duration.parse("500s")).equal(Seconds(500));
        });

        it("parses milliseconds", () => {
            expect(Duration.parse("500ms")).equal(Millis(500));
        });

        it("parses microseconds with μs", () => {
            expect(Duration.parse("500μs")).equal(Microseconds(500));
        });

        it("parses microseconds with us", () => {
            expect(Duration.parse("500us")).equal(Microseconds(500));
        });

        it("parses minutes", () => {
            expect(Duration.parse("5m")).equal(Minutes(5));
        });

        it("parses hours", () => {
            expect(Duration.parse("2h")).equal(Hours(2));
        });

        it("parses days", () => {
            expect(Duration.parse("1d")).equal(Days(1));
        });

        it("parses multiple components", () => {
            expect(Duration.parse("1d 2h 30m 15s")).equal(Days(1) + Hours(2) + Minutes(30) + Seconds(15));
        });

        it("parses with decimal values", () => {
            expect(Duration.parse("1.5s")).equal(Millis(1500));
        });

        it("parses negative values", () => {
            expect(Duration.parse("-5s")).equal(Seconds(-5));
        });

        it("handles extra whitespace", () => {
            expect(Duration.parse("  1s   2s  ")).equal(Seconds(3));
        });

        it("throws for missing suffix", () => {
            expect(() => Duration.parse("500")).throw(DurationFormatError, /missing a time suffix/);
        });

        it("throws for unsupported suffix", () => {
            expect(() => Duration.parse("500x")).throw(DurationFormatError, /unsupported unit suffix/);
        });

        it("throws for missing numeric value", () => {
            expect(() => Duration.parse("s")).throw(DurationFormatError, /no numeric component/);
        });
    });

    describe("format", () => {
        it("formats zero", () => {
            expect(Duration.format(0)).equal("0");
        });

        it("formats microseconds", () => {
            expect(Duration.format(Microseconds(500))).equal("500μs");
        });

        it("formats milliseconds", () => {
            expect(Duration.format(Millis(500))).equal("500ms");
        });

        it("formats seconds", () => {
            expect(Duration.format(Seconds(5))).equal("5s");
        });

        it("formats minutes", () => {
            expect(Duration.format(Millis(Minutes(1) + Seconds(30)))).equal("1m 30s");
        });

        it("formats hours", () => {
            expect(Duration.format(Millis(Hours(1) + Minutes(1)))).equal("1h 1m");
        });

        it("formats days", () => {
            expect(Duration.format(Millis(Days(1) + Hours(1)))).equal("1d 1h");
        });

        it("formats negative values", () => {
            expect(Duration.format(Seconds(-5))).equal("-5s");
        });

        it("formats undefined", () => {
            expect(Duration.format(undefined)).equal(undefined);
        });
    });

    describe("Duration function", () => {
        it("parses string input", () => {
            expect(Duration("500ms")).equal(Millis(500));
        });

        it("returns numeric input as-is", () => {
            expect(Duration(Millis(500))).equal(Millis(500));
        });

        it("throws for non-finite numbers", () => {
            expect(() => Duration(NaN as Duration)).throw(DurationFormatError, /finite number/);
            expect(() => Duration(Infinity as Duration)).throw(DurationFormatError, /finite number/);
        });
    });

    describe("min/max", () => {
        it("returns the minimum", () => {
            expect(Duration.min(Seconds(1), Millis(500))).equal(Millis(500));
        });

        it("returns the maximum", () => {
            expect(Duration.max(Seconds(1), Millis(500))).equal(Seconds(1));
        });
    });

    describe("roundtrip", () => {
        it("parses formatted output back to original value", () => {
            const durations: Duration[] = [
                Microseconds(123),
                Millis(456),
                Seconds(7),
                Millis(Minutes(8) + Seconds(30)),
                Millis(Hours(2) + Minutes(15)),
                Millis(Days(1) + Hours(6) + Minutes(30) + Seconds(45)),
            ];

            for (const original of durations) {
                const formatted = Duration.format(original);
                const parsed = Duration.parse(formatted);
                expect(parsed).equal(original, `roundtrip failed for ${formatted}`);
            }
        });
    });
});
