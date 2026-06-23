/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import { Hours, Millis, ServerAddressUdp } from "@matter/general";
import { CommissionableDevice } from "@matter/protocol";

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

    describe("session interval cap handling", () => {
        function longWith(idleInterval?: number, activeInterval?: number): RemoteDescriptor.Long {
            return { sessionParameters: { idleInterval, activeInterval } } as RemoteDescriptor.Long;
        }

        it("keeps a higher session-derived interval when the advertisement is at the 1-hour cap", () => {
            const long = longWith(Hours(2), Hours(2));

            RemoteDescriptor.toLongForm({ SII: Hours.one, SAI: Hours.one }, long);

            expect(long.sessionParameters?.idleInterval).equals(Hours(2));
            expect(long.sessionParameters?.activeInterval).equals(Hours(2));
        });

        it("applies an advertised interval below the cap even over a higher value", () => {
            const long = longWith(Hours(2), Hours(2));

            RemoteDescriptor.toLongForm({ SII: Millis(1800000), SAI: Millis(1800000) }, long);

            expect(long.sessionParameters?.idleInterval).equals(Millis(1800000));
            expect(long.sessionParameters?.activeInterval).equals(Millis(1800000));
        });

        it("applies a capped advertisement when no higher value is on record", () => {
            const long = longWith();

            RemoteDescriptor.toLongForm({ SII: Hours.one, SAI: Hours.one }, long);

            expect(long.sessionParameters?.idleInterval).equals(Hours.one);
            expect(long.sessionParameters?.activeInterval).equals(Hours.one);
        });
    });
});
