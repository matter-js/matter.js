/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableDevice } from "#common/Scanner.js";
import { CommissioningConnectionPool } from "#peer/CommissioningConnectionPool.js";
import { ServerAddressUdp } from "@matter/general";

function udp(ip: string, port = 5540): ServerAddressUdp {
    return { type: "udp", ip, port };
}

function device(id: string, addresses: ServerAddressUdp[]): CommissionableDevice {
    return { deviceIdentifier: id, addresses, D: 1000, CM: 1 };
}

describe("CommissioningConnectionPool", () => {
    it("returns all (device, address) candidates", () => {
        const pool = new CommissioningConnectionPool([device("a", [udp("fd00::1"), udp("fd00::2")])]);

        const candidates = pool.availableCandidates();
        expect(candidates).lengthOf(2);
        expect(candidates.map(c => (c.address as ServerAddressUdp).ip).sort()).deep.equals(["fd00::1", "fd00::2"]);
    });

    it("excludes in-flight attempt keys", () => {
        const pool = new CommissioningConnectionPool([device("a", [udp("fd00::1"), udp("fd00::2")])]);

        const all = pool.availableCandidates();
        const inFlight = new Set([all[0].attemptKey]);

        const remaining = pool.availableCandidates(inFlight);
        expect(remaining).lengthOf(1);
        expect((remaining[0].address as ServerAddressUdp).ip).equals("fd00::2");
    });

    it("markInvalidCredentials removes device and suppresses future addDevices", () => {
        const pool = new CommissioningConnectionPool([device("a", [udp("fd00::1")])]);

        pool.markInvalidCredentials("a");

        // Device is gone
        expect(pool.availableCandidates()).lengthOf(0);

        // Re-adding device "a" must be suppressed
        pool.addDevices([device("a", [udp("fd00::2")])]);
        expect(pool.availableCandidates()).lengthOf(0);
    });

    it("addDevices replaces addresses from new discovery cycle", () => {
        const pool = new CommissioningConnectionPool([device("a", [udp("fd00::1")])]);
        expect(pool.availableCandidates()).lengthOf(1);

        // New cycle: fd00::1 is gone, fd00::2 appears
        pool.addDevices([device("a", [udp("fd00::2")])]);

        const candidates = pool.availableCandidates();
        expect(candidates).lengthOf(1);
        expect((candidates[0].address as ServerAddressUdp).ip).equals("fd00::2");
    });

    it("attemptKey is unique per (device, address) pair", () => {
        const pool = new CommissioningConnectionPool([device("a", [udp("fd00::1")]), device("b", [udp("fd00::1")])]);

        const candidates = pool.availableCandidates();
        expect(candidates).lengthOf(2);

        const keys = candidates.map(c => c.attemptKey);
        expect(new Set(keys).size).equals(2);
    });

    it("merges addresses for the same device when called multiple times with same batch", () => {
        // Two scanner entries for the same device in one addDevices call (e.g., two interfaces)
        const pool = new CommissioningConnectionPool([device("a", [udp("fd00::1")]), device("a", [udp("fd00::2")])]);

        const candidates = pool.availableCandidates();
        expect(candidates.map(c => (c.address as ServerAddressUdp).ip).sort()).deep.equals(["fd00::1", "fd00::2"]);
    });
});
