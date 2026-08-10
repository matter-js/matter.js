/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SustainedClientSubscribe } from "#action/client/subscription/ClientSubscribe.js";
import { ClientSubscription } from "#action/client/subscription/ClientSubscription.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { SustainedSubscription } from "#action/client/subscription/SustainedSubscription.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { Entropy, Lifetime, Millis, Observable, RetrySchedule, Seconds } from "@matter/general";
import { FabricIndex, NodeId } from "@matter/types";

function fakePeerSub(onClose?: () => void): PeerSubscription {
    return {
        subscriptionId: 1,
        maxInterval: 60,
        interactionModelRevision: 12,
        close: async () => {
            onClose?.();
        },
    } as unknown as PeerSubscription;
}

function retries() {
    const entropy = { randomUint32: 0 } as Entropy;
    return new RetrySchedule(entropy, SustainedSubscription.DefaultRetrySchedule);
}

function litWakefulness() {
    const wakefulness = new IcdPeerWakefulness();
    wakefulness.setTimings({ activeModeThreshold: Seconds(5), idleModeDuration: Seconds(30) });
    wakefulness.requiresAwait = true; // start asleep + unavailable
    return wakefulness;
}

/**
 * The parked run loop resumes on a macrotask hop (Abort.race), so the harness must drain macrotasks, not just
 * microtasks, before asserting the loop reacted to a signal.
 */
async function flush() {
    for (let i = 0; i < 5; i++) {
        await MockTime.yield();
        await MockTime.advance(0);
    }
}

function build(overrides: Partial<SustainedSubscription.Configuration> = {}) {
    const lifetime = Lifetime("test sustained subscription");
    const peer = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(BigInt(1)) });

    return new SustainedSubscription({
        request: { sustain: true } as SustainedClientSubscribe,
        peer,
        closed: () => {},
        lifetime,
        subscribe: async () => fakePeerSub(),
        read: () => {
            throw new Error("read should not be invoked when bootstrapWithRead is unset");
        },
        probe: async () => true,
        retries: retries(),
        ...overrides,
    });
}

