/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionIntervals } from "#session/SessionIntervals.js";
import { Hours, ImplementationError, Millis, Seconds } from "@matter/general";

describe("SessionIntervals", () => {
    it("applies defaults when nothing is provided", () => {
        expect(SessionIntervals()).deep.equal({
            idleInterval: Millis(500),
            activeInterval: Millis(300),
            activeThreshold: Seconds(4),
        });
    });

    it("overrides only the provided intervals", () => {
        const intervals = SessionIntervals({ idleInterval: Millis(100) });

        expect(intervals.idleInterval).equal(Millis(100));
        expect(intervals.activeInterval).equal(Millis(300));
        expect(intervals.activeThreshold).equal(Seconds(4));
    });

    it("rejects an idle interval over one hour", () => {
        expect(() => SessionIntervals({ idleInterval: Hours(2) })).throws(ImplementationError, "Idle Interval");
    });

    it("rejects an active interval over one hour", () => {
        expect(() => SessionIntervals({ activeInterval: Hours(2) })).throws(ImplementationError, "Active Interval");
    });

    it("accepts an active threshold of exactly 65535 milliseconds", () => {
        expect(SessionIntervals({ activeThreshold: Millis(65535) }).activeThreshold).equal(Millis(65535));
    });

    it("rejects an active threshold over 65535 milliseconds", () => {
        expect(() => SessionIntervals({ activeThreshold: Millis(65536) })).throws(
            ImplementationError,
            "Active Threshold",
        );
    });
});
