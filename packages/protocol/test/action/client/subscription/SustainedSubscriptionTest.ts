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
import { ReadResult } from "#action/response/ReadResult.js";
import { IcdPeerSchedule } from "#icd/IcdPeerSchedule.js";
import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { PeerUnresponsiveError } from "#peer/PeerCommunicationError.js";
import {
    Diagnostic,
    Entropy,
    Hours,
    Lifetime,
    LogDestination,
    Logger,
    LogLevel,
    MatterError,
    Millis,
    Observable,
    RetrySchedule,
    Seconds,
    Time,
    Timestamp,
} from "@matter/general";
import {
    ClusterId,
    EndpointNumber,
    EventId,
    EventNumber,
    FabricIndex,
    NodeId,
    Priority,
    TlvAny,
    TypeFromSchema,
    TlvEventFilter,
} from "@matter/types";

const LIT_TIMINGS: IcdPeerSchedule.Timings = {
    activeModeThreshold: Seconds(5),
    activeModeDuration: Millis(0),
    idleModeDuration: Seconds(30),
};

class ListenerFailedError extends MatterError {}

function fakePeerSub(onClose?: () => void): PeerSubscription {
    return {
        subscriptionId: 1,
        maxInterval: 60,
        timeout: Seconds(70),
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
    wakefulness.setTimings(LIT_TIMINGS);
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

        it("never reports active when closed during the retry backoff", async () => {
            let subscribeCount = 0;
            const subscription = build({
                subscribe: async () => {
                    subscribeCount++;
                    throw new Error("transient failure");
                },
            });
            const activeEmits = new Array<boolean>();
            const inactiveEmits = new Array<boolean>();
            subscription.active.on(value => void activeEmits.push(value));
            subscription.inactive.on(value => void inactiveEmits.push(value));

            await flush();
            expect(subscribeCount).equal(1);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
            await flush();

            expect(subscribeCount).equal(1);
            expect(activeEmits).deep.equal([]);
            expect(inactiveEmits).deep.equal([]);
            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);
        });

        it("never reports active when closed while the subscribe is in flight and then succeeds", async () => {
            let peerSubClosed = 0;
            let finishSubscribe: (() => void) | undefined;
            const subscription = build({
                subscribe: () =>
                    new Promise<PeerSubscription>(resolve => {
                        finishSubscribe = () => resolve(fakePeerSub(() => peerSubClosed++));
                    }),
            });
            const activeEmits = new Array<boolean>();
            subscription.active.on(value => void activeEmits.push(value));

            await flush();
            subscription.close();
            finishSubscribe?.();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
            await flush();

            expect(activeEmits).deep.equal([]);
            expect(subscription.active.value).equal(false);
            expect(peerSubClosed).equal(1);
        });

        it("reports not live when closed while the active observers run", async () => {
            const subscription = build();
            const activeEmits = new Array<boolean>();
            subscription.active.on(value => {
                activeEmits.push(value);
                if (value) {
                    subscription.close();
                }
            });

            await flush();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
            await flush();

            expect(activeEmits).deep.equal([true, false]);
            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);
        });

        it("never reports active when an inactive observer closes the subscription while going live", async () => {
            const subscription = build();
            const activeEmits = new Array<boolean>();
            const inactiveEmits = new Array<boolean>();
            subscription.active.on(value => void activeEmits.push(value));
            subscription.inactive.on(value => {
                inactiveEmits.push(value);
                if (!value) {
                    subscription.close();
                }
            });

            await flush();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
            await flush();

            expect(activeEmits).deep.equal([]);
            expect(inactiveEmits).deep.equal([false, true]);
            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);
        });

        it("ends not live and rejects done when an inactive observer throws while going live", async () => {
            const subscription = build();
            const failure = new Error("inactive observer failed going live");
            const activeEmits = new Array<boolean>();
            subscription.active.on(value => void activeEmits.push(value));
            subscription.inactive.on(value => {
                // The second failure, while stopping, must not replace the first as the outcome of done
                throw value ? new Error("inactive observer failed stopping") : failure;
            });
            const outcome = subscription.done!.then(
                () => undefined,
                (e: unknown) => e,
            );

            await flush();
            expect(await MockTime.resolve(outcome, { macrotasks: true })).equal(failure);

            expect(activeEmits).deep.equal([]);
            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);
            subscription.close();
        });

        it("still reports inactive when an active observer throws during the final not-live update", async () => {
            const subscription = build();
            const inactiveEmits = new Array<boolean>();
            subscription.inactive.on(value => void inactiveEmits.push(value));
            subscription.active.on(value => {
                if (value) {
                    subscription.close();
                } else {
                    throw new Error("active observer failed");
                }
            });

            await flush();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
            await flush();

            expect(inactiveEmits).deep.equal([false, true]);
            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);
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
            wakefulness.setTimings(LIT_TIMINGS);

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
            wakefulness.noteActive();
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

        it("forwards a caller-provided keepaliveReceived", async () => {
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

            wakefulness.noteActive();
            await flush();

            expect(subscribeCount).equal(1);
            expect(subscription.active.value).equal(true);
            expect(subscription.inactive.value).equal(false);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("leaves a subscribed LIT peer's availability to the subscription", async () => {
            const wakefulness = litWakefulness();

            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => fakePeerSub(),
            });

            wakefulness.noteActive();
            await flush();
            expect(subscription.active.value).equal(true);

            // Far past any Check-In deadline: only the subscription's own liveness can end it.
            await MockTime.advance(Hours(2));
            await flush();
            expect(wakefulness.available.value).equal(true);
            expect(subscription.active.value).equal(true);

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

            wakefulness.noteActive(); // arms the Check-In deadline; subscribe fails, so no subscription is held
            await flush();

            // idleModeDuration (30s) + activeModeThreshold (5s) + CHECK_IN_MARGIN (10s)
            await MockTime.advance(Millis(Seconds(30) + Seconds(5) + IcdPeerSchedule.CHECK_IN_MARGIN + 1));
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

            wakefulness.noteActive();
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
            wakefulness.noteActive();
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

            wakefulness.noteActive();
            await flush();
            expect(subscribeCount).equal(1);

            // No timed retry: advancing well past the 15s schedule must not resubscribe.
            await MockTime.advance(Seconds(60));
            await flush();
            expect(subscribeCount).equal(1);

            wakefulness.noteActive();
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

            wakefulness.noteActive();
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

            wakefulness.noteActive(); // wake -> first subscribe
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
            wakefulness.setTimings(LIT_TIMINGS);
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

            wakefulness.noteActive();
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

            wakefulness.noteActive(); // wake -> first subscribe
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

        it("reports not live when closed while a mode-flip recreate tears down the old subscription", async () => {
            const wakefulness = litWakefulness();

            let releaseClose: (() => void) | undefined;
            let subscribeCount = 0;
            const subscription = build({
                wakefulness: () => wakefulness,
                subscribe: async () => {
                    subscribeCount++;
                    const sub = fakePeerSub();
                    if (subscribeCount === 1) {
                        sub.close = () => new Promise<void>(resolve => (releaseClose = resolve));
                    }
                    return sub;
                },
            });

            wakefulness.noteActive();
            await flush();
            expect(subscription.active.value).equal(true);

            // The LIT->SIT flip starts the recreate, which waits on the old subscription's close.
            wakefulness.requiresAwait = false;
            await flush();
            expect(releaseClose).not.equal(undefined);
            expect(subscription.active.value).equal(true);

            subscription.close();
            releaseClose?.();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
            await flush();

            expect(subscription.active.value).equal(false);
            expect(subscription.inactive.value).equal(true);
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

            wakefulness.noteActive(); // wake -> first (establish) subscribe
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
            wakefulness.setTimings(LIT_TIMINGS);
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
            wakefulness.noteActive();
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
            wakefulness.setTimings(LIT_TIMINGS);
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

            // A report-driven SIT→LIT flip in the IcdClient order: the requiresAwait setter starts awaiting, then the live
            // report notes the peer as active. The recreate re-checks awake at the loop head and
            // finds it armed, so it re-subscribes in-window with no not-live dip.
            wakefulness.requiresAwait = true;
            wakefulness.noteActive();
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
            wakefulness.setTimings(LIT_TIMINGS);
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
            wakefulness.noteActive();
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

            // Registration feeds the peer: mirror FabricIcd.addPeer plus IcdClient.#feedFabricIcd making the wakefulness
            // LIT and noting the registration as activity, then emit the feed signal.
            const wakefulness = litWakefulness();
            wakefulness.noteActive();
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
            wakefulness.noteActive();
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

        describe("subscription hold", () => {
            async function subscribedLitPeer() {
                const wakefulness = litWakefulness();
                wakefulness.noteActive();
                let lastRequest: SustainedClientSubscribe | undefined;
                let subscribeCount = 0;
                const subscription = build({
                    wakefulness: () => wakefulness,
                    subscribe: async (request: Subscribe) => {
                        if (subscribeCount++ > 0) {
                            throw new PeerUnresponsiveError();
                        }
                        lastRequest = request as SustainedClientSubscribe;
                        return fakePeerSub();
                    },
                });
                await flush();
                expect(subscription.active.value).equal(true);
                return { wakefulness, subscription, lose: () => lastRequest?.closed?.() };
            }

            /** The next Check-In deadline after activity now, without a subscription. */
            function checkInDue() {
                return Timestamp(
                    Time.nowUs +
                        LIT_TIMINGS.activeModeThreshold +
                        LIT_TIMINGS.idleModeDuration +
                        IcdPeerSchedule.CHECK_IN_MARGIN,
                );
            }

            it("has no Check-In deadline while subscribed", async () => {
                const { wakefulness, subscription } = await subscribedLitPeer();
                wakefulness.noteActive();

                expect(wakefulness.nextCheckInDue).undefined;

                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });
            });

            it("releases its hold when closed", async () => {
                const { wakefulness, subscription } = await subscribedLitPeer();
                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });

                wakefulness.noteActive();
                expect(wakefulness.nextCheckInDue).equal(checkInDue());
            });

            it("releases its hold when the subscription is lost", async () => {
                const { wakefulness, subscription, lose } = await subscribedLitPeer();
                lose();
                await flush();

                wakefulness.noteActive();
                expect(wakefulness.nextCheckInDue).equal(checkInDue());

                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });
            });

            it("releases its hold when the recreate after a mode change fails", async () => {
                const { wakefulness, subscription } = await subscribedLitPeer();
                wakefulness.requiresAwait = false; // recreate for the new mode; the resubscribe fails
                await flush();
                wakefulness.requiresAwait = true;

                wakefulness.noteActive();
                expect(wakefulness.nextCheckInDue).equal(checkInDue());

                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });
            });

            it("keeps its subscription when the peer's wakefulness is suspended", async () => {
                const { wakefulness, subscription } = await subscribedLitPeer();
                const id = subscription.subscriptionId;
                wakefulness.suspend();
                await flush();

                expect(subscription.active.value).equal(true);
                expect(subscription.subscriptionId).equal(id);

                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });
            });

            it("stops observing the peer's mode once closed", async () => {
                const { wakefulness, subscription } = await subscribedLitPeer();
                expect(wakefulness.operatingModeChanged.isObserved).equal(true);

                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });

                expect(wakefulness.operatingModeChanged.isObserved).equal(false);
            });
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
            registered.noteActive();
            peerFed.emit(NodeId(BigInt(2)));
            await flush();
            expect(subscribeCount).equal(1);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });
    });

    describe("event numbers", () => {
        function event(number: number): ReadResult.EventValue {
            return {
                kind: "event-value",
                path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x3b), eventId: EventId(1) },
                number: EventNumber(number),
                timestamp: number,
                priority: Priority.Info,
                value: undefined,
                tlv: TlvAny,
            };
        }

        async function* result(...numbers: number[]): ReadResult {
            yield numbers.map(event);
        }

        async function* asyncChunk(numbers: number[]) {
            for (const number of numbers) {
                yield event(number);
            }
        }

        async function* asyncResult(...numbers: number[]): ReadResult {
            yield asyncChunk(numbers);
        }

        /** Runs the subscription's loop until {@link condition} holds. */
        async function until(condition: () => boolean) {
            for (let turn = 0; !condition(); turn++) {
                if (turn > 1000) {
                    expect.fail("Condition not reached");
                }
                await MockTime.yield();
                await MockTime.advance(0);
            }
        }

        async function consume(data: ReadResult) {
            for await (const chunk of data) {
                for await (const _report of chunk);
            }
        }

        /**
         * A peer that delivers the next queued result as each subscription's priming report and records the event
         * filters of every subscribe request.
         */
        function peer(...results: number[][]) {
            const requests = new Array<TypeFromSchema<typeof TlvEventFilter>[] | undefined>();
            let current: Subscribe | undefined;
            const device = {
                requests,

                /** Subscriptions established so far. */
                established: 0,

                lose: () => current?.closed?.(),

                /** Sends a report on the current subscription. */
                report: (data: ReadResult) => current?.updated?.(data),

                subscribe: async (request: Subscribe) => {
                    requests.push(request.eventFilters);
                    current = request;
                    const numbers = results.shift();
                    if (numbers !== undefined) {
                        await request.updated?.(result(...numbers));
                    }
                    device.established++;
                    return fakePeerSub(() => request.closed?.());
                },
            };
            return device;
        }

        it("keeps the caller's event filters until it delivered an event", async () => {
            const device = peer([]);
            const subscription = build({
                request: {
                    ...Subscribe({ events: [{}], eventFilters: [{ eventMin: 7 }] }),
                    sustain: true,
                    updated: async data => {
                        for await (const _chunk of data);
                    },
                },
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            device.lose();
            await until(() => device.established === 2);

            expect(device.requests).deep.equals([[{ eventMin: 7 }], [{ eventMin: 7 }]]);
            expect(subscription.maxEventNumber).undefined;

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("resubscribes for events above the highest one it delivered", async () => {
            const device = peer([5, 9, 7]);
            const changes = new Array<EventNumber>();
            const subscription = build({
                request: {
                    ...Subscribe({ events: [{}], eventFilters: [{ eventMin: 3 }] }),
                    sustain: true,
                    updated: async data => {
                        for await (const chunk of data) {
                            for await (const _report of chunk);
                        }
                    },
                    maxEventNumberChanged: async number => {
                        changes.push(number);
                    },
                },
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            device.lose();
            await until(() => device.established === 2);

            expect(subscription.maxEventNumber).equals(EventNumber(9));
            expect(changes).deep.equals([EventNumber(9)]);
            expect(device.requests).deep.equals([[{ eventMin: 3 }], [{ eventMin: 10n }]]);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("counts a result only once its consumer resolved", async () => {
            const device = peer([4]);
            let seenWhileConsuming: EventNumber | undefined | null = null;
            const subscription = build({
                request: {
                    ...Subscribe({ events: [{}] }),
                    sustain: true,
                    updated: async data => {
                        for await (const chunk of data) {
                            for await (const _report of chunk);
                        }
                        seenWhileConsuming = subscription.maxEventNumber;
                    },
                },
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            expect(seenWhileConsuming).undefined;
            expect(subscription.maxEventNumber).equals(EventNumber(4));

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("requests events above the bootstrap read's highest event", async () => {
            const device = peer([]);
            const subscription = build({
                request: {
                    ...Subscribe({ events: [{}] }),
                    sustain: true,
                    bootstrapWithRead: true,
                    updated: async data => {
                        for await (const chunk of data) {
                            for await (const _report of chunk);
                        }
                    },
                },
                read: () => result(2, 8),
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            expect(device.requests).deep.equals([[{ eventMin: 9n }]]);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("does not lower its number when a later result carries lower event numbers", async () => {
            const device = peer([9], [5]);
            const changes = new Array<EventNumber>();
            const subscription = build({
                request: {
                    ...Subscribe({ events: [{}] }),
                    sustain: true,
                    updated: consume,
                    maxEventNumberChanged: async number => {
                        changes.push(number);
                    },
                },
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            device.lose();
            await until(() => device.established === 2);
            await MockTime.resolve(subscription.active);

            expect(subscription.maxEventNumber).equals(EventNumber(9));
            expect(changes).deep.equals([EventNumber(9)]);
            expect(device.requests).deep.equals([undefined, [{ eventMin: 10n }]]);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("counts events of reports with asynchronous chunks", async () => {
            const device = peer([]);
            const subscription = build({
                request: { ...Subscribe({ events: [{}] }), sustain: true, updated: consume },
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            await MockTime.resolve(device.report(asyncResult(3, 6))!);

            expect(subscription.maxEventNumber).equals(EventNumber(6));

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("keeps its number when a report without events follows", async () => {
            const device = peer([5], []);
            const changes = new Array<EventNumber | undefined>();
            const subscription = build({
                request: {
                    ...Subscribe({ events: [{}] }),
                    sustain: true,
                    updated: consume,
                    maxEventNumberChanged: async number => {
                        changes.push(number);
                    },
                },
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            await MockTime.resolve(device.report(result())!);
            device.lose();
            await until(() => device.established === 2);

            expect(subscription.maxEventNumber).equals(EventNumber(5));
            expect(changes).deep.equals([EventNumber(5)]);
            expect(device.requests).deep.equals([undefined, [{ eventMin: 6n }]]);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("settles the delivery of a report only after maxEventNumberChanged settled", async () => {
            const device = peer([]);
            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            const subscription = build({
                request: {
                    ...Subscribe({ events: [{}] }),
                    sustain: true,
                    updated: consume,
                    maxEventNumberChanged: () => released,
                },
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            let delivered = false;
            const delivery = device.report(result(4))!.then(() => {
                delivered = true;
            });
            await flush();
            expect(subscription.maxEventNumber).equals(EventNumber(4));
            expect(delivered).false;

            release();
            await MockTime.resolve(delivery);
            expect(delivered).true;

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("replaces the event filters a refreshRequest returns with its own once it delivered an event", async () => {
            const device = peer([5]);
            const subscription = build({
                request: {
                    ...Subscribe({ events: [{}] }),
                    sustain: true,
                    updated: consume,
                    refreshRequest: request => ({ ...request, eventFilters: [{ eventMin: 1 }] }),
                },
                subscribe: device.subscribe,
            });
            await until(() => device.established === 1);

            device.lose();
            await until(() => device.established === 2);

            expect(device.requests).deep.equals([undefined, [{ eventMin: 6n }]]);

            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        describe("when a report fails", () => {
            class PeerFailedError extends MatterError {}

            /**
             * A subscription whose consumer fails for every report carrying event 4 or 5, with the warnings it logs and
             * the probes it sends.
             */
            function failingOnEvents(device: ReturnType<typeof peer>) {
                let probes = 0;
                const activity = new Array<boolean>();
                const subscription = build({
                    request: {
                        ...Subscribe({ events: [{}] }),
                        sustain: true,
                        updated: async data => {
                            const numbers = new Array<EventNumber>();
                            for await (const chunk of data) {
                                for await (const report of chunk) {
                                    if (report.kind === "event-value") {
                                        numbers.push(report.number);
                                    }
                                }
                            }
                            if (numbers.some(number => number === 4n || number === 5n)) {
                                throw new ListenerFailedError("listener failed");
                            }
                        },
                    },
                    subscribe: device.subscribe,
                    probe: async () => {
                        probes++;
                        return true;
                    },
                });
                subscription.active.on(value => {
                    activity.push(value);
                });
                return { subscription, activity, probes: () => probes };
            }

            let warnings: string[];

            beforeEach(() => {
                const captured = new Array<string>();
                warnings = captured;
                Logger.destinations.capture = LogDestination({
                    add(message: Diagnostic.Message) {
                        if (message.facility === "ClientSubscription" && message.level === LogLevel.WARN) {
                            captured.push(message.values.join(" "));
                        }
                    },
                });
            });

            afterEach(() => {
                delete Logger.destinations.capture;
            });

            it("keeps a subscription whose priming report fails to process and counts its events", async () => {
                const device = peer([4]);
                const { subscription, activity } = failingOnEvents(device);
                await until(() => device.established === 1);
                await MockTime.advance(Seconds(15));
                await flush();

                expect(device.established).equals(1);
                expect(device.requests).deep.equals([undefined]);
                expect(activity).deep.equals([true]);
                expect(subscription.maxEventNumber).equals(EventNumber(4));
                expect(warnings.length).equals(1);

                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });
            });

            it("keeps a subscription whose live report fails to process and counts its events", async () => {
                const device = peer([3], []);
                const { subscription, activity, probes } = failingOnEvents(device);
                await until(() => device.established === 1);

                await MockTime.resolve(device.report(result(5))!);
                await flush();

                expect(device.established).equals(1);
                expect(probes()).equals(0);
                expect(activity).deep.equals([true]);
                expect(subscription.maxEventNumber).equals(EventNumber(5));
                expect(warnings.length).equals(1);

                device.lose();
                await until(() => device.established === 2);
                expect(device.requests).deep.equals([undefined, [{ eventMin: 6n }]]);

                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });
            });

            it("warns only for the first failure of its own processing", async () => {
                const device = peer([3], []);
                const { subscription } = failingOnEvents(device);
                await until(() => device.established === 1);

                await MockTime.resolve(device.report(result(4))!);
                await MockTime.resolve(device.report(result(5))!);

                expect(subscription.maxEventNumber).equals(EventNumber(5));
                expect(warnings.length).equals(1);

                subscription.close();
                await MockTime.resolve(subscription.done!, { macrotasks: true });
            });

            describe("in maxEventNumberChanged", () => {
                function failingCallback(device: ReturnType<typeof peer>) {
                    return build({
                        request: {
                            ...Subscribe({ events: [{}] }),
                            sustain: true,
                            updated: consume,
                            maxEventNumberChanged: async () => {
                                throw new ListenerFailedError("storing the number failed");
                            },
                        },
                        subscribe: device.subscribe,
                    });
                }

                it("logs it and delivers the report", async () => {
                    const device = peer([]);
                    const subscription = failingCallback(device);
                    await until(() => device.established === 1);

                    await MockTime.resolve(device.report(result(4))!);

                    expect(subscription.maxEventNumber).equals(EventNumber(4));
                    expect(warnings.length).equals(1);

                    subscription.close();
                    await MockTime.resolve(subscription.done!, { macrotasks: true });
                });

                it("keeps the failure of the report", async () => {
                    const device = peer([]);
                    const subscription = failingCallback(device);
                    await until(() => device.established === 1);

                    async function* aborted(): ReadResult {
                        yield [event(3)];
                        throw new PeerFailedError("report aborted");
                    }
                    const reported = device.report(aborted())!.then(
                        () => undefined,
                        (error: unknown) => error,
                    );

                    expect(await MockTime.resolve(reported)).instanceOf(PeerFailedError);
                    expect(subscription.maxEventNumber).equals(EventNumber(3));

                    subscription.close();
                    await MockTime.resolve(subscription.done!, { macrotasks: true });
                });
            });

            function* failingReports(): Iterable<ReadResult.Report> {
                yield event(3);
                throw new PeerFailedError("report decoding failed");
            }

            async function* failingReportsAsync(): AsyncIterable<ReadResult.Report> {
                yield event(3);
                throw new PeerFailedError("report decoding failed");
            }

            const brokenReports: Record<string, () => ReadResult> = {
                "receiving the next chunk": async function* () {
                    yield [event(3)];
                    throw new PeerFailedError("report aborted");
                },
                "decoding a chunk": async function* () {
                    yield failingReports();
                },
                "decoding an asynchronous chunk": async function* () {
                    yield failingReportsAsync();
                },
            };

            for (const [failure, brokenReport] of Object.entries(brokenReports)) {
                it(`passes a failure while ${failure} on and counts the events received before it`, async () => {
                    const device = peer([2], []);
                    const { subscription, activity, probes } = failingOnEvents(device);
                    await until(() => device.established === 1);

                    const reported = device.report(brokenReport())!.then(
                        () => undefined,
                        (error: unknown) => error,
                    );
                    expect(await MockTime.resolve(reported)).instanceOf(PeerFailedError);
                    await flush();

                    expect(device.established).equals(1);
                    expect(probes()).equals(0);
                    expect(activity).deep.equals([true]);
                    expect(subscription.maxEventNumber).equals(EventNumber(3));
                    expect(warnings).deep.equals([]);

                    subscription.close();
                    await MockTime.resolve(subscription.done!, { macrotasks: true });
                });
            }
        });
    });
});
