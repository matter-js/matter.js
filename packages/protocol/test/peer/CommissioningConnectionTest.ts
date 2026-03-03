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

        const connection = new CommissioningConnection({
            devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")])],
            timeout: Seconds(2),
            discoveredDevices: async () => [],
            establishSession: async (address, discoveryData) => {
                attempts.push(`${discoveryData.deviceIdentifier}:${(address as ServerAddressUdp).ip}`);
                if (discoveryData.deviceIdentifier === "a") {
                    throw new UnexpectedDataError("invalid credentials");
                }
                return {} as any;
            },
        });

        const { discoveryData } = await connection.connect();
        expect(discoveryData.deviceIdentifier).equals("b");
        expect(attempts).deep.equals(["a:fd00::1", "b:fd00::2"]);
    });

    it("keeps device in play for network errors while addresses remain", async () => {
        const attempts = new Array<string>();

        const connection = new CommissioningConnection({
            devices: [device("a", [udp("fd00::1"), udp("fd00::3")]), device("b", [udp("fd00::2")])],
            timeout: Seconds(2),
            discoveredDevices: async () => [],
            establishSession: async (address, discoveryData) => {
                const ip = (address as ServerAddressUdp).ip;
                attempts.push(`${discoveryData.deviceIdentifier}:${ip}`);
                if (ip !== "fd00::3") {
                    throw new NoResponseTimeoutError("temporary network error");
                }
                return {} as any;
            },
        });

        const { discoveryData } = await connection.connect();
        expect(discoveryData.deviceIdentifier).equals("a");
        expect(attempts).deep.equals(["a:fd00::1", "b:fd00::2", "a:fd00::3"]);
    });

    it("tries addresses discovered later", async () => {
        const attempts = new Array<string>();
        let discoverCalls = 0;

        const connection = new CommissioningConnection({
            devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")])],
            timeout: Seconds(2),
            discoveredDevices: async () => {
                discoverCalls++;
                return discoverCalls >= 3 ? [device("a", [udp("fd00::3")])] : [];
            },
            establishSession: async (address, discoveryData) => {
                const ip = (address as ServerAddressUdp).ip;
                attempts.push(`${discoveryData.deviceIdentifier}:${ip}`);
                if (ip !== "fd00::3") {
                    throw new NoResponseTimeoutError("temporary network error");
                }
                return {} as any;
            },
        });

        const { discoveryData } = await connection.connect();
        expect(discoveryData.deviceIdentifier).equals("a");
        expect(attempts).deep.equals(["a:fd00::1", "b:fd00::2", "a:fd00::3"]);
    });

    it("does not re-add a previously failed address from rediscovery", async () => {
        const attempts = new Array<string>();
        let discoverCalls = 0;

        const connection = new CommissioningConnection({
            devices: [device("a", [udp("fd00::1")]), device("b", [udp("fd00::2")])],
            timeout: Seconds(2),
            discoveredDevices: async () => {
                discoverCalls++;
                if (discoverCalls >= 3) {
                    return [device("a", [udp("fd00::1"), udp("fd00::3")])];
                }
                return [device("a", [udp("fd00::1")])];
            },
            establishSession: async (address, discoveryData) => {
                const ip = (address as ServerAddressUdp).ip;
                attempts.push(`${discoveryData.deviceIdentifier}:${ip}`);
                if (ip !== "fd00::3") {
                    throw new NoResponseTimeoutError("temporary network error");
                }
                return {} as any;
            },
        });

        const { discoveryData } = await connection.connect();
        expect(discoveryData.deviceIdentifier).equals("a");
        expect(attempts).deep.equals(["a:fd00::1", "b:fd00::2", "a:fd00::3"]);
    });

    it("does not re-add a device rejected for invalid credentials", async () => {
        const attempts = new Array<string>();

        const connection = new CommissioningConnection({
            devices: [device("a", [udp("fd00::1")])],
            timeout: Millis(300),
            discoveredDevices: async () => [device("a", [udp("fd00::3")])],
            establishSession: async (address, discoveryData) => {
                attempts.push(`${discoveryData.deviceIdentifier}:${(address as ServerAddressUdp).ip}`);
                throw new UnexpectedDataError("invalid credentials");
            },
        });

        await expect(connection.connect()).rejectedWith(PairRetransmissionLimitReachedError);
        expect(attempts.length).equals(1);
        expect(attempts[0].startsWith("a:fd00::")).equals(true);
    });

    it("waits for later devices when current candidate pool becomes empty", async () => {
        const attempts = new Array<string>();
        let discoverCalls = 0;

        const connection = new CommissioningConnection({
            devices: [device("a", [udp("fd00::1")])],
            timeout: Seconds(2),
            discoveredDevices: async () => {
                discoverCalls++;
                return discoverCalls >= 3 ? [device("c", [udp("fd00::9")])] : [];
            },
            establishSession: async (address, discoveryData) => {
                const ip = (address as ServerAddressUdp).ip;
                attempts.push(`${discoveryData.deviceIdentifier}:${ip}`);
                if (discoveryData.deviceIdentifier === "a") {
                    throw new NoResponseTimeoutError("temporary network error");
                }
                return {} as any;
            },
        });

        const { discoveryData } = await connection.connect();
        expect(discoveryData.deviceIdentifier).equals("c");
        expect(attempts).deep.equals(["a:fd00::1", "c:fd00::9"]);
    });
});
