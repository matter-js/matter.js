/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerTimingParameters } from "#peer/PeerTimingParameters.js";
import {
    Abort,
    Observable,
    Seconds,
    ServerAddress,
    ServerAddressIp,
    ServerAddressUdp,
    Time,
    Timestamp,
} from "@matter/general";

function udp(ip: string, port = 5540): ServerAddressUdp {
    return { type: "udp", ip, port };
}

/**
 * Tests for fallback retirement in {@link PeerConnection}.
 *
 * `retireStaleFallback` is a closure inside `PeerConnection()` (it needs peer/session/exchange/service wiring), so
 * following the convention of the sibling PeerConnection tests these validate the composable pieces:
 *
 * 1. The reused `addressChangeStabilizationDelay` debounce.
 * 2. The retire-after-stabilization behavior, driven against a fake service under MockTime.
 * 3. The "fallback superseded" decision (promoted / re-advertised / no alternative).
 * 4. The `deleteAddress` keep-alive guard and its `force` bypass.
 * 5. The scheduler stagger being skipped once retirement resets `lastAttemptAt`.
 */

/**
 * Mirror of `fallbackSuperseded`: we are attempting a fallback that discovery has dropped when at least one address is
 * known and none of them is the fallback (matched by IP, ignoring transport).
 */
function superseded(attemptingFallback: ServerAddressIp | undefined, addresses: Set<ServerAddressIp>) {
    if (attemptingFallback === undefined || addresses.size === 0) {
        return false;
    }
    for (const address of addresses) {
        if (ServerAddress.isEqual(address, attemptingFallback)) {
            return false;
        }
    }
    return true;
}

/**
 * Mirror of `retireStaleFallback`.  Drives the identical debounce + decision against a fake service so we can prove it
 * retires a superseded fallback after the stabilization delay.
 */
function runRetirementWorker(
    state: { attemptingFallback: ServerAddressIp | undefined; lastAttemptAt: Timestamp | undefined },
    service: { changed: Observable<[]>; addresses: Set<ServerAddressIp> },
    timing: PeerTimingParameters,
    abort: Abort,
) {
    const retired = new Array<ServerAddressIp>();
    let rescheduled = 0;
    let resolveFirst!: () => void;
    const firstRetire = new Promise<void>(resolve => (resolveFirst = resolve));

    const done = (async () => {
        while (!abort.aborted) {
            if (!superseded(state.attemptingFallback, service.addresses)) {
                await abort.race(service.changed);
                continue;
            }

            await Abort.sleep("fallback stabilization", abort, timing.addressChangeStabilizationDelay);

            if (abort.aborted || !superseded(state.attemptingFallback, service.addresses)) {
                continue;
            }

            const stale = state.attemptingFallback!;
            state.attemptingFallback = undefined;
            state.lastAttemptAt = undefined;
            retired.push(stale);
            rescheduled++;
            resolveFirst();
        }
    })();

    return {
        done,
        retired,
        firstRetire,
        get rescheduled() {
            return rescheduled;
        },
    };
}

