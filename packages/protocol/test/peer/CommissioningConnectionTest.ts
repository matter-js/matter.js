/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableDevice } from "#common/Scanner.js";
import { CommissioningConnection } from "#peer/CommissioningConnection.js";
import { PairRetransmissionLimitReachedError } from "#peer/ControllerDiscovery.js";
import { Millis, NoResponseTimeoutError, Seconds, ServerAddressUdp, UnexpectedDataError } from "@matter/general";

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
                timeout: Millis(5),
                establishSession: async () => {
                    // Delay much longer than the timeout so the abort fires before we return.
                    await new Promise<void>(resolve => setTimeout(resolve, 100));
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

    it("passes abort signal to establishSession and aborts early when timeout fires", async () => {
        let receivedSignal: AbortSignal | undefined;

        await expect(
            CommissioningConnection({
                devices: [device("a", [udp("fd00::1")])],
                timeout: Millis(5),
                establishSession: async (_address, _discoveryData, signal) => {
                    receivedSignal = signal;
                    // Simulate abort-aware establishment that respects the signal
                    await new Promise<void>((resolve, reject) => {
                        const timer = setTimeout(resolve, 100);
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
