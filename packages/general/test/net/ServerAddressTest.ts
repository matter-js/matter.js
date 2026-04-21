/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerAddress } from "#net/ServerAddress.js";

describe("ServerAddress", () => {
    describe("selectionPreferenceOf", () => {
        const udp = (ip: string) => ({ type: "udp" as const, ip, port: 5540 });

        it("classifies fe80::/10 addresses as IPV6_LINK_LOCAL", () => {
            expect(ServerAddress.selectionPreferenceOf(udp("fe80::1"))).to.equal(
                ServerAddress.SelectionPreference.IPV6_LINK_LOCAL,
            );
            expect(ServerAddress.selectionPreferenceOf(udp("fe90::1"))).to.equal(
                ServerAddress.SelectionPreference.IPV6_LINK_LOCAL,
            );
            expect(ServerAddress.selectionPreferenceOf(udp("feaf::1"))).to.equal(
                ServerAddress.SelectionPreference.IPV6_LINK_LOCAL,
            );
            expect(ServerAddress.selectionPreferenceOf(udp("febf::1"))).to.equal(
                ServerAddress.SelectionPreference.IPV6_LINK_LOCAL,
            );
        });

        it("classifies ULA, generic IPv6, and IPv4", () => {
            expect(ServerAddress.selectionPreferenceOf(udp("fd29::1"))).to.equal(
                ServerAddress.SelectionPreference.IPV6_ULA,
            );
            expect(ServerAddress.selectionPreferenceOf(udp("2001:db8::1"))).to.equal(
                ServerAddress.SelectionPreference.IPV6,
            );
            expect(ServerAddress.selectionPreferenceOf(udp("192.0.2.1"))).to.equal(
                ServerAddress.SelectionPreference.IPV4,
            );
        });

        it("does not mistake fec0 (deprecated site-local) for link-local", () => {
            expect(ServerAddress.selectionPreferenceOf(udp("fec0::1"))).to.equal(
                ServerAddress.SelectionPreference.IPV6,
            );
        });
    });

    describe("isIpv6LinkLocal", () => {
        it("matches the full fe80::/10 range", () => {
            expect(ServerAddress.isIpv6LinkLocal("fe80::1")).to.equal(true);
            expect(ServerAddress.isIpv6LinkLocal("fe9f::1")).to.equal(true);
            expect(ServerAddress.isIpv6LinkLocal("fea0::1")).to.equal(true);
            expect(ServerAddress.isIpv6LinkLocal("febf::1")).to.equal(true);
        });

        it("rejects addresses outside fe80::/10", () => {
            expect(ServerAddress.isIpv6LinkLocal("fec0::1")).to.equal(false);
            expect(ServerAddress.isIpv6LinkLocal("fd00::1")).to.equal(false);
            expect(ServerAddress.isIpv6LinkLocal("2001:db8::1")).to.equal(false);
            expect(ServerAddress.isIpv6LinkLocal("192.0.2.1")).to.equal(false);
            expect(ServerAddress.isIpv6LinkLocal("")).to.equal(false);
            expect(ServerAddress.isIpv6LinkLocal("fe")).to.equal(false);
        });
    });
});
