/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableDevice } from "#common/Scanner.js";
import { CommissioningConnection } from "#peer/CommissioningConnection.js";
import { PairRetransmissionLimitReachedError } from "#peer/CommissioningError.js";
import {
    AbortedError,
    AddressUnreachableError,
    Millis,
    NetworkUnreachableError,
    NoResponseTimeoutError,
    Seconds,
    ServerAddressUdp,
    Time,
    UnexpectedDataError,
} from "@matter/general";

function udp(ip: string, port = 5540): ServerAddressUdp {
    return { type: "udp", ip, port };
}

function device(deviceIdentifier: string, addresses: ServerAddressUdp[]): CommissionableDevice {
    return {
        deviceIdentifier,
        addresses,
        D: 1000,
        CM: 1,
    };
}

describe("CommissioningConnection", () => {
    it("drops device on UnexpectedDataError and tries next device", async () => {
        const attempts = new Array<string>();

        const { discoveryData } = await CommissioningConnection({
            devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")])],
            timeout: Seconds(2),
            delayBeforeNextAddress: 0,
            establishSession: async (address, discoveryData) => {
                attempts.push(`${discoveryData.deviceIdentifier}:${(address as ServerAddressUdp).ip}`);
                if (discoveryData.deviceIdentifier === "a") {
                    throw new UnexpectedDataError("invalid credentials");
                }
                return {} as any;
            },
        });

        expect(discoveryData.deviceIdentifier).equals("b");
        expect(attempts).deep.equals(["a:fd00::1", "b:fd00::2"]);
    });

    it("does not accept a late success on a device already dropped for invalid credentials", async () => {
        // One device, two addresses sharing a device abort: the first address fails the credential check
        // (dropping the whole device), so a slower success on the second address must NOT be accepted as
        // the winner — the device has been permanently dropped.
        let releaseLate!: () => void;
        const lateGate = new Promise<void>(r => (releaseLate = r));
        let closeCause: unknown;

        const p = CommissioningConnection({
            devices: [device("a", [udp("fd00::1"), udp("fd00::2")])],
            timeout: Seconds(2),
            delayBeforeNextAddress: 0,
            establishSession: async address => {
                if ((address as ServerAddressUdp).ip === "fd00::1") {
                    throw new UnexpectedDataError("invalid credentials");
                }
                await lateGate;
                return {
                    initiateForceClose: async (options?: { cause?: unknown }) => {
                        closeCause = options?.cause;
                    },
                } as any;
            },
        });

        // Let fd00::1 fail and mark the device invalid, then let fd00::2 complete.
        await new Promise(r => setTimeout(r, 0));
        releaseLate();

        await expect(p).rejectedWith(UnexpectedDataError);
        await new Promise(r => setTimeout(r, 0));
        // The late session is closed with the real credential error, not the generic race fallback.
        expect(closeCause).instanceof(UnexpectedDataError);
    });

    it("keeps device in play for network errors while addresses remain", async () => {
        const attempts = new Array<string>();

        const { discoveryData } = await CommissioningConnection({
            devices: [device("a", [udp("fd00::1"), udp("fd00::3")]), device("b", [udp("fd00::2")])],
            timeout: Seconds(2),
            delayBeforeNextAddress: 0,
            establishSession: async (address, discoveryData) => {
                const ip = (address as ServerAddressUdp).ip;
                attempts.push(`${discoveryData.deviceIdentifier}:${ip}`);
                if (ip !== "fd00::3") {
                    throw new NoResponseTimeoutError("temporary network error");
                }
                return {} as any;
            },
        });

        expect(discoveryData.deviceIdentifier).equals("a");
        expect(attempts).deep.equals(["a:fd00::1", "a:fd00::3", "b:fd00::2"]);
    });

    it("credential failure skips later entries with the same deviceIdentifier", async () => {
        const attempts = new Array<string>();

        await expect(
            CommissioningConnection({
                devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")]), device("a", [udp("fd00::3")])],
                timeout: Seconds(2),
                delayBeforeNextAddress: Seconds(1),
                establishSession: async (address, discoveryData) => {
                    attempts.push(`${discoveryData.deviceIdentifier}:${(address as ServerAddressUdp).ip}`);
                    if (discoveryData.deviceIdentifier === "a") {
                        throw new UnexpectedDataError("invalid credentials");
                    }
                    throw new NoResponseTimeoutError("temporary network error");
                },
            }),
        ).rejectedWith(UnexpectedDataError);

        expect(attempts).deep.equals(["a:fd00::1", "b:fd00::2"]);
    });

    it("throws UnexpectedDataError (not generic error) when all static candidates fail with wrong credentials", async () => {
        await expect(
            CommissioningConnection({
                devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")])],
                timeout: Seconds(2),
                delayBeforeNextAddress: 0,
                establishSession: async () => {
                    throw new UnexpectedDataError("invalid credentials");
                },
            }),
        ).rejectedWith(UnexpectedDataError);
    });

    it("closes session if winner is found concurrently with another establishment completing", async () => {
        let sessionClosed = false;
        let resolveFirst!: () => void;
        let resolveSecond!: () => void;

        // a establishes first, b finishes slightly after → b's session must be closed
        const p = CommissioningConnection({
            devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")])],
            timeout: Seconds(2),
            delayBeforeNextAddress: 0,
            establishSession: async (address, _device) => {
                const ip = (address as ServerAddressUdp).ip;
                if (ip === "fd00::1") {
                    await new Promise<void>(r => (resolveFirst = r));
                    return {} as any; // a wins
                }
                await new Promise<void>(r => (resolveSecond = r));
                return {
                    initiateForceClose: async () => {
                        sessionClosed = true;
                    },
                } as any; // b loses
            },
        });

        // Yield to the event loop so the PASE attempts start and resolveFirst/resolveSecond get assigned.
        await new Promise(r => setTimeout(r, 0));

        // Let a finish first, then b
        resolveFirst();
        await new Promise(r => setTimeout(r, 0));
        resolveSecond();

        await p;
        // The won session is returned without blocking on loser cleanup, so the loser closes its
        // orphan session in the background — yield to let that finish before asserting.
        await new Promise(r => setTimeout(r, 0));
        expect(sessionClosed).equals(true);
    });

    it("returns the won session without waiting for an abort-unresponsive loser to settle", async () => {
        // Regression for the parallel-PASE commissioning flake: once one address wins PASE the won
        // session must be returned immediately.  A loser wedged in an abort-unresponsive wait (device
        // PASE responder locked until its ~60s pairing failsafe) must NOT delay the winner, or the won
        // session ages past the failsafe and is already dead by the time commissioning uses it.
        let releaseLoser!: () => void;
        const loserGate = new Promise<void>(r => (releaseLoser = r));
        let winnerResolved = false;
        let winnerSessionClosed = false;

        const p = CommissioningConnection({
            devices: [device("winner", [udp("abcd::2")]), device("loser", [udp("10.10.10.2")])],
            timeout: Seconds(90),
            delayBeforeNextAddress: 0,
            establishSession: async address => {
                if ((address as ServerAddressUdp).ip === "abcd::2") {
                    return {
                        initiateForceClose: async () => {
                            winnerSessionClosed = true;
                        },
                    } as any;
                }
                // Loser deliberately ignores the abort signal — models a PASE attempt wedged in an MRP
                // wait against a device whose responder stays locked until its pairing failsafe expires.
                await loserGate;
                return { initiateForceClose: async () => {} } as any;
            },
        });
        const settled = p.then(result => {
            winnerResolved = true;
            return result;
        });

        try {
            // Give the winner every chance to establish and the race to settle, WITHOUT releasing the loser.
            for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 0));
            }

            expect(winnerResolved).equals(true);
            const result = await settled;
            expect(result.discoveryData.deviceIdentifier).equals("winner");
            expect(winnerSessionClosed).equals(false);
        } finally {
            // Release the loser so its cleanup runs and nothing dangles into the next test.
            releaseLoser();
            await new Promise(r => setTimeout(r, 0));
        }
    });

    it("closes session if timeout fires while establishment is pending", async () => {
        let sessionClosed = false;

        await expect(
            CommissioningConnection({
                devices: [device("a", [udp("fd00::1")])],
                timeout: Millis(50),
                delayBeforeNextAddress: 0,
                establishSession: async () => {
                    // Delay much longer than the timeout so the abort fires before we return.
                    await new Promise<void>(resolve => setTimeout(resolve, 1000));
                    return {
                        initiateForceClose: async () => {
                            sessionClosed = true;
                        },
                    } as any;
                },
            }),
        ).rejectedWith(PairRetransmissionLimitReachedError);
        expect(sessionClosed).equals(true);
    });

    it("propagates external abort reason instead of masking as timeout", async () => {
        const ac = new AbortController();

        // Start a connection that will be cancelled externally before it can establish PASE.
        const p = CommissioningConnection({
            devices: [device("a", [udp("fd00::1")])],
            timeout: Millis(500),
            delayBeforeNextAddress: 0,
            externalAbort: ac.signal,
            establishSession: async (_address, _discoveryData, { signal }) => {
                // Wait for the abort signal — reject with the signal's reason so we can verify
                // CommissioningConnection propagates the caller's reason, not a generic timeout.
                await new Promise<void>((_resolve, reject) => {
                    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                });
                return {} as any;
            },
        });

        // establishSession registers the abort listener before its first await, so a yield is enough.
        await MockTime.yield();
        ac.abort(new AbortedError("caller cancelled"));

        // Should throw the external abort reason, NOT PairRetransmissionLimitReachedError.
        await expect(p).rejectedWith(AbortedError, "caller cancelled");
    });

    it("external abort cancels in-flight connection and rejects with abort reason", async () => {
        // Simulates the parallel commissioning scenario: two independent CommissioningConnection
        // calls share an external AbortController. When one device wins PASE, the abort fires and
        // the other call must reject cleanly (not as an unhandled rejection that crashes the process).
        const ac = new AbortController();

        // The "loser" connection is externally aborted while its PASE attempt is in-flight.
        const loserPromise = CommissioningConnection({
            devices: [device("loser", [udp("fd00::1")])],
            timeout: Millis(500),
            delayBeforeNextAddress: 0,
            externalAbort: ac.signal,
            establishSession: async (_address, _discoveryData, { signal }) => {
                await new Promise<void>((_resolve, reject) => {
                    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                });
                return {} as any;
            },
        });

        // establishSession registers the abort listener synchronously; yield to let it settle.
        await MockTime.yield();
        ac.abort(new AbortedError("another device won PASE"));

        // The loser must reject with the abort reason, not PairRetransmissionLimitReachedError.
        // Critically, this must not become an unhandled rejection (which would crash the process).
        await expect(loserPromise).rejectedWith(AbortedError, "another device won PASE");
    });

    it("treats AddressUnreachableError as transient, other addresses still succeed", async () => {
        const attempts = new Array<string>();

        const { discoveryData } = await CommissioningConnection({
            devices: [device("a", [udp("fd00::1"), udp("fd00::2"), udp("192.168.1.1")])],
            timeout: Seconds(2),
            delayBeforeNextAddress: 0,
            establishSession: async (address, discoveryData) => {
                const ip = (address as ServerAddressUdp).ip;
                attempts.push(`${discoveryData.deviceIdentifier}:${ip}`);
                if (ip === "fd00::1") {
                    throw new AddressUnreachableError("send EHOSTUNREACH fd00::1:5540");
                }
                if (ip === "fd00::2") {
                    throw new NetworkUnreachableError("send ENETUNREACH fd00::2:5540");
                }
                return {} as any;
            },
        });

        expect(discoveryData.deviceIdentifier).equals("a");
        expect(attempts).includes("a:192.168.1.1");
    });

    it("reports NetworkError as last error when all addresses fail with it", async () => {
        await expect(
            CommissioningConnection({
                devices: [device("a", [udp("fd00::1"), udp("fd00::2")])],
                timeout: Seconds(2),
                delayBeforeNextAddress: 0,
                establishSession: async address => {
                    const ip = (address as ServerAddressUdp).ip;
                    throw new AddressUnreachableError(`send EHOSTUNREACH ${ip}:5540`);
                },
            }),
        ).rejectedWith(PairRetransmissionLimitReachedError);
    });

    it("passes abort signal to establishSession and aborts early when timeout fires", async () => {
        let receivedSignal: AbortSignal | undefined;

        await expect(
            CommissioningConnection({
                devices: [device("a", [udp("fd00::1")])],
                timeout: Millis(50),
                delayBeforeNextAddress: 0,
                establishSession: async (_address, _discoveryData, { signal }) => {
                    receivedSignal = signal;
                    // Simulate abort-aware establishment that respects the signal
                    await new Promise<void>((resolve, reject) => {
                        const timer = setTimeout(resolve, 1000);
                        signal.addEventListener(
                            "abort",
                            () => {
                                clearTimeout(timer);
                                reject(signal.reason);
                            },
                            { once: true },
                        );
                    });
                    return {} as any;
                },
            }),
        ).rejectedWith(PairRetransmissionLimitReachedError);
        expect(receivedSignal).not.undefined;
        expect(receivedSignal!.aborted).equals(true);
    });

    describe("per-address stagger", () => {
        beforeEach(() => MockTime.reset());

        function deferred<T = void>() {
            let resolve!: (value: T) => void;
            let reject!: (reason?: unknown) => void;
            const promise = new Promise<T>((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        }

        it("first candidate fires immediately, subsequent candidates wait delayBeforeNextAddress each", async () => {
            const order = new Array<string>();
            const gate = deferred<void>();

            const p = CommissioningConnection({
                devices: [device("a", [udp("fd00::1"), udp("fd00::2"), udp("fd00::3")])],
                timeout: Seconds(60),
                delayBeforeNextAddress: Seconds(5),
                establishSession: async (address, _discoveryData, { signal }) => {
                    order.push((address as ServerAddressUdp).ip);
                    await new Promise<void>((resolve, reject) => {
                        void gate.promise.then(resolve);
                        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                    });
                    if ((address as ServerAddressUdp).ip === "fd00::1") {
                        return {} as any;
                    }
                    throw new NoResponseTimeoutError("losing");
                },
            });

            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1"]);

            await MockTime.advance(5000);
            await MockTime.yield3();
            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1", "fd00::2"]);

            await MockTime.advance(5000);
            await MockTime.yield3();
            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1", "fd00::2", "fd00::3"]);

            gate.resolve();
            const result = await p;
            expect(result.discoveryData.deviceIdentifier).equals("a");
        });

        it("cancels pending stagger when a winner is established", async () => {
            const order = new Array<string>();
            const winnerGate = deferred<void>();

            const p = CommissioningConnection({
                devices: [device("a", [udp("fd00::1"), udp("fd00::2"), udp("fd00::3")])],
                timeout: Seconds(60),
                delayBeforeNextAddress: Seconds(5),
                establishSession: async (address, _discoveryData, { signal }) => {
                    order.push((address as ServerAddressUdp).ip);
                    if ((address as ServerAddressUdp).ip === "fd00::1") {
                        await winnerGate.promise;
                        return {} as any;
                    }
                    await new Promise<void>((_resolve, reject) =>
                        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
                    );
                    throw new NoResponseTimeoutError("should not run");
                },
            });

            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1"]);

            winnerGate.resolve();
            const result = await p;
            expect(result.discoveryData.deviceIdentifier).equals("a");

            await MockTime.advance(15000);
            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1"]);
        });

        it("stagger slot is global across distinct devices (contract doc)", async () => {
            const order = new Array<string>();
            const gate = deferred<void>();

            const p = CommissioningConnection({
                devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")])],
                timeout: Seconds(60),
                delayBeforeNextAddress: Seconds(5),
                establishSession: async (address, discoveryData, { signal }) => {
                    order.push(`${discoveryData.deviceIdentifier}:${(address as ServerAddressUdp).ip}`);
                    await new Promise<void>((resolve, reject) => {
                        void gate.promise.then(resolve);
                        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                    });
                    return discoveryData.deviceIdentifier === "a" ? ({} as any) : Promise.reject(new Error());
                },
            });

            await MockTime.yield3();
            expect(order).deep.equals(["a:fd00::1"]);

            await MockTime.advance(4900);
            await MockTime.yield3();
            expect(order).deep.equals(["a:fd00::1"]);

            await MockTime.advance(200);
            await MockTime.yield3();
            await MockTime.yield3();
            expect(order).deep.equals(["a:fd00::1", "b:fd00::2"]);

            gate.resolve();
            const result = await p;
            expect(result.discoveryData.deviceIdentifier).equals("a");
        });

        it("a fast failure starts the next attempt at once, and that attempt still wins", async () => {
            // The earlier failure must neither delay the next address by the stagger nor end the race before the
            // later attempt lands.
            const order = new Array<string>();
            const winnerGate = deferred<void>();

            const p = CommissioningConnection({
                devices: [device("a", [udp("fd00::1"), udp("fd00::2")])],
                timeout: Seconds(60),
                delayBeforeNextAddress: Seconds(5),
                establishSession: async (address, _discoveryData, { signal }) => {
                    const ip = (address as ServerAddressUdp).ip;
                    order.push(ip);
                    if (ip === "fd00::1") {
                        throw new AddressUnreachableError("fe80-like unreachable");
                    }
                    await new Promise<void>((resolve, reject) => {
                        void winnerGate.promise.then(resolve);
                        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                    });
                    return {} as any;
                },
            });

            await MockTime.yield3();
            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1", "fd00::2"]);

            winnerGate.resolve();
            const result = await p;
            expect(result.discoveryData.deviceIdentifier).equals("a");
        });

        it("gives a third address an attempt within the default 30s timeout", async () => {
            const order = new Array<string>();

            const p = CommissioningConnection({
                devices: [device("a", [udp("fd00::1"), udp("fd00::2"), udp("fd00::3")])],
                timeout: Seconds(30),
                establishSession: async (address, _discoveryData, { signal }) => {
                    order.push((address as ServerAddressUdp).ip);
                    return new Promise((_resolve, reject) => {
                        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                    });
                },
            });
            const outcome = p.catch(error => error);

            await MockTime.advance(20100);
            await MockTime.yield3();
            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1", "fd00::2", "fd00::3"]);

            await MockTime.advance(Seconds(10));
            expect(await outcome).instanceOf(PairRetransmissionLimitReachedError);
        });

        it("holds the next address while an attempt has reached its responder", async () => {
            const order = new Array<string>();
            const firstFails = deferred<void>();

            const p = CommissioningConnection({
                devices: [device("a", [udp("fd00::1"), udp("fd00::2")])],
                timeout: Seconds(60),
                delayBeforeNextAddress: Seconds(5),
                establishSession: async (address, _discoveryData, { onPbkdfParamResponse }) => {
                    const ip = (address as ServerAddressUdp).ip;
                    order.push(ip);
                    if (ip === "fd00::1") {
                        onPbkdfParamResponse();
                        await firstFails.promise;
                        throw new AddressUnreachableError("responder went silent");
                    }
                    return {} as any;
                },
            });

            await MockTime.advance(Seconds(15));
            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1"]);

            firstFails.resolve();
            const result = await p;
            expect(order).deep.equals(["fd00::1", "fd00::2"]);
            expect(result.discoveryData.deviceIdentifier).equals("a");
        });

        it("skips the queued addresses of a device dropped for invalid credentials", async () => {
            const order = new Array<string>();

            const result = CommissioningConnection({
                devices: [device("a", [udp("fd00::1"), udp("fd00::2")])],
                timeout: Seconds(60),
                delayBeforeNextAddress: Seconds(5),
                establishSession: async address => {
                    order.push((address as ServerAddressUdp).ip);
                    throw new UnexpectedDataError("wrong passcode");
                },
            }).catch(error => error);

            await MockTime.yield3();
            await MockTime.advance(Seconds(10));
            expect(await result).instanceOf(UnexpectedDataError);
            expect(order).deep.equals(["fd00::1"]);
        });

        describe("scripted addresses", () => {
            interface Script {
                /** Delay after launch before the responder answers. */
                reach?: number;
                /** Delay after launch before the attempt fails; absent means it hangs until aborted. */
                fail?: number;
                win?: boolean;
            }

            function run(scripts: Record<string, Script>) {
                const order = new Array<string>();
                const result = CommissioningConnection({
                    devices: [
                        device(
                            "a",
                            Object.keys(scripts).map(ip => udp(ip)),
                        ),
                    ],
                    timeout: Seconds(60),
                    delayBeforeNextAddress: Seconds(5),
                    establishSession: async (address, _discoveryData, { signal, onPbkdfParamResponse }) => {
                        const ip = (address as ServerAddressUdp).ip;
                        order.push(ip);
                        const { reach, fail, win } = scripts[ip];
                        let elapsed = 0;
                        if (reach !== undefined) {
                            await Time.sleep("reach", Millis(reach));
                            elapsed = reach;
                            onPbkdfParamResponse();
                        }
                        if (win) {
                            return {} as any;
                        }
                        if (fail !== undefined) {
                            await Time.sleep("fail", Millis(fail - elapsed));
                            throw new AddressUnreachableError(`${ip} gave up`);
                        }
                        return new Promise((_resolve, reject) => {
                            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                        });
                    },
                });
                return { order, result: result.catch(error => error) };
            }

            async function at(ms: number) {
                await MockTime.advance(ms);
                await MockTime.yield3();
                await MockTime.yield3();
            }

            it("restarts the stagger from the last launch", async () => {
                const { order, result } = run({ "fd00::1": { fail: 2000 }, "fd00::2": {}, "fd00::3": {} });

                await at(2000);
                expect(order).deep.equals(["fd00::1", "fd00::2"]);
                await at(4900);
                expect(order).deep.equals(["fd00::1", "fd00::2"]);
                await at(200);
                expect(order).deep.equals(["fd00::1", "fd00::2", "fd00::3"]);

                await MockTime.advance(Seconds(60));
                await result;
            });

            it("lets an older failure leave the newer attempt's stagger running", async () => {
                const { order, result } = run({ "fd00::1": { fail: 7000 }, "fd00::2": {}, "fd00::3": {} });

                await at(5000);
                expect(order).deep.equals(["fd00::1", "fd00::2"]);
                await at(2100);
                expect(order).deep.equals(["fd00::1", "fd00::2"]);
                await at(3000);
                expect(order).deep.equals(["fd00::1", "fd00::2", "fd00::3"]);

                await MockTime.advance(Seconds(60));
                await result;
            });

            it("keeps the newer attempt's delay when a held attempt fails while it is unanswered", async () => {
                const { order, result } = run({
                    "fd00::1": { reach: 6000, fail: 8000 },
                    "fd00::2": {},
                    "fd00::3": {},
                });

                await at(5000);
                await at(1000); // fd00::1 holds its responder
                await at(2100); // fd00::1 fails; fd00::2, started at 5s, is still unanswered
                expect(order).deep.equals(["fd00::1", "fd00::2"]);
                await at(2000); // 5s after fd00::2 started
                expect(order).deep.equals(["fd00::1", "fd00::2", "fd00::3"]);

                await MockTime.advance(Seconds(60));
                await result;
            });

            it("launches the next address once a hold ends after the latest attempt failed", async () => {
                const { order, result } = run({
                    "fd00::1": {},
                    "fd00::2": { reach: 6000, fail: 10000 },
                    "fd00::3": { fail: 2000 },
                    "fd00::4": { win: true },
                });

                await at(5000); // fd00::2 starts
                await at(5000); // fd00::3 starts
                await at(1000); // fd00::2 holds its responder
                await at(1000); // fd00::3, the latest, fails while fd00::2 holds
                expect(order).deep.equals(["fd00::1", "fd00::2", "fd00::3"]);
                await at(3100); // fd00::2 fails; nothing unanswered is newer, so fd00::4 starts at once
                expect(order).deep.equals(["fd00::1", "fd00::2", "fd00::3", "fd00::4"]);
                expect((await result).discoveryData.deviceIdentifier).equals("a");
            });

            it("launches the next address when a held attempt fails with nothing else pending", async () => {
                const { order, result } = run({
                    "fd00::1": { reach: 6000, fail: 8000 },
                    "fd00::2": { fail: 2000 },
                    "fd00::3": { win: true },
                });

                await at(5000);
                expect(order).deep.equals(["fd00::1", "fd00::2"]);
                await at(1000); // fd00::1 reaches its responder
                await at(1000); // fd00::2 fails while fd00::1 holds the responder
                expect(order).deep.equals(["fd00::1", "fd00::2"]);
                await at(1100); // fd00::1 fails
                expect(order).deep.equals(["fd00::1", "fd00::2", "fd00::3"]);
                expect((await result).discoveryData.deviceIdentifier).equals("a");
            });
        });

        it("default delayBeforeNextAddress is 10s", async () => {
            const order = new Array<string>();
            const gate = deferred<void>();

            const p = CommissioningConnection({
                devices: [device("a", [udp("fd00::1"), udp("fd00::2")])],
                timeout: Seconds(60),
                establishSession: async (address, _discoveryData, { signal }) => {
                    order.push((address as ServerAddressUdp).ip);
                    await new Promise<void>((resolve, reject) => {
                        void gate.promise.then(resolve);
                        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                    });
                    return (address as ServerAddressUdp).ip === "fd00::1" ? ({} as any) : Promise.reject(new Error());
                },
            });

            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1"]);

            await MockTime.advance(9900);
            await MockTime.yield3();
            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1"]);

            await MockTime.advance(200);
            await MockTime.yield3();
            await MockTime.yield3();
            expect(order).deep.equals(["fd00::1", "fd00::2"]);

            gate.resolve();
            await p;
        });
    });
});
