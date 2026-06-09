/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SustainedClientSubscribe } from "#action/client/subscription/ClientSubscribe.js";
import { ClientSubscription } from "#action/client/subscription/ClientSubscription.js";
import { IcdSustainedSubscription } from "#action/client/subscription/IcdSustainedSubscription.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { Lifetime, Seconds } from "@matter/general";
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

function build(wakefulness: IcdPeerWakefulness, overrides: Partial<IcdSustainedSubscription.Configuration> = {}) {
    const lifetime = Lifetime("test icd sustained subscription");
    const peer = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(BigInt(1)) });

    const subscription = new IcdSustainedSubscription({
        request: { sustain: true } as SustainedClientSubscribe,
        peer,
        closed: () => {},
        lifetime,
        wakefulness,
        subscribe: async () => fakePeerSub(),
        read: () => {
            throw new Error("read should not be invoked when bootstrapWithRead is unset");
        },
        ...overrides,
    });

    return subscription;
}

describe("IcdSustainedSubscription", () => {
    beforeEach(() => {
        MockTime.reset();
    });

    it("parks while asleep and subscribes only after a wake signal", async () => {
        const wakefulness = litWakefulness();

        let subscribeCount = 0;
        const subscription = build(wakefulness, {
            subscribe: async () => {
                subscribeCount++;
                return fakePeerSub();
            },
        });

        // While asleep nothing should subscribe even as time advances.
        await flush();
        await MockTime.advance(20_000);
        await flush();

        expect(subscribeCount).equal(0);
        expect(subscription.active.value).equal(false);
        expect(subscription.inactive.value).equal(true);

        // Wake signal -> subscribe.
        wakefulness.noteSignal();
        await flush();

        expect(subscribeCount).equal(1);
        expect(subscription.active.value).equal(true);
        expect(subscription.inactive.value).equal(false);

        subscription.close();
        await MockTime.resolve(subscription.done, { macrotasks: true });
    });

    it("stays active while parked after a subscription loss until availability lapses", async () => {
        const wakefulness = litWakefulness();

        let lastRequest: SustainedClientSubscribe | undefined;
        const subscription = build(wakefulness, {
            subscribe: async (request: Subscribe) => {
                lastRequest = request as SustainedClientSubscribe;
                return fakePeerSub();
            },
        });

        wakefulness.noteSignal();
        await flush();
        expect(subscription.active.value).equal(true);

        // Simulate underlying subscription closing (peer went idle); the subscription wires `closed` on the request.
        lastRequest?.closed?.();
        await flush();

        // Within the availability window the peer is still expected -> remain active even though parked.
        await MockTime.advance(20_000);
        await flush();
        expect(subscription.active.value).equal(true);
        expect(subscription.inactive.value).equal(false);

        // Availability window (idle 30s + 5s margin) lapses -> inactive.
        await MockTime.advance(20_000);
        await flush();
        expect(wakefulness.available.value).equal(false);
        expect(subscription.active.value).equal(false);
        expect(subscription.inactive.value).equal(true);

        subscription.close();
        await MockTime.resolve(subscription.done, { macrotasks: true });
    });

    it("parks on subscribe failure instead of running a timed retry", async () => {
        const wakefulness = litWakefulness();

        let subscribeCount = 0;
        const subscription = build(wakefulness, {
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

        // No timed retry: advancing well past the 15s SustainedSubscription schedule must not resubscribe.
        await MockTime.advance(60_000);
        await flush();
        expect(subscribeCount).equal(1);

        // Next wake signal triggers the retry.
        wakefulness.noteSignal();
        await flush();
        expect(subscribeCount).equal(2);
        expect(subscription.active.value).equal(true);

        subscription.close();
        await MockTime.resolve(subscription.done, { macrotasks: true });
    });

    it("retries a flipped SIT peer after a bounded delay instead of stranding on a wake edge", async () => {
        const wakefulness = litWakefulness();

        let subscribeCount = 0;
        const subscription = build(wakefulness, {
            subscribe: async () => {
                subscribeCount++;
                if (subscribeCount === 1) {
                    throw new Error("transient failure");
                }
                return fakePeerSub();
            },
        });

        // A runtime DSLS LIT->SIT flip forces always-awake and releases the parked loop, which then subscribes (and
        // fails). A SIT peer sends no Check-In, so the post-failure resume must come from the bounded fallback.
        wakefulness.requiresAwait = false;
        await flush();
        expect(subscribeCount).equal(1);

        await MockTime.advance(IcdSustainedSubscription.SIT_RETRY_INTERVAL);
        await flush();
        expect(subscribeCount).equal(2);
        expect(subscription.active.value).equal(true);

        subscription.close();
        await MockTime.resolve(subscription.done, { macrotasks: true });
    });

    it("refreshes the awake window on each subscription report", async () => {
        const wakefulness = litWakefulness();

        let capturedUpdated: SustainedClientSubscribe["updated"];
        const subscription = build(wakefulness, {
            request: { sustain: true, updated: async () => {} } as unknown as SustainedClientSubscribe,
            subscribe: async (request: Subscribe) => {
                capturedUpdated = (request as SustainedClientSubscribe).updated;
                return fakePeerSub();
            },
        });

        wakefulness.noteSignal(); // awake for activeModeThreshold (5s)
        await flush();
        expect(subscription.active.value).equal(true);

        // Near the end of the 5s window, a report arrives and must re-arm the awake window.
        await MockTime.advance(4_000);
        await capturedUpdated?.(undefined as never);
        await flush();

        // Past the original 5s window but within the refreshed one -> still awake.
        await MockTime.advance(2_000);
        expect(wakefulness.awake.value).equal(true);

        subscription.close();
        await MockTime.resolve(subscription.done, { macrotasks: true });
    });

    it("close() resolves done cleanly while parked", async () => {
        const wakefulness = litWakefulness();
        const subscription = build(wakefulness);

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
        const subscription = build(wakefulness, {
            subscribe: async () => fakePeerSub(() => peerSubClosed++),
        });

        wakefulness.noteSignal();
        await flush();

        subscription.close();
        await MockTime.resolve(subscription.done, { macrotasks: true });

        expect(peerSubClosed).equal(1);
        expect(subscription.subscriptionId).equal(ClientSubscription.NO_SUBSCRIPTION);
    });
});
