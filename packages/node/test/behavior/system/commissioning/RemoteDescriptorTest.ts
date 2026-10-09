/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import { Hours, Millis, ServerAddressUdp } from "@matter/general";
import { CommissionableDevice } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";

function udp(ip: string, port = 5540): ServerAddressUdp {
    return { type: "udp", ip, port };
}

describe("RemoteDescriptor", () => {
    describe("toLongForm / fromLongForm roundtrip", () => {
        it("preserves addresses", () => {
            const device: CommissionableDevice = {
                deviceIdentifier: "abc",
                addresses: [udp("fd00::1"), udp("fd00::2")],
                D: 1234,
                CM: 1,
            };

            const long = RemoteDescriptor.toLongForm(device);
            const back = RemoteDescriptor.fromLongForm(long);

            // ServerAddress() normalizes addresses (adds optional undefined fields), compare IPs only
            const ips = (back.addresses as ServerAddressUdp[] | undefined)?.map(a => a.ip).sort();
            expect(ips).deep.equals(["fd00::1", "fd00::2"]);
        });

        it("preserves deviceIdentifier", () => {
            const device: CommissionableDevice = {
                deviceIdentifier: "test-device-123",
                addresses: [udp("fd00::1")],
                D: 100,
                CM: 1,
            };

            const long = RemoteDescriptor.toLongForm(device);
            const back = RemoteDescriptor.fromLongForm(long);

            expect(back.deviceIdentifier).equals("test-device-123");
        });

        it("preserves hostname", () => {
            const device: CommissionableDevice = {
                deviceIdentifier: "d",
                hostname: "0011223344550000",
                addresses: [udp("fd00::1")],
                D: 100,
                CM: 1,
            };

            const long = RemoteDescriptor.toLongForm(device);
            const back = RemoteDescriptor.fromLongForm(long);

            expect(long.hostname).equals("0011223344550000");
            expect(back.hostname).equals("0011223344550000");
        });

        it("clears a hostname the device no longer names, rather than keeping the last one", () => {
            const long = RemoteDescriptor.toLongForm({
                deviceIdentifier: "d",
                hostname: "0011223344550000",
                addresses: [udp("fd00::1")],
                D: 100,
                CM: 1,
            });

            // A device whose SRV expired reports no host, and a host nothing has answered on must not
            // stay on record
            RemoteDescriptor.toLongForm(
                { deviceIdentifier: "d", hostname: undefined, addresses: [udp("fd00::1")], D: 100, CM: 1 },
                long,
            );

            expect(long.hostname).equals(undefined);
        });

        it("leaves a known host alone for a caller that carries no host at all", () => {
            const long = RemoteDescriptor.toLongForm({
                deviceIdentifier: "d",
                hostname: "0011223344550000",
                addresses: [udp("fd00::1")],
                D: 100,
                CM: 1,
            });

            // Half of toLongForm's callers pass a bare DiscoveryData, which cannot name a host; erasing
            // on their behalf would drop what discovery stored
            RemoteDescriptor.toLongForm({ DN: "a device" }, long);

            expect(long.hostname).equals("0011223344550000");
        });

        it("preserves discriminator (D field)", () => {
            const device: CommissionableDevice = {
                deviceIdentifier: "d",
                addresses: [udp("fd00::1")],
                D: 3840,
                CM: 2,
            };

            const long = RemoteDescriptor.toLongForm(device);
            const back = RemoteDescriptor.fromLongForm(long) as CommissionableDevice;

            expect(back.D).equals(3840);
            expect(back.CM).equals(2);
        });

        it("preserves vendor/product from VP field", () => {
            const device: CommissionableDevice = {
                deviceIdentifier: "vp",
                addresses: [udp("fd00::1")],
                D: 0,
                CM: 1,
                VP: "4631+24576",
            };

            const long = RemoteDescriptor.toLongForm(device);
            const back = RemoteDescriptor.fromLongForm(long) as CommissionableDevice;

            expect(back.VP).equals("4631+24576");
        });

        it("returns empty object for all-undefined input", () => {
            const back = RemoteDescriptor.fromLongForm({});
            expect(back).deep.equals({});
        });

        it("minimal CommissionableDevice with only required fields roundtrips correctly", () => {
            // Regression: fromLongForm should not return {} for a device with
            // only addresses and discriminator (no optional fields).
            const device: CommissionableDevice = {
                deviceIdentifier: "minimal",
                addresses: [udp("10.0.0.1", 5540)],
                D: 1000,
                CM: 1,
            };

            const long = RemoteDescriptor.toLongForm(device);

            // Must have populated addresses and deviceIdentifier
            expect(long.addresses).deep.equals(device.addresses);
            expect(long.deviceIdentifier).equals("minimal");
            expect(long.discriminator).equals(1000);
            expect(long.commissioningMode).equals(1);

            const back = RemoteDescriptor.fromLongForm(long) as CommissionableDevice;
            // ServerAddress() normalizes addresses, so compare ip/port/type only
            expect((back.addresses as ServerAddressUdp[] | undefined)?.map(a => a.ip)).deep.equals(["10.0.0.1"]);
            expect(back.deviceIdentifier).equals("minimal");
            expect(back.D).equals(1000);
            expect(back.CM).equals(1);
        });
    });

    describe("session intervals", () => {
        it("stores advertised intervals apart from the session parameters", () => {
            const long: RemoteDescriptor.Long = {
                peerAddress: { fabricIndex: FabricIndex(1), nodeId: NodeId(1) },
                sessionParameters: {
                    idleInterval: Hours(2),
                    activeInterval: Millis(400),
                    activeThreshold: Millis(5000),
                },
            };

            RemoteDescriptor.toLongForm({ SII: Millis(500), SAI: Millis(300), SAT: Millis(4000) }, long);

            expect(long.advertisedIntervals).deep.equals({
                idleInterval: Millis(500),
                activeInterval: Millis(300),
                activeThreshold: Millis(4000),
            });
            expect(long.sessionParameters).deep.equals({
                idleInterval: Hours(2),
                activeInterval: Millis(400),
                activeThreshold: Millis(5000),
            });
        });

        it("reports only advertised intervals as SII/SAI/SAT", () => {
            const dd = RemoteDescriptor.fromLongForm({
                sessionParameters: {
                    idleInterval: Hours(2),
                    activeInterval: Millis(400),
                    activeThreshold: Millis(5000),
                },
                advertisedIntervals: { idleInterval: Millis(500) },
            });

            expect(dd).deep.include({ SII: Millis(500) });
            expect(dd.SAI).undefined;
            expect(dd.SAT).undefined;
        });

        it("clears advertised intervals a node no longer advertises", () => {
            const long = RemoteDescriptor.toLongForm({ SII: Millis(500), SAI: Millis(300), SAT: Millis(4000) });

            RemoteDescriptor.toLongForm({}, long);

            expect(long.advertisedIntervals).undefined;
        });
    });
});
