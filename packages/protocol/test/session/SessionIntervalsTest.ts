/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionIntervals } from "#session/SessionIntervals.js";
import { Hours, Millis, Seconds } from "@matter/general";

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

    it("accepts an idle interval over one hour", () => {
        expect(SessionIntervals({ idleInterval: Hours(2) }).idleInterval).equal(Hours(2));
    });

    it("accepts an active interval over one hour", () => {
        expect(SessionIntervals({ activeInterval: Hours(2) }).activeInterval).equal(Hours(2));
    });

    it("accepts an active threshold over 65535 milliseconds", () => {
        expect(SessionIntervals({ activeThreshold: Millis(65536) }).activeThreshold).equal(Millis(65536));
    });

    describe("forAdvertisement", () => {
        it("passes through values within the spec maxima", () => {
            expect(SessionIntervals.forAdvertisement({ idleInterval: Hours.one })).deep.equal({
                idleInterval: Hours.one,
                activeInterval: Millis(300),
                activeThreshold: Seconds(4),
            });
        });

        it("clamps an idle interval over one hour to one hour", () => {
            expect(SessionIntervals.forAdvertisement({ idleInterval: Hours(2) }).idleInterval).equal(Hours.one);
        });

        it("clamps an active interval over one hour to one hour", () => {
            expect(SessionIntervals.forAdvertisement({ activeInterval: Hours(2) }).activeInterval).equal(Hours.one);
        });

        it("clamps an active threshold over 65535 milliseconds", () => {
            expect(SessionIntervals.forAdvertisement({ activeThreshold: Millis(65536) }).activeThreshold).equal(
                Millis(65535),
            );
        });

        it("accepts an active threshold of exactly 65535 milliseconds", () => {
            expect(SessionIntervals.forAdvertisement({ activeThreshold: Millis(65535) }).activeThreshold).equal(
                Millis(65535),
            );
        });
    });
});
