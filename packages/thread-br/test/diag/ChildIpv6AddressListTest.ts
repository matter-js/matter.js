/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { ChildIpv6AddressList } from "../../src/tlv/diag/ChildIpv6AddressList.js";

describe("ChildIpv6AddressList.decode", () => {
    it("parses rloc16 + 16-byte addresses", () => {
        const rloc = "f401";
        const addr = "fd112233445566770000000000000001";
        const out = ChildIpv6AddressList.decode(Bytes.of(Bytes.fromHex(rloc + addr)));
        expect(out.rloc16).to.equal(0xf401);
        expect(out.addresses).to.have.length(1);
        expect(Bytes.toHex(out.addresses[0])).to.equal(addr);
    });

    it("parses rloc16 with two addresses", () => {
        const rloc = "0c00";
        const a1 = "fe800000000000000000000000000001";
        const a2 = "fd00abcd000000000000000000000002";
        const out = ChildIpv6AddressList.decode(Bytes.of(Bytes.fromHex(rloc + a1 + a2)));
        expect(out.rloc16).to.equal(0x0c00);
        expect(out.addresses).to.have.length(2);
        expect(Bytes.toHex(out.addresses[0])).to.equal(a1);
        expect(Bytes.toHex(out.addresses[1])).to.equal(a2);
    });

    it("parses rloc16 with no addresses", () => {
        const out = ChildIpv6AddressList.decode(Bytes.of(Bytes.fromHex("1234")));
        expect(out.rloc16).to.equal(0x1234);
        expect(out.addresses).to.have.length(0);
    });

    it("degrades gracefully on truncated value (too short for rloc16)", () => {
        const out = ChildIpv6AddressList.decode(new Uint8Array(1));
        expect(out.rloc16).to.equal(0);
        expect(out.addresses).to.have.length(0);
    });

    it("degrades gracefully on partial trailing address bytes", () => {
        const rloc = "f401";
        const partialAddr = "fd112233445566770000000000";
        const out = ChildIpv6AddressList.decode(Bytes.of(Bytes.fromHex(rloc + partialAddr)));
        expect(out.rloc16).to.equal(0xf401);
        expect(out.addresses).to.have.length(0);
    });
});
