/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerAddress } from "#net/ServerAddress.js";
import { ServerAddressSet } from "#net/ServerAddressSet.js";
import { Timestamp } from "#time/Timestamp.js";

const a: ServerAddress = { type: "udp", ip: "1.2.3.4", port: 5540 };
const b: ServerAddress = { type: "udp", ip: "5.6.7.8", port: 5540 };

describe("ServerAddressSet", () => {
    it("tracks distinct addresses", () => {
        const set = ServerAddressSet([a, b]);

        expect(set.size).equal(2);
        expect(set.has(a)).equal(true);
        expect(set.has({ type: "udp", ip: "9.9.9.9", port: 5540 })).equal(false);
    });

    it("returns the existing instance when adding an equal address", () => {
        const set = ServerAddressSet([a]);

        const result = set.add({ type: "udp", ip: "1.2.3.4", port: 5540 });

        expect(result).equal(a);
        expect(set.size).equal(1);
    });

    it("deletes by value", () => {
        const set = ServerAddressSet([a, b]);

        expect(set.delete({ type: "udp", ip: "1.2.3.4", port: 5540 })).equal(true);
        expect(set.size).equal(1);
        expect(set.has(a)).equal(false);
    });

    it("replaces the stored addresses", () => {
        const set = ServerAddressSet([a]);

        set.replace([b]);

        expect(set.size).equal(1);
        expect(set.has(b)).equal(true);
        expect(set.has(a)).equal(false);
    });

    it("iterates all addresses", () => {
        const set = ServerAddressSet([a, b]);

        const ips = [...set].map(address => (ServerAddress.isIp(address) ? address.ip : undefined));

        expect(ips).members(["1.2.3.4", "5.6.7.8"]);
    });

    describe("copyHealth", () => {
        it("copies health markers onto equal targets", () => {
            const target: ServerAddress = { type: "udp", ip: "1.2.3.4", port: 5540 };
            const source: ServerAddress = { type: "udp", ip: "1.2.3.4", port: 5540, healthyAt: Timestamp(1234) };

            const [result] = ServerAddressSet.copyHealth([target], [source]);

            expect(result.healthyAt).equal(1234);
        });
    });
});
