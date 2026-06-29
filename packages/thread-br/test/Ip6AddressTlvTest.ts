/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ip6AddressTlv } from "../src/tlv/meshcop/Ip6AddressTlv.js";

describe("Ip6AddressTlv", () => {
    const addr = new Uint8Array([
        0xfd, 0xda, 0x3f, 0xb0, 0x2c, 0x67, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfe, 0x00, 0x74, 0x00,
    ]);

    it("round-trips a 16-byte address as a copy", () => {
        const encoded = Ip6AddressTlv.encode(addr);
        expect(encoded).to.deep.equal(addr);
        expect(encoded).to.not.equal(addr);
        expect(Ip6AddressTlv.decode(encoded)).to.deep.equal(addr);
    });

    it("throws when the address is not 16 bytes", () => {
        expect(() => Ip6AddressTlv.encode(new Uint8Array(15))).to.throw("16 bytes");
        expect(() => Ip6AddressTlv.decode(new Uint8Array(17))).to.throw("16 bytes");
    });
});
