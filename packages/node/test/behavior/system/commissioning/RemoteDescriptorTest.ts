/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import { CommissionableDevice } from "@matter/protocol";
import { ServerAddressUdp } from "@matter/general";

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
});
