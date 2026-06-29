/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Ipv6AddressList } from "../../src/tlv/diag/Ipv6AddressList.js";

describe("Ipv6AddressList", () => {
    it("decodes a single address", () => {
        const addrHex = "fd11223344550000" + "0000000000000001";
        const list = Ipv6AddressList.decode(Bytes.of(Bytes.fromHex(addrHex)));
        expect(list).to.have.lengthOf(1);
        expect(list[0]).to.deep.equal(Bytes.of(Bytes.fromHex(addrHex)));
    });

    it("decodes a list of three addresses", () => {
        const a1 = "fe800000000000000000000000000001";
        const a2 = "fd00abcd000000000000000000000002";
        const a3 = "ff020000000000000000000000000001";
        const list = Ipv6AddressList.decode(Bytes.of(Bytes.fromHex(a1 + a2 + a3)));
        expect(list).to.have.lengthOf(3);
        expect(list[0]).to.deep.equal(Bytes.of(Bytes.fromHex(a1)));
        expect(list[1]).to.deep.equal(Bytes.of(Bytes.fromHex(a2)));
        expect(list[2]).to.deep.equal(Bytes.of(Bytes.fromHex(a3)));
    });

    it("decodes an empty list", () => {
        expect(Ipv6AddressList.decode(new Uint8Array())).to.deep.equal([]);
    });

    it("round-trips a list", () => {
        const addrs = [
            new Uint8Array(16).fill(0xaa),
            new Uint8Array(16).fill(0xbb),
            Bytes.of(Bytes.fromHex("fe800000000000003a8e0e9d35a1c200")),
        ];
        expect(Ipv6AddressList.decode(Ipv6AddressList.encode(addrs))).to.deep.equal(addrs);
    });

    it("rejects malformed lengths", () => {
        expect(() => Ipv6AddressList.decode(new Uint8Array(15))).to.throw(/16/);
        expect(() => Ipv6AddressList.decode(new Uint8Array(17))).to.throw(/16/);
    });

    it("rejects encode inputs that are not 16 bytes", () => {
        expect(() => Ipv6AddressList.encode([new Uint8Array(8)])).to.throw(/16 bytes/);
    });
});
