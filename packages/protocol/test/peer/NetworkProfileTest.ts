/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkProfiles, UnknownNetworkProfileError } from "#peer/NetworkProfile.js";
import { Millis, Seconds } from "@matter/general";

describe("NetworkProfiles", () => {
    describe("additionalMrpDelay", () => {
        it("fast and unlimited carry no additive delay", () => {
            const profiles = new NetworkProfiles();
            expect(profiles.get("fast").additionalMrpDelay).equals(Millis(0));
            expect(profiles.get("unlimited").additionalMrpDelay).equals(Millis(0));
        });

        it("icdLit is unthrottled and carries no additive delay", async () => {
            const profiles = new NetworkProfiles();
            const profile = profiles.get("icdLit");
            expect(profile.additionalMrpDelay).equals(Millis(0));
            expect(profile.connect).equals(undefined);

            // Concurrent slots must not queue: a second grant while holding the first proves unbounded concurrency.
            using _slot1 = await profile.semaphore.obtainSlot();
            using _slot2 = await profile.semaphore.obtainSlot();
            expect(profile.semaphore.running).equals(2);
            expect(profile.semaphore.count).equals(0);
        });

        it("conservative, thread and unknown carry 1.5s", () => {
            const profiles = new NetworkProfiles();
            expect(profiles.get("conservative").additionalMrpDelay).equals(Seconds(1.5));
            expect(profiles.get("thread").additionalMrpDelay).equals(Seconds(1.5));
            expect(profiles.get("unknown").additionalMrpDelay).equals(Seconds(1.5));
        });

        it("connect and probe sub-profiles inherit the parent additive delay", () => {
            const profiles = new NetworkProfiles();
            const conservative = profiles.get("conservative");
            expect(conservative.connect?.additionalMrpDelay).equals(Seconds(1.5));
            expect(conservative.probeAddress?.additionalMrpDelay).equals(Seconds(1.5));
        });

        it("a configured value overrides the default and propagates to sub-profiles", () => {
            const profiles = new NetworkProfiles();
            const profile = profiles.configure("custom", {
                exchanges: 4,
                additionalMrpDelay: Seconds(3),
                connect: { exchanges: 1 },
            });
            expect(profile.additionalMrpDelay).equals(Seconds(3));
            expect(profile.connect?.additionalMrpDelay).equals(Seconds(3));
        });

        it("a sub-profile may override the inherited value", () => {
            const profiles = new NetworkProfiles();
            const profile = profiles.configure("custom2", {
                exchanges: 4,
                additionalMrpDelay: Seconds(3),
                connect: { exchanges: 1, additionalMrpDelay: Millis(0) },
            });
            expect(profile.additionalMrpDelay).equals(Seconds(3));
            expect(profile.connect?.additionalMrpDelay).equals(Millis(0));
        });

        it("defaults to zero when neither limits nor parent specify a value", () => {
            const profiles = new NetworkProfiles();
            const profile = profiles.configure("custom3", { exchanges: 4 });
            expect(profile.additionalMrpDelay).equals(Millis(0));
        });
    });

    describe("defaults", () => {
        it("layers successive assignments instead of resetting to static templates", () => {
            const profiles = new NetworkProfiles();
            profiles.defaults = { fast: { additionalMrpDelay: Seconds(2) } };
            profiles.defaults = { thread: { additionalMrpDelay: Seconds(3) } };
            expect(profiles.get("fast").additionalMrpDelay).equals(Seconds(2));
            expect(profiles.get("thread").additionalMrpDelay).equals(Seconds(3));
        });
    });

    describe("get", () => {
        it("rejects unknown ids, including Object prototype keys", () => {
            const profiles = new NetworkProfiles();
            expect(() => profiles.get("nope")).throws(UnknownNetworkProfileError);
            expect(() => profiles.get("toString")).throws(UnknownNetworkProfileError);
            expect(() => profiles.get("constructor")).throws(UnknownNetworkProfileError);
        });
    });
});
