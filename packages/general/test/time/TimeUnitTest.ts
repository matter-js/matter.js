/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "#time/Duration.js";
import { Days, Forever, Hours, Instant, Microseconds, Millis, Minutes, Seconds } from "#time/TimeUnit.js";

describe("TimeUnit", () => {
    describe("scaling to milliseconds", () => {
        it("uses the documented unit lengths", () => {
            expect(Millis(1)).equal(1);
            expect(Seconds(1)).equal(1_000);
            expect(Minutes(1)).equal(60_000);
            expect(Hours(1)).equal(3_600_000);
            expect(Days(1)).equal(86_400_000);
            expect(Microseconds(1000)).equal(1);
        });

        it("accepts bigint scale", () => {
            expect(Seconds(2n)).equal(2_000);
        });

        it("passes undefined through", () => {
            expect(Seconds(undefined)).undefined;
        });
    });

    describe("conversion from a duration", () => {
        it("of() floors to whole units", () => {
            expect(Seconds.of(Millis(2_500) as Duration)).equal(2);
        });

        it("fractionalOf() retains the fraction", () => {
            expect(Seconds.fractionalOf(Millis(2_500) as Duration)).equal(2.5);
        });

        it("ceil/floor/round snap to the unit", () => {
            expect(Seconds.ceil(Millis(2_400) as Duration)).equal(3_000);
            expect(Seconds.floor(Millis(2_600) as Duration)).equal(2_000);
            expect(Seconds.round(Millis(2_500) as Duration)).equal(3_000);
            expect(Seconds.round(Millis(2_400) as Duration)).equal(2_000);
        });
    });

    describe("metadata", () => {
        it("carries kind, abbreviation and unit length", () => {
            expect(Seconds.kind).equal("second");
            expect(Seconds.abbrev).equal("s");
            expect(Seconds.one).equal(1_000);
            expect(`${Seconds}`).equal("second");
        });
    });

    describe("constants", () => {
        it("defines instant and forever", () => {
            expect(Instant).equal(0);
            expect(Forever).equal(Infinity);
        });
    });
});
