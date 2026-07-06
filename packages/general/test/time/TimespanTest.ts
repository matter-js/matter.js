/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Timespan } from "#time/Timespan.js";
import { Timestamp } from "#time/Timestamp.js";

describe("Timespan", () => {
    it("captures start, stop and duration", () => {
        const span = Timespan(1_000, 3_500);

        expect(span.start).equal(1_000);
        expect(span.stop).equal(3_500);
        expect(span.duration).equal(2_500);
    });

    it("coerces inputs through Timestamp", () => {
        const span = Timespan(new Date(1_000), 2_000);

        expect(span.start).equal(1_000);
        expect(span.stop).equal(2_000);
    });

    it("from() rebases the start", () => {
        const span = Timespan(1_000, 3_000).from(2_000);

        expect(span.start).equal(2_000);
        expect(span.stop).equal(3_000);
        expect(span.duration).equal(1_000);
    });

    it("to() rebases the stop", () => {
        const span = Timespan(1_000, 3_000).to(5_000);

        expect(span.start).equal(1_000);
        expect(span.stop).equal(5_000);
        expect(span.duration).equal(4_000);
    });

    it("valueOf() exposes start and stop", () => {
        expect(Timespan(1_000, 2_000).valueOf()).deep.equal({
            start: Timestamp(1_000),
            stop: Timestamp(2_000),
        });
    });
});
