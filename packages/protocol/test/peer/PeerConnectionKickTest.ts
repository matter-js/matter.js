/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KickOrigin } from "#peer/PeerConnection.js";
import { PeerTimingParameters } from "#peer/PeerTimingParameters.js";
import { Abort, AbortedError, Minutes, Observable, QuietObservable, Seconds, Time, Timestamp } from "@matter/general";

/**
 * Tests for the MRP kick restart redesign.
 *
 * PeerConnection itself is integration-heavy (peer, context, sessions, exchanges, service), so these tests validate
 * the individual behaviors that compose the kick logic:
 *
 * 1. PeerTimingParameters defaults for the new fields
 * 2. KickOrigin threading through QuietObservable
 * 3. Rate-limiting logic (lastRestartAt + threshold)
 * 4. The localAbort restart pattern (abort causes pair() to throw AbortedError, caller loops)
 * 5. QuietObservable suppression of rapid-fire kicks
 */

describe("PeerConnection kick redesign", () => {
    afterEach(() => MockTime.disable());

    describe("PeerTimingParameters", () => {
        it("has correct default for kickRestartCooldown.addressChange", () => {
            expect(PeerTimingParameters.defaults.kickRestartCooldown.addressChange).equals(Minutes(30));
        });

        it("has correct default for kickRestartCooldown.connect", () => {
            expect(PeerTimingParameters.defaults.kickRestartCooldown.connect).equals(Minutes(10));
        });

        it("has correct default for kickMinRetransmissions", () => {
            expect(PeerTimingParameters.defaults.kickMinRetransmissions).equals(2);
        });

        it("allows overriding kick restart cooldowns", () => {
            const custom = PeerTimingParameters({
                kickRestartCooldown: {
                    addressChange: Minutes(5),
                    connect: Seconds(30),
                },
            });
            expect(custom.kickRestartCooldown.addressChange).equals(Minutes(5));
            expect(custom.kickRestartCooldown.connect).equals(Seconds(30));
        });
    });

    describe("KickOrigin through QuietObservable", () => {
        it("passes 'discover' origin to observer", () => {
            const received = new Array<KickOrigin>();
            using kicker = new QuietObservable<[KickOrigin]>({
                minimumEmitInterval: Seconds(3),
                skipSuppressedEmits: true,
            });
            kicker.on(origin => {
                received.push(origin);
            });

            kicker.emit("discover");

            expect(received).deep.equals(["discover"]);
        });

        it("passes 'connect' origin to observer", () => {
            const received = new Array<KickOrigin>();
            using kicker = new QuietObservable<[KickOrigin]>({
                minimumEmitInterval: Seconds(3),
                skipSuppressedEmits: true,
            });
            kicker.on(origin => {
                received.push(origin);
            });

            kicker.emit("connect");

            expect(received).deep.equals(["connect"]);
        });

        it("suppresses rapid-fire kicks within minimumEmitInterval", () => {
            MockTime.reset();

            const received = new Array<KickOrigin>();
            using kicker = new QuietObservable<[KickOrigin]>({
                minimumEmitInterval: Seconds(3),
                skipSuppressedEmits: true,
            });
            kicker.on(origin => {
                received.push(origin);
            });

            kicker.emit("discover"); // accepted
            kicker.emit("discover"); // suppressed (within 3s)
            kicker.emit("connect"); // suppressed (within 3s)

            expect(received).deep.equals(["discover"]);
        });

        it("allows kick after minimumEmitInterval has elapsed", async () => {
            MockTime.reset();

            const received = new Array<KickOrigin>();
            using kicker = new QuietObservable<[KickOrigin]>({
                minimumEmitInterval: Seconds(3),
                skipSuppressedEmits: true,
            });
            kicker.on(origin => {
                received.push(origin);
            });

            kicker.emit("discover"); // accepted
            await MockTime.advance(Seconds(3) + 1);
            kicker.emit("connect"); // accepted (3s elapsed)

            expect(received).deep.equals(["discover", "connect"]);
        });
    });

    describe("kick rate-limiting", () => {
        /**
         * Simulates the rate-limiting logic from PeerConnection.attemptOnce's kick handler.
         * This is extracted here to test without the full PeerConnection dependencies.
         */
        function createKickHandler(timing: PeerTimingParameters) {
            let lastRestartAt: Timestamp | undefined;
            const restarts = new Array<KickOrigin>();

            function handleKick(origin: KickOrigin): boolean {
                const threshold =
                    origin === "discover"
                        ? timing.kickRestartCooldown.addressChange
                        : timing.kickRestartCooldown.connect;

                if (lastRestartAt === undefined || Timestamp.delta(lastRestartAt) >= threshold) {
                    lastRestartAt = Time.nowMs;
                    restarts.push(origin);
                    return true;
                }
                return false;
            }

            return { handleKick, restarts };
        }

        it("accepts the first kick unconditionally", () => {
            MockTime.reset();
            const { handleKick, restarts } = createKickHandler(PeerTimingParameters());

            expect(handleKick("discover")).equals(true);
            expect(restarts).deep.equals(["discover"]);
        });

        it("suppresses a second 'discover' kick within 30 minutes", async () => {
            MockTime.reset();
            const { handleKick, restarts } = createKickHandler(PeerTimingParameters());

            expect(handleKick("discover")).equals(true);
            await MockTime.advance(Minutes(29));
            expect(handleKick("discover")).equals(false);

            expect(restarts).deep.equals(["discover"]);
        });

        it("accepts a second 'discover' kick after 30 minutes", async () => {
            MockTime.reset();
            const { handleKick, restarts } = createKickHandler(PeerTimingParameters());

            expect(handleKick("discover")).equals(true);
            await MockTime.advance(Minutes(30));
            expect(handleKick("discover")).equals(true);

            expect(restarts).deep.equals(["discover", "discover"]);
        });

        it("suppresses a second 'connect' kick within 10 minutes", async () => {
            MockTime.reset();
            const { handleKick, restarts } = createKickHandler(PeerTimingParameters());

            expect(handleKick("connect")).equals(true);
            await MockTime.advance(Minutes(9));
            expect(handleKick("connect")).equals(false);

            expect(restarts).deep.equals(["connect"]);
        });

        it("accepts a second 'connect' kick after 10 minutes", async () => {
            MockTime.reset();
            const { handleKick, restarts } = createKickHandler(PeerTimingParameters());

            expect(handleKick("connect")).equals(true);
            await MockTime.advance(Minutes(10));
            expect(handleKick("connect")).equals(true);

            expect(restarts).deep.equals(["connect", "connect"]);
        });

        it("uses independent thresholds for different origins", async () => {
            MockTime.reset();
            const { handleKick, restarts } = createKickHandler(PeerTimingParameters());

            // First kick sets lastRestartAt
            expect(handleKick("discover")).equals(true);

            // 10 minutes later: connect would pass its own threshold, but lastRestartAt is shared
            // so it checks against 10 min and 10 min have passed → accepted
            await MockTime.advance(Minutes(10));
            expect(handleKick("connect")).equals(true);

            // Now lastRestartAt is reset to the connect kick time
            // 20 minutes later: discover checks against 30 min threshold from the connect kick → suppressed
            await MockTime.advance(Minutes(20));
            expect(handleKick("discover")).equals(false);

            // 10 more minutes: 30 min total since last restart → accepted
            await MockTime.advance(Minutes(10));
            expect(handleKick("discover")).equals(true);

            expect(restarts).deep.equals(["discover", "connect", "discover"]);
        });

        it("shares lastRestartAt across concurrent handlers", async () => {
            MockTime.reset();
            const { handleKick, restarts } = createKickHandler(PeerTimingParameters());

            // Simulate two concurrent address attempts sharing the same handler
            // First attempt's kick fires
            expect(handleKick("discover")).equals(true);

            // Second attempt's kick fires immediately after — should be suppressed
            expect(handleKick("discover")).equals(false);

            expect(restarts).deep.equals(["discover"]);
        });

        it("allows custom thresholds via PeerTimingParameters override", async () => {
            MockTime.reset();
            const { handleKick, restarts } = createKickHandler(
                PeerTimingParameters({
                    kickRestartCooldown: {
                        addressChange: Seconds(60),
                        connect: Seconds(10),
                    },
                }),
            );

            expect(handleKick("discover")).equals(true);
            await MockTime.advance(Seconds(30));
            expect(handleKick("discover")).equals(false); // 60s threshold not reached
            await MockTime.advance(Seconds(30));
            expect(handleKick("discover")).equals(true); // 60s reached

            expect(restarts).deep.equals(["discover", "discover"]);
        });
    });

    describe("localAbort restart pattern", () => {
        it("firing localAbort causes AbortedError via Abort.attempt", async () => {
            using addressAbort = new Abort();
            using localAbort = new Abort({ abort: addressAbort });

            // Simulate pair() — a promise that never resolves, awaited via Abort.attempt
            const neverResolves = new Promise<string>(() => {});

            // Fire localAbort asynchronously so attempt() can start first
            setTimeout(() => localAbort(), 0);

            // attempt() throws AbortedError when the abort fires
            await expect(localAbort.attempt(neverResolves)).to.be.rejected;

            // addressAbort should NOT be aborted — only localAbort was fired
            expect(addressAbort.aborted).equals(false);
        });

        it("addressAbort propagates to localAbort", async () => {
            using addressAbort = new Abort();
            using localAbort = new Abort({ abort: addressAbort });

            addressAbort();

            expect(localAbort.aborted).equals(true);
        });

        it("localAbort on already-aborted signal is harmless", () => {
            using addressAbort = new Abort();
            using localAbort = new Abort({ abort: addressAbort });

            addressAbort(); // abort the parent
            localAbort(); // fire child again — should not throw
        });

        it("connect loop restarts after localAbort fires", async () => {
            // Simulates the connect() → attemptOnce() → localAbort → loop pattern
            let attempts = 0;
            const maxAttempts = 3;
            using addressAbort = new Abort();

            // Simulate the connect() while loop
            while (!addressAbort.aborted && attempts < maxAttempts) {
                using localAbort = new Abort({ abort: addressAbort });
                attempts++;

                try {
                    // Simulate pair() — abort immediately on first two attempts (kick scenario)
                    if (attempts < maxAttempts) {
                        localAbort();
                        await new Promise<void>((_, reject) => {
                            // In real code, pair() checks localAbort and throws
                            if (localAbort.aborted) {
                                reject(new AbortedError());
                            }
                        });
                    }
                    // Third attempt "succeeds"
                    break;
                } catch (e) {
                    if (AbortedError.is(e)) {
                        continue; // restart loop — this is the desired behavior
                    }
                    throw e;
                }
            }

            expect(attempts).equals(maxAttempts);
            expect(addressAbort.aborted).equals(false);
        });
    });

    describe("Observable<[KickOrigin]> type contract", () => {
        it("Observable<[KickOrigin]> matches QuietObservable<[KickOrigin]>", () => {
            // Verify type compatibility: QuietObservable can be assigned to Observable
            using quiet = new QuietObservable<[KickOrigin]>({
                minimumEmitInterval: Seconds(3),
                skipSuppressedEmits: true,
            });

            // This assignment must work at runtime (the type check is compile-time)
            const obs: Observable<[KickOrigin]> = quiet;
            const received = new Array<KickOrigin>();
            obs.on(origin => {
                received.push(origin);
            });

            quiet.emit("discover");

            expect(received).deep.equals(["discover"]);
        });

        it("use() returns disposable that unregisters observer", () => {
            const kicker = new Observable<[KickOrigin]>();
            const received = new Array<KickOrigin>();

            const disposable = kicker.use(origin => {
                received.push(origin);
            });
            kicker.emit("discover");
            disposable[Symbol.dispose]();
            kicker.emit("connect"); // should not be received

            expect(received).deep.equals(["discover"]);
        });
    });
});
