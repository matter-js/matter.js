/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { NetworkData } from "../src/tlv/diag/NetworkData.js";

// Captured from the OTBR REST `/diagnostics` fixture (test/fixtures/otbr-rest/diagnostics.json).
// Top-level Network Data TLV stream (Thread spec §5.13):
//   Commissioning(4) len 4, Prefix(1) len 20, Service(5) len 14,
//   Prefix(1) len 7, Prefix(1) len 19, Service(5) len 25.
const NWD =
    "08040B0207D703140040FD000000000000010702114005047400F3000B0E8001010D09740049000500000E1003070000010374000003130060FD000000000000020000000001037400E00B1981015D0D147400FD000000000000016C84A8550C8A02C1D11F";

describe("NetworkData.decode", () => {
    it("preserves raw bytes (round-trips the input lowercased)", () => {
        const nd = NetworkData.decode(Bytes.of(Bytes.fromHex(NWD)));
        expect(Bytes.toHex(nd.raw)).to.equal(NWD.toLowerCase());
    });

    it("parses the top-level sub-TLV entries", () => {
        const nd = NetworkData.decode(Bytes.of(Bytes.fromHex(NWD)));
        expect(nd.entries).to.have.lengthOf(6);
        // Commissioning(4), Prefix(1), Service(5), Prefix(1), Prefix(1), Service(5)
        expect(nd.entries.map(e => e.type)).to.deep.equal([4, 1, 5, 1, 1, 5]);
    });

    it("parses prefixes with their border-routers and has-routes", () => {
        const nd = NetworkData.decode(Bytes.of(Bytes.fromHex(NWD)));
        expect(nd.prefixes).to.have.lengthOf(3);

        const [p0, p1, p2] = nd.prefixes;

        expect(p0.prefixLength).to.equal(64);
        expect(Bytes.toHex(p0.prefix)).to.equal("fd00000000000001");
        expect(p0.borderRouters).to.have.lengthOf(1);
        expect(p0.borderRouters[0].rloc16).to.equal(0x7400);
        expect(p0.hasRoutes).to.have.lengthOf(0);

        expect(p1.prefixLength).to.equal(0);
        expect(p1.hasRoutes).to.have.lengthOf(1);
        expect(p1.hasRoutes[0].rloc16).to.equal(0x7400);

        expect(p2.prefixLength).to.equal(96);
        expect(Bytes.toHex(p2.prefix)).to.equal("fd0000000000000200000000");
        expect(p2.hasRoutes).to.have.lengthOf(1);
        expect(p2.hasRoutes[0].rloc16).to.equal(0x7400);
    });

    it("parses service entries", () => {
        const nd = NetworkData.decode(Bytes.of(Bytes.fromHex(NWD)));
        expect(nd.services).to.have.lengthOf(2);
        expect(nd.services[0].serviceId).to.equal(0);
        expect(nd.services[0].servers).to.have.lengthOf(1);
        expect(nd.services[0].servers[0].rloc16).to.equal(0x7400);
        expect(nd.services[1].serviceId).to.equal(1);
    });

    it("returns empty structures for an empty Network Data blob", () => {
        const nd = NetworkData.decode(new Uint8Array(0));
        expect(nd.raw).to.have.lengthOf(0);
        expect(nd.entries).to.have.lengthOf(0);
        expect(nd.prefixes).to.have.lengthOf(0);
        expect(nd.services).to.have.lengthOf(0);
    });

    it("preserves raw and does not throw on a truncated top-level TLV", () => {
        // Type byte present, length claims 4 bytes but only 1 follows.
        const truncated = Bytes.of(Bytes.fromHex("0304aa"));
        const nd = NetworkData.decode(truncated);
        expect(Bytes.toHex(nd.raw)).to.equal("0304aa");
        expect(nd.entries).to.have.lengthOf(0);
        expect(nd.prefixes).to.have.lengthOf(0);
    });

    it("keeps the entry list when an inner sub-TLV is malformed", () => {
        // Prefix(1) len 3: domainId=0, prefixLen=0, then a sub-TLV claiming len 4 with 0 bytes.
        const nd = NetworkData.decode(Bytes.of(Bytes.fromHex("0303000004")));
        expect(nd.entries).to.have.lengthOf(1);
        expect(nd.entries[0].type).to.equal(1);
        expect(nd.prefixes).to.have.lengthOf(0);
    });

    it("skips a Server sub-TLV with fewer than 2 bytes (no rloc16:0 ghost entry)", () => {
        // walkTlvs encodes type as typeByte >> 1, so:
        //   Service(5) → typeByte=0x0A, Server(6) → typeByte=0x0C
        // Top-level: [0x0A][len=5][flags=0x80][svcDataLen=0x00][Server sub-TLV: 0x0C 0x01 0x40]
        // The Server sub-TLV value is 1 byte — too short for rloc16. Guard must skip it.
        const nd = NetworkData.decode(Bytes.of(Bytes.fromHex("0A0580000C0140")));
        expect(nd.services).to.have.lengthOf(1);
        expect(nd.services[0].servers).to.have.lengthOf(0);
    });
});