describe("SustainedSubscription", () => {
    beforeEach(() => {
        MockTime.reset();
    });

    // Regression: the run loop must race `closed` against `this.abort` so shutdown-initiated close does not wedge
    // when the peer never reports closure via `request.closed`.
    it("close() resolves done() even when peer never fires request.closed", async () => {
        let peerSubClosed = 0;
        const subscription = build({
            subscribe: async () => fakePeerSub(() => peerSubClosed++),
        });

        await flush();
        expect(subscription.active.value).equal(true);

        subscription.close();
        await MockTime.resolve(subscription.done!, { macrotasks: true });

        expect(subscription.active.value).equal(false);
        // The run loop must close the active peer subscription on abort exit so its lifetime is disposed.
        expect(peerSubClosed).equal(1);
    });

    describe("non-ICD behavior", () => {
        it("subscribes immediately and emits active without a wakefulness provider", async () => {
            let subscribeCount = 0;
            const subscription = build({
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);
            expect(subscription.inactive.value).equal(false);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("runs a timed retry on subscribe failure", async () => {
            let subscribeCount = 0;
            const subscription = build({
                subscribe: async () => {
                    subscribeCount++;
                    if (subscribeCount === 1) {
                        throw new Error("transient failure");
                    }
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(false);

            // DefaultRetrySchedule initial interval is 15s.
            await MockTime.advance(Seconds(15));
            await flush();
            expect(subscribeCount).equal(2);
            expect(subscription.active.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("probes after a subscription loss before resubscribing", async () => {
            let probeCount = 0;
            let lastRequest: SustainedClientSubscribe | undefined;
            const subscription = build({
                probe: async () => {
                    probeCount++;
                    return true;
                },
                subscribe: async (request: Subscribe) => {
                    lastRequest = request as SustainedClientSubscribe;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscription.active.value).equal(true);
            expect(probeCount).equal(0);

            lastRequest?.closed?.();
            await flush();

            // Non-ICD loss probes before resubscribing; the probe succeeds so the subscription becomes active again.
            expect(probeCount).equal(1);
            expect(subscription.active.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("treats a wakefulness with requiresAwait===false as non-ICD (timed retry, probe)", async () => {
            const wakefulness = new IcdPeerWakefulness(); // requiresAwait defaults to false -> always awake

            let probeCount = 0;
            let subscribeCount = 0;
            let lastRequest: SustainedClientSubscribe | undefined;
            const subscription = build({
                wakefulness: () => wakefulness,
                probe: async () => {
                    probeCount++;
                    return true;
                },
                subscribe: async (request: Subscribe) => {
                    subscribeCount++;
                    lastRequest = request as SustainedClientSubscribe;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);

            lastRequest?.closed?.();
            await flush();
            expect(probeCount).equal(1);
            expect(subscribeCount).equal(2);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("parks on the next loss once its wakefulness flips to requiresAwait===true", async () => {
            const wakefulness = new IcdPeerWakefulness();
            wakefulness.setTimings({ activeModeThreshold: Seconds(5), idleModeDuration: Seconds(30) });

            let probeCount = 0;
            let subscribeCount = 0;
            let lastRequest: SustainedClientSubscribe | undefined;
            const subscription = build({
                wakefulness: () => wakefulness,
                probe: async () => {
                    probeCount++;
                    return true;
                },
                subscribe: async (request: Subscribe) => {
                    subscribeCount++;
                    lastRequest = request as SustainedClientSubscribe;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscribeCount).equal(1);

            // Runtime SIT->LIT flip: the peer is now asleep, so the next loss must park rather than probe+retry.
            wakefulness.requiresAwait = true;
            await flush();

            lastRequest?.closed?.();
            await flush();
            await MockTime.advance(Seconds(60));
            await flush();

            expect(probeCount).equal(0);
            expect(subscribeCount).equal(1);

            // A fresh check-in wakes the peer and drives the resubscribe.
            wakefulness.noteSignal();
            await flush();
            expect(subscribeCount).equal(2);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("reports maxInterval in seconds, using a seconds fallback before a subscription is established", async () => {
            const subscription = build();

            // Hours.one in seconds, not its 3_600_000 ms Duration value.
            expect(subscription.maxInterval).equal(3600);

            await flush();
            expect(subscription.maxInterval).equal(60);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("forwards a caller-provided keepaliveReceived when no wakefulness is registered", async () => {
            let callerCalls = 0;
            let capturedKeepalive: SustainedClientSubscribe["keepaliveReceived"];
            const subscription = build({
                request: {
                    sustain: true,
                    updated: async () => {},
                    keepaliveReceived: () => {
                        callerCalls++;
                    },
                } as unknown as SustainedClientSubscribe,
                subscribe: async (request: Subscribe) => {
                    capturedKeepalive = (request as SustainedClientSubscribe).keepaliveReceived;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscription.active.value).equal(true);

            capturedKeepalive?.();
            expect(callerCalls).equal(1);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });
    });

    describe("ICD await-mode behavior", () => {
        it("parks while asleep and subscribes only after a wake signal", async () => {
            const wakefulness = litWakefulness();

            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub();
                },
            });

            await flush();
            await MockTime.advance(Seconds(20));
            await flush();

            expect(subscribeCount).equal(0);
            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);

            wakefulness.noteSignal();
            await flush();

            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);
            expect(subscription.inactive.value).equal(false);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("keeps active true when a subscribed LIT peer's availability window expires", async () => {
            const wakefulness = litWakefulness();

            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => fakePeerSub(),
            });

            wakefulness.noteSignal();
            await flush();
            expect(subscription.active.value).equal(true);

            // Advance past the negotiated report cadence (fakePeerSub maxInterval 60s) + CHECK_IN_MARGIN (10s) so
            // `available` lapses even though the peer is subscribed.
            await MockTime.advance(Millis(Seconds(60) + IcdPeerWakefulness.CHECK_IN_MARGIN + Seconds(5)));
            await flush();
            expect(wakefulness.available.value).equal(false);

            expect(subscription.active.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("does not lapse a subscribed LIT peer's availability before its negotiated report interval", async () => {
            const wakefulness = litWakefulness();
            let missed = 0;
            wakefulness.checkInMissed.on(() => {
                missed++;
            });

            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => fakePeerSub(), // maxInterval 60s > idleModeDuration + margin
            });

            wakefulness.noteSignal();
            await flush();
            expect(subscription.active.value).equal(true);

            // Past idleModeDuration (30s) + margin (5s) but before the negotiated report cadence (60s): a healthy
            // subscribed peer whose reports arrive up to maxInterval must not blip offline every idle cycle.
            await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.CHECK_IN_MARGIN + Seconds(5)));
            await flush();
            expect(wakefulness.available.value).equal(true);
            expect(missed).equal(0);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("fires checkInMissed for a parked LIT peer that never subscribes and misses its Check-In", async () => {
            const wakefulness = litWakefulness();
            let missed = 0;
            wakefulness.checkInMissed.on(() => {
                missed++;
            });

            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => {
                    throw new Error("no subscription for a parked peer");
                },
            });

            wakefulness.noteSignal(); // check-in arms the idle-based window; subscribe fails -> parks with no report cadence
            await flush();

            await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.CHECK_IN_MARGIN + 1));
            await flush();
            expect(wakefulness.available.value).equal(false);
            expect(missed).equal(1);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("goes inactive immediately on a subscription loss, regardless of the availability window", async () => {
            const wakefulness = litWakefulness();

            let lastRequest: SustainedClientSubscribe | undefined;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async (request: Subscribe) => {
                    lastRequest = request as SustainedClientSubscribe;
                    return fakePeerSub();
                },
            });

            wakefulness.noteSignal();
            await flush();
            expect(subscription.active.value).equal(true);

            // Past the activeModeThreshold (5s) so the peer is no longer awake and the loop parks on loss instead of
            // immediately resubscribing, but still well within the longer availability window (30s + 5s margin).
            await MockTime.advance(Seconds(10));
            lastRequest?.closed?.();
            await flush();

            expect(wakefulness.available.value).equal(true);
            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);

            // A fresh check-in wakes the peer and drives the resubscribe, restoring active.
            wakefulness.noteSignal();
            await flush();
            expect(subscription.active.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("parks on subscribe failure instead of running a timed retry", async () => {
            const wakefulness = litWakefulness();

            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => {
                    subscribeCount++;
                    if (subscribeCount === 1) {
                        throw new Error("transient send failure to now-asleep peer");
                    }
                    return fakePeerSub();
                },
            });

            wakefulness.noteSignal();
            await flush();
            expect(subscribeCount).equal(1);

            // No timed retry: advancing well past the 15s schedule must not resubscribe.
            await MockTime.advance(Seconds(60));
            await flush();
            expect(subscribeCount).equal(1);

            wakefulness.noteSignal();
            await flush();
            expect(subscribeCount).equal(2);
            expect(subscription.active.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("retries a flipped SIT peer after a bounded delay instead of stranding on a wake edge", async () => {
            const wakefulness = litWakefulness();

            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => {
                    subscribeCount++;
                    if (subscribeCount === 1) {
                        throw new Error("transient failure");
                    }
                    return fakePeerSub();
                },
            });

            // A runtime DSLS LIT->SIT flip forces always-awake and releases the parked loop, which then subscribes (and
            // fails). A SIT peer sends no check-in, so the post-failure resume must come from the bounded fallback.
            wakefulness.requiresAwait = false;
            await flush();
            expect(subscribeCount).equal(1);

            await MockTime.advance(SustainedSubscription.SIT_RETRY_INTERVAL);
            await flush();
            expect(subscribeCount).equal(2);
            expect(subscription.active.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("refreshes the awake window on each subscription report", async () => {
            const wakefulness = litWakefulness();

            let capturedUpdated: SustainedClientSubscribe["updated"];
            const subscription = build({
                request: { sustain: true, updated: async () => {} } as unknown as SustainedClientSubscribe,
                wakefulness: () => wakefulness,
                subscribe: async (request: Subscribe) => {
                    capturedUpdated = (request as SustainedClientSubscribe).updated;
                    return fakePeerSub();
                },
            });

            wakefulness.noteSignal(); // awake for activeModeThreshold (5s)
            await flush();
            expect(subscription.active.value).equal(true);

            // Near the end of the 5s window, a report arrives and must re-arm the awake window.
            await MockTime.advance(Seconds(4));
            await capturedUpdated?.(undefined as never);
            await flush();

            // Past the original 5s window but within the refreshed one -> still awake.
            await MockTime.advance(Seconds(2));
            expect(wakefulness.awake.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("re-arms awake and availability on an empty keepalive report", async () => {
            const wakefulness = litWakefulness();
            let missed = 0;
            wakefulness.checkInMissed.on(() => {
                missed++;
            });

            let capturedKeepalive: SustainedClientSubscribe["keepaliveReceived"];
            const subscription = build({
                request: { sustain: true, updated: async () => {} } as unknown as SustainedClientSubscribe,
                wakefulness: () => wakefulness,
                subscribe: async (request: Subscribe) => {
                    capturedKeepalive = (request as SustainedClientSubscribe).keepaliveReceived;
                    return fakePeerSub(); // maxInterval 60s -> availability window 60s + margin
                },
            });

            wakefulness.noteSignal(); // check-in wakes the peer -> establish subscribe
            await flush();
            expect(subscription.active.value).equal(true);

            // Let the short awake window (activeModeThreshold 5s) lapse while still inside the availability window.
            await MockTime.advance(Seconds(10));
            expect(wakefulness.awake.value).equal(false);
            expect(wakefulness.available.value).equal(true);

            // An empty keepalive arrives: it must re-arm BOTH awake (reachability for held interactions) and
            // availability, and must not have fired a spurious checkInMissed.
            capturedKeepalive?.();
            await flush();
            expect(wakefulness.awake.value).equal(true);
            expect(wakefulness.available.value).equal(true);

            // Advance past the original availability expiry (65s) but within the keepalive-refreshed one: no lapse.
            await MockTime.advance(Millis(Seconds(60)));
            expect(wakefulness.available.value).equal(true);
            expect(missed).equal(0);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("chains a caller-provided keepaliveReceived after the wakefulness re-arm", async () => {
            const wakefulness = litWakefulness();
            let callerCalls = 0;
            let capturedKeepalive: SustainedClientSubscribe["keepaliveReceived"];
            const subscription = build({
                request: {
                    sustain: true,
                    updated: async () => {},
                    keepaliveReceived: () => {
                        callerCalls++;
                    },
                } as unknown as SustainedClientSubscribe,
                wakefulness: () => wakefulness,
                subscribe: async (request: Subscribe) => {
                    capturedKeepalive = (request as SustainedClientSubscribe).keepaliveReceived;
                    return fakePeerSub();
                },
            });

            wakefulness.noteSignal();
            await flush();
            expect(subscription.active.value).equal(true);

            capturedKeepalive?.();
            // The caller's handler must still run (chained), and wakefulness must be re-armed.
            expect(callerCalls).equal(1);
            expect(wakefulness.awake.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("close() resolves done cleanly while parked", async () => {
            const wakefulness = litWakefulness();
            const subscription = build({ wakefulness: () => wakefulness });

            await flush();
            subscription.close();

            const result = await MockTime.resolve(
                subscription.done!.then(() => "ok" as const),
                { macrotasks: true },
            );
            expect(result).equal("ok");
        });

        it("closes the active peer subscription on abort", async () => {
            const wakefulness = litWakefulness();

            let peerSubClosed = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => fakePeerSub(() => peerSubClosed++),
            });

            wakefulness.noteSignal();
            await flush();

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });

            expect(peerSubClosed).equal(1);
            expect(subscription.subscriptionId).equal(ClientSubscription.NO_SUBSCRIPTION);
        });

        it("honors a wakefulness provider that returns undefined until the peer registers", async () => {
            const wakefulness = litWakefulness();
            let registered: IcdPeerWakefulness | undefined;

            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => registered,
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub();
                },
            });

            // No wakefulness yet -> behaves non-ICD and subscribes immediately.
            await flush();
            expect(subscribeCount).equal(1);

            // Register the await-mode wakefulness; the live provider is honored on the next loss.
            registered = wakefulness;

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("recreates the subscription immediately on a LIT->SIT runtime flip", async () => {
            const wakefulness = litWakefulness();

            let subscribeCount = 0;
            let closedCount = 0;
            let probeCount = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                probe: async () => {
                    probeCount++;
                    return true;
                },
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub(() => closedCount++);
                },
            });

            wakefulness.noteSignal(); // wake -> first subscribe
            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);

            // A LIT->SIT flip force-wakes the peer, so the recreate closes the current subscription and re-subscribes
            // straight away for the new mode. The session is untouched, so no probe.
            wakefulness.requiresAwait = false;
            await flush();
            expect(closedCount).equal(1);
            expect(subscribeCount).equal(2);
            expect(probeCount).equal(0);
            expect(subscription.active.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("recreates after the next check-in on a SIT->LIT runtime flip", async () => {
            const wakefulness = new IcdPeerWakefulness();
            wakefulness.setTimings({ activeModeThreshold: Seconds(5), idleModeDuration: Seconds(30) });
            // requiresAwait defaults to false -> starts as a SIT peer (always awake).

            let subscribeCount = 0;
            let closedCount = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub(() => closedCount++);
                },
            });

            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);

            // A SIT->LIT flip tears down the current subscription and parks until the peer's next Check-In.
            wakefulness.requiresAwait = true;
            await flush();
            expect(closedCount).equal(1);
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(false);

            wakefulness.noteSignal();
            await flush();
            expect(subscribeCount).equal(2);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("does not emit an active dip across an instant mode-flip recreate", async () => {
            const wakefulness = litWakefulness();

            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub();
                },
            });

            wakefulness.noteSignal(); // wake -> first subscribe
            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);

            const emissions = new Array<boolean>();
            subscription.active.on(value => {
                emissions.push(value);
            });

            // Instant LIT->SIT recreate (peer force-awake): the deliberate close must not surface as an active dip.
            wakefulness.requiresAwait = false;
            await flush();

            expect(subscribeCount).equal(2);
            expect(subscription.active.value).equal(true);
            expect(emissions.includes(false)).equal(false);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("recreates on the icdLit network profile, then reverts to the default on a later loss", async () => {
            const wakefulness = litWakefulness();

            const networks = new Array<string | undefined>();
            let lastRequest: SustainedClientSubscribe | undefined;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async (request: Subscribe) => {
                    const sustained = request as SustainedClientSubscribe;
                    networks.push(sustained.network);
                    lastRequest = sustained;
                    return fakePeerSub();
                },
            });

            wakefulness.noteSignal(); // wake -> first (establish) subscribe
            await flush();
            // A LIT peer resubscribes off the shared throttle every iteration, so even the first establish is priority.
            expect(networks).deep.equal(["icdLit"]);

            // A mode-flip recreate must bypass the per-network throttle so the time-critical resubscribe is not queued
            // out of the peer's brief active window.
            wakefulness.requiresAwait = false;
            await flush();
            expect(networks).deep.equal(["icdLit", "icdLit"]);

            // A subsequent genuine loss on the now-SIT peer is a normal resubscribe: it reverts to the default profile.
            lastRequest?.closed?.();
            await flush();
            expect(networks).deep.equal(["icdLit", "icdLit", undefined]);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("keeps a runtime SIT→LIT peer on icdLit for a post-loss resubscribe, not just the flip recreate", async () => {
            const wakefulness = new IcdPeerWakefulness();
            wakefulness.setTimings({ activeModeThreshold: Seconds(5), idleModeDuration: Seconds(30) });
            // Starts SIT (requiresAwait false).

            const networks = new Array<string | undefined>();
            let lastRequest: SustainedClientSubscribe | undefined;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async (request: Subscribe) => {
                    const sustained = request as SustainedClientSubscribe;
                    networks.push(sustained.network);
                    lastRequest = sustained;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(networks).deep.equal([undefined]); // SIT establish uses the medium profile

            // SIT→LIT flip: the one-shot recreate is priority.
            wakefulness.requiresAwait = true;
            wakefulness.noteSignal();
            await flush();
            expect(networks).deep.equal([undefined, "icdLit"]);

            // A genuine loss (not a flip) on the now-LIT peer resubscribes in-window: it must stay on icdLit even
            // though the network was not captured at subscribe time. This is the live per-iteration routing.
            lastRequest?.closed?.();
            await flush();
            expect(networks).deep.equal([undefined, "icdLit", "icdLit"]);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("keeps active live across a report-driven SIT→LIT flip when the recreate lands in-window", async () => {
            const wakefulness = new IcdPeerWakefulness();
            wakefulness.setTimings({ activeModeThreshold: Seconds(5), idleModeDuration: Seconds(30) });
            // requiresAwait defaults to false -> starts as a SIT peer (always awake).

            let subscribeCount = 0;
            const networks = new Array<string | undefined>();
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async (request: Subscribe) => {
                    subscribeCount++;
                    networks.push((request as SustainedClientSubscribe).network);
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);

            const emissions = new Array<boolean>();
            subscription.active.on(value => {
                emissions.push(value);
            });

            // A report-driven SIT→LIT flip in the fixed IcdClient order: the requiresAwait setter force-sleeps the
            // window, then the live report re-arms it via noteSignal. The recreate re-checks awake at the loop head and
            // finds it armed, so it re-subscribes in-window with no not-live dip.
            wakefulness.requiresAwait = true;
            wakefulness.noteSignal();
            await flush();

            expect(subscribeCount).equal(2);
            expect(networks[1]).equal("icdLit");
            expect(subscription.active.value).equal(true);
            expect(emissions.includes(false)).equal(false);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("drops to not-live when a mode-flip recreate parks for a peer that never wakes", async () => {
            const wakefulness = new IcdPeerWakefulness();
            wakefulness.setTimings({ activeModeThreshold: Seconds(5), idleModeDuration: Seconds(30) });
            // requiresAwait defaults to false -> starts as a SIT peer (always awake).

            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);

            // SIT->LIT flip: the recreate parks until the next Check-In. A peer that never wakes must not stay "live".
            wakefulness.requiresAwait = true;
            await flush();
            await MockTime.advance(Seconds(120));
            await flush();

            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(false);

            // Recovery: a fresh Check-In wakes the peer and restores live.
            wakefulness.noteSignal();
            await flush();
            expect(subscribeCount).equal(2);
            expect(subscription.active.value).equal(true);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("recreates on the first registration-induced feed while the subscription was established unfed", async () => {
            const peerFed = Observable<[NodeId]>();
            let registered: IcdPeerWakefulness | undefined;

            let subscribeCount = 0;
            let closedCount = 0;
            const networks = new Array<string | undefined>();
            const subscription = build({
                wakefulness: () => registered,
                peerFed: () => peerFed,
                subscribe: async (request: Subscribe) => {
                    subscribeCount++;
                    networks.push((request as SustainedClientSubscribe).network);
                    return fakePeerSub(() => closedCount++);
                },
            });

            // Unfed at establishment -> behaves non-ICD and subscribes immediately.
            await flush();
            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);

            const emissions = new Array<boolean>();
            subscription.active.on(value => {
                emissions.push(value);
            });

            // Registration feeds the peer: mirror FabricIcd.addPeer creating an awake LIT wakefulness (register seeds
            // noteSignal) plus IcdClient.#feedFabricIcd, then emit the feed signal.
            const wakefulness = litWakefulness();
            wakefulness.noteSignal();
            registered = wakefulness;
            peerFed.emit(NodeId(BigInt(1)));
            await flush();

            // The first feed recreates for the new mode via the existing flip machinery: close + in-window resubscribe.
            expect(closedCount).equal(1);
            expect(subscribeCount).equal(2);
            expect(networks[1]).equal("icdLit");
            expect(subscription.active.value).equal(true);
            expect(emissions.includes(false)).equal(false);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("does not double-recreate: a stray feed signal after the peer is fed is a no-op, later flips use the observer", async () => {
            const peerFed = Observable<[NodeId]>();
            let registered: IcdPeerWakefulness | undefined;

            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => registered,
                peerFed: () => peerFed,
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscribeCount).equal(1);

            const wakefulness = litWakefulness();
            wakefulness.noteSignal();
            registered = wakefulness;
            peerFed.emit(NodeId(BigInt(1)));
            await flush();
            expect(subscribeCount).equal(2); // exactly one recreate

            // A stray feed signal for the already-fed peer must not add a second recreate; the subscription now
            // observes further flips via operatingModeChanged, not the feed signal.
            peerFed.emit(NodeId(BigInt(1)));
            await flush();
            expect(subscribeCount).equal(2);

            // A real subsequent DSLS flip still recreates exactly once, via the existing observer.
            wakefulness.requiresAwait = false;
            await flush();
            expect(subscribeCount).equal(3);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("ignores a feed signal for a different peer", async () => {
            const peerFed = Observable<[NodeId]>();
            let registered: IcdPeerWakefulness | undefined;

            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => registered,
                peerFed: () => peerFed,
                subscribe: async () => {
                    subscribeCount++;
                    return fakePeerSub();
                },
            });

            await flush();
            expect(subscribeCount).equal(1);

            // A feed for an unrelated peer must not recreate this subscription.
            registered = litWakefulness();
            peerFed.emit(NodeId(BigInt(2)));
            await flush();
            expect(subscribeCount).equal(1);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });
    });
});
