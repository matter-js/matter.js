/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipv4ToBytes, ipv4ToNumber, ipv6BytesToString, ipv6ToArray, ipv6ToBytes, onSameNetwork } from "#util/Ip.js";

describe("IP", () => {
    describe("iPv4ToNumber", () => {
        it("converts an IPv4 address to a number", () => {
            const result = ipv4ToNumber("192.168.200.250");

            expect(result).equal(0xc0a8c8fa);
        });
    });

    describe("iPv4ToArray", () => {
        it("converts an IPv4 address to an Uint8 array", () => {
            const result = ipv4ToBytes("192.168.200.250");

            expect(result).deep.equal(Uint8Array.of(192, 168, 200, 250));
        });
    });

    describe("iPv6ToArray", () => {
        it("converts an IPv6 address to an Uint16 array", () => {
            const result = ipv6ToArray("fe80::e777:4f5e:c61e:7314");

            expect(result).deep.equal(Uint16Array.of(0xfe80, 0, 0, 0, 0xe777, 0x4f5e, 0xc61e, 0x7314));
        });

        it("converts ::1 to an Uint16 array", () => {
            const result = ipv6ToArray("::1");

            expect(result).deep.equal(Uint16Array.of(0, 0, 0, 0, 0, 0, 0, 1));
        });

        it("converts ffff:: to an Uint16 array", () => {
            const result = ipv6ToArray("ffff::");

            expect(result).deep.equal(Uint16Array.of(0xffff, 0, 0, 0, 0, 0, 0, 0));
        });
    });

    describe("iPv6ToByteArray", () => {
        it("converts an IPv6 address to a ByteArray", () => {
            const result = ipv6ToBytes("fe80::e777:4f5e:c61e:7314");

            expect(result).deep.equal(
                Uint8Array.of(0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0xe7, 0x77, 0x4f, 0x5e, 0xc6, 0x1e, 0x73, 0x14),
            );
        });
    });

    describe("iPv6BytesToString", () => {
        it("converts an IPv6 address to a string", () => {
            const result = ipv6BytesToString(
                Uint8Array.of(0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0xe7, 0x77, 0x4f, 0x5e, 0xc6, 0x1e, 0x73, 0x14),
            );

            expect(result).equal("fe80::e777:4f5e:c61e:7314");
        });

        it("converts an address with all zeros (::)", () => {
            const result = ipv6BytesToString(Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
            expect(result).equal("::");
        });

        it("converts an address with leading zeros", () => {
            const result = ipv6BytesToString(Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1));
            expect(result).equal("::1");
        });

        it("converts an address with trailing zeros", () => {
            const result = ipv6BytesToString(Uint8Array.of(0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
            expect(result).equal("ffff::");
        });

        it("throws an error on wrong length", () => {
            expect(() => ipv6BytesToString(Uint8Array.of(0, 1, 2))).to.throw("IPv6 address must be 16 bytes");
        });

        it("converts an address without compressed zeros", () => {
            const result = ipv6BytesToString(
                Uint8Array.of(
                    0x20,
                    0x01,
                    0x0d,
                    0xb8,
                    0x85,
                    0xa3,
                    0x00,
                    0x01,
                    0x00,
                    0x00,
                    0x8a,
                    0x2e,
                    0x03,
                    0x70,
                    0x73,
                    0x34,
                ),
            );
            expect(result).equal("2001:db8:85a3:1:0:8a2e:370:7334");
        });
    });

    describe("onSameNetwork", () => {
        it("returns true if two IPv4 addresses are on the same network", () => {
            const result = onSameNetwork("192.168.200.250", "192.168.200.1", "255.255.255.0");

            expect(result).equal(true);
        });

        it("returns false if two IPv4 addresses are not on the same network", () => {
            const result = onSameNetwork("192.168.200.250", "192.1.1.1", "255.255.255.0");

            expect(result).equal(false);
        });

        it("returns true if two IPv6 addresses are on the same network", () => {
            const result = onSameNetwork("fe80::e777:4f5e:c61e:7314", "fe80::e777:4f5e:1:1", "ffff:ffff:ffff:ffff::");

            expect(result).equal(true);
        });

        it("returns false if two IPv6 addresses are not on the same network", () => {
            const result = onSameNetwork("fe80::e777:4f5e:c61e:7314", "fe80:1::4f5e:1:1", "ffff:ffff:ffff:ffff::");

            expect(result).equal(false);
        });
    });
});
