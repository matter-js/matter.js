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
import { Entropy, Lifetime, RetrySchedule, Seconds } from "@matter/general";
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

        it("stays active while parked after a subscription loss until availability lapses", async () => {
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

            lastRequest?.closed?.();
            await flush();

            // Within the availability window the peer is still expected -> remain active even though parked.
            await MockTime.advance(Seconds(20));
            await flush();
            expect(subscription.active.value).equal(true);
            expect(subscription.inactive.value).equal(false);

            // Availability window (idle 30s + 5s margin) lapses -> inactive.
            await MockTime.advance(Seconds(20));
            await flush();
            expect(wakefulness.available.value).equal(false);
            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);

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
    });
});