describe("PeerConnection fallback retirement", () => {
    afterEach(() => MockTime.disable());

    describe("PeerTimingParameters", () => {
        it("reuses addressChangeStabilizationDelay (10s) as the retirement debounce", () => {
            expect(PeerTimingParameters.defaults.addressChangeStabilizationDelay).equals(Seconds(10));
        });
    });

    describe("retire after stabilization", () => {
        it("retires the fallback once discovery surfaces an alternative and the set settles", async () => {
            MockTime.reset();
            using abort = new Abort();

            // Discovery has surfaced a different address; the fallback is not among them.
            const service = { changed: new Observable<[]>(), addresses: new Set<ServerAddressIp>([udp("fdf5::1")]) };
            const state = {
                attemptingFallback: udp("fd9a::1") as ServerAddressIp | undefined,
                lastAttemptAt: Time.nowMs as Timestamp | undefined,
            };

            const worker = runRetirementWorker(state, service, PeerTimingParameters(), abort);

            // Nothing happens before the debounce elapses.
            await MockTime.advance(Seconds(9));
            expect(worker.retired).lengthOf(0);

            // After the debounce the fallback is retired (both variants via deleteAddress in production), the stagger
            // clock is reset and the scheduler is kicked.
            await MockTime.advance(Seconds(1) + 1);
            await MockTime.resolve(worker.firstRetire);
            expect(worker.retired).deep.equals([udp("fd9a::1")]);
            expect(state.attemptingFallback).equals(undefined);
            expect(state.lastAttemptAt).equals(undefined);
            expect(worker.rescheduled).equals(1);

            abort();
            await MockTime.resolve(worker.done);
        });

        it("does not retire a fallback that discovery re-advertises during the debounce", async () => {
            MockTime.reset();
            using abort = new Abort();

            const service = { changed: new Observable<[]>(), addresses: new Set<ServerAddressIp>([udp("fdf5::1")]) };
            const state = {
                attemptingFallback: udp("fd9a::1") as ServerAddressIp | undefined,
                lastAttemptAt: Time.nowMs as Timestamp | undefined,
            };

            const worker = runRetirementWorker(state, service, PeerTimingParameters(), abort);

            await MockTime.advance(Seconds(5));

            // The fallback re-appears in discovery (a UDP-variant match of the operational address).
            service.addresses.add(udp("fd9a::1"));

            await MockTime.advance(Seconds(6));
            expect(worker.retired).lengthOf(0);
            expect(state.attemptingFallback).deep.equals(udp("fd9a::1"));

            abort();
            await MockTime.resolve(worker.done);
        });

        it("does not retire while no discovered alternative exists", async () => {
            MockTime.reset();
            using abort = new Abort();

            const service = { changed: new Observable<[]>(), addresses: new Set<ServerAddressIp>() };
            const state = {
                attemptingFallback: udp("fd9a::1") as ServerAddressIp | undefined,
                lastAttemptAt: Time.nowMs as Timestamp | undefined,
            };

            const worker = runRetirementWorker(state, service, PeerTimingParameters(), abort);

            await MockTime.advance(Seconds(60));
            expect(worker.retired).lengthOf(0);
            expect(state.attemptingFallback).deep.equals(udp("fd9a::1"));

            abort();
            await MockTime.resolve(worker.done);
        });
    });

    describe("fallbackSuperseded decision", () => {
        it("is superseded with a discovered alternative that is not the fallback", () => {
            expect(superseded(udp("fd9a::1"), new Set([udp("fdf5::1")]))).equals(true);
        });

        it("is not superseded once promoted (fallback flag cleared)", () => {
            expect(superseded(undefined, new Set([udp("fdf5::1")]))).equals(false);
        });

        it("is not superseded when no discovered address exists", () => {
            expect(superseded(udp("fd9a::1"), new Set())).equals(false);
        });

        it("is not superseded when the fallback is itself re-advertised (matched ignoring transport)", () => {
            expect(superseded(udp("fd9a::1"), new Set([udp("fd9a::1")]))).equals(false);
        });

        it("is not superseded when the fallback is re-advertised alongside other addresses", () => {
            expect(superseded(udp("fd9a::1"), new Set([udp("fd9a::1"), udp("fdf5::1")]))).equals(false);
        });
    });

    describe("deleteAddress keep-alive guard", () => {
        /**
         * Mirror of the guard in `deleteAddress`: keep the operational address alive as fallback when it is the last
         * attempt, unless the caller forces deletion (retirement, where a discovered alternative already exists).
         */
        function keepsAlive(force: boolean, isOperational: boolean, remainingNonOperational: number) {
            return !force && isOperational && remainingNonOperational === 0;
        }

        it("keeps the operational address alive when it is the last attempt (unforced)", () => {
            expect(keepsAlive(false, true, 0)).equals(true);
        });

        it("deletes when a non-operational attempt still remains", () => {
            expect(keepsAlive(false, true, 1)).equals(false);
        });

        it("force bypasses the keep-alive so a superseded fallback is actually dropped", () => {
            expect(keepsAlive(true, true, 0)).equals(false);
        });
    });

    describe("scheduler stagger", () => {
        /**
         * Mirror of the `scheduleAttempts` delay: an address waits `delayBeforeNextAddress` from the last initiation,
         * but a reset `lastAttemptAt` (as retirement performs) skips the wait entirely.
         */
        function pendingDelay(timing: PeerTimingParameters, lastAttemptAt: Timestamp | undefined) {
            if (lastAttemptAt === undefined) {
                return 0;
            }
            const remaining = timing.delayBeforeNextAddress - Timestamp.delta(lastAttemptAt);
            return remaining > 0 ? remaining : 0;
        }

        it("staggers a second real address behind the first", () => {
            MockTime.reset();
            expect(pendingDelay(PeerTimingParameters(), Time.nowMs)).equals(
                PeerTimingParameters().delayBeforeNextAddress,
            );
        });

        it("starts immediately once retirement resets lastAttemptAt", () => {
            expect(pendingDelay(PeerTimingParameters(), undefined)).equals(0);
        });
    });
});
