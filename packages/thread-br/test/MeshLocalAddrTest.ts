/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ALL_THREAD_NODES_REALM_LOCAL,
    ALL_THREAD_ROUTERS_REALM_LOCAL,
    deriveMeshLocalAddress,
    formatIp6,
} from "../src/util/meshLocalAddr.js";

describe("meshLocalAddr", () => {
    const mlPrefix = new Uint8Array([0xfd, 0xda, 0x3f, 0xb0, 0x2c, 0x67, 0x00, 0x00]);

    it("derives a mesh-local address from prefix + rloc16", () => {
        const addr = deriveMeshLocalAddress(mlPrefix, 0x7400);
        expect(addr).to.deep.equal(
            new Uint8Array([
                0xfd, 0xda, 0x3f, 0xb0, 0x2c, 0x67, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfe, 0x00, 0x74, 0x00,
            ]),
        );
    });

    it("places the rloc16 big-endian in the low two bytes", () => {
        const addr = deriveMeshLocalAddress(mlPrefix, 0x0401);
        expect(addr[14]).to.equal(0x04);
        expect(addr[15]).to.equal(0x01);
    });

    it("throws on a bad prefix length or out-of-range rloc16", () => {
        expect(() => deriveMeshLocalAddress(new Uint8Array(7), 0)).to.throw("8 bytes");
        expect(() => deriveMeshLocalAddress(mlPrefix, 0x10000)).to.throw("out of range");
    });

    it("exposes the realm-local multicast groups", () => {
        expect(formatIp6(ALL_THREAD_NODES_REALM_LOCAL)).to.equal("ff03:0:0:0:0:0:0:1");
        expect(formatIp6(ALL_THREAD_ROUTERS_REALM_LOCAL)).to.equal("ff03:0:0:0:0:0:0:2");
    });

    it("formats an address as trimmed hextets", () => {
        expect(formatIp6(deriveMeshLocalAddress(mlPrefix, 0x7400))).to.equal("fdda:3fb0:2c67:0:0:ff:fe00:7400");
    });
});
