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

    it("keeps device in play for network errors while addresses remain", async () => {
        const attempts = new Array<string>();

        const { discoveryData } = await CommissioningConnection({
            devices: [device("a", [udp("fd00::1"), udp("fd00::3")]), device("b", [udp("fd00::2")])],
            timeout: Seconds(2),
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
        // All addresses of all devices are launched in parallel; within device "a", fd00::1 is tried before fd00::3.
        expect(attempts).deep.equals(["a:fd00::1", "a:fd00::3", "b:fd00::2"]);
    });

    it("throws UnexpectedDataError (not generic error) when all static candidates fail with wrong credentials", async () => {
        await expect(
            CommissioningConnection({
                devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")])],
                timeout: Seconds(2),
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
        expect(sessionClosed).equals(true);
    });

    it("closes session if timeout fires while establishment is pending", async () => {
        let sessionClosed = false;

        await expect(
            CommissioningConnection({
                devices: [device("a", [udp("fd00::1")])],
                timeout: Millis(50),
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
            externalAbort: ac.signal,
            establishSession: async (_address, _discoveryData, signal) => {
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
            externalAbort: ac.signal,
            establishSession: async (_address, _discoveryData, signal) => {
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
                establishSession: async (_address, _discoveryData, signal) => {
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
});
