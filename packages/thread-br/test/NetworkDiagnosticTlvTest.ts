/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { NetworkDiagnosticTlv } from "../src/tlv/NetworkDiagnosticTlv.js";
import { NetworkDiagTlvType } from "../src/tlv/networkDiagTlvTypes.js";

describe("NetworkDiagnosticTlv", () => {
    it("decodes a contiguous stream of short TLVs", () => {
        // Type 0 (ExtMacAddress) length 8 + Type 1 (Address16) length 2.
        const blob = Bytes.of(Bytes.fromHex("00080011223344556677010268a0"));
        const entries = NetworkDiagnosticTlv.decode(blob);
        expect(entries).to.have.lengthOf(2);
        expect(entries[0].type).to.equal(NetworkDiagTlvType.EXT_MAC_ADDRESS);
        expect(entries[0].value).to.deep.equal(Bytes.of(Bytes.fromHex("0011223344556677")));
        expect(entries[1].type).to.equal(NetworkDiagTlvType.ADDRESS16);
        expect(entries[1].value).to.deep.equal(Bytes.of(Bytes.fromHex("68a0")));
    });

    it("round-trips the default-set TLVs as opaque entries", () => {
        const entries = [
            { type: NetworkDiagTlvType.EXT_MAC_ADDRESS, value: Bytes.of(Bytes.fromHex("a1b2c3d4e5f60718")) },
            { type: NetworkDiagTlvType.ADDRESS16, value: Bytes.of(Bytes.fromHex("0000")) },
            { type: NetworkDiagTlvType.MODE, value: Bytes.of(Bytes.fromHex("0f")) },
            { type: NetworkDiagTlvType.LEADER_DATA, value: Bytes.of(Bytes.fromHex("0000000164020100")) },
        ];
        const encoded = NetworkDiagnosticTlv.encode(entries);
        const decoded = NetworkDiagnosticTlv.decode(encoded);
        expect(decoded).to.deep.equal(entries);
    });

    it("uses the extended-length escape for values >= 254 bytes", () => {
        const value = new Uint8Array(300);
        for (let i = 0; i < value.length; i++) value[i] = (i * 3) & 0xff;
        const encoded = NetworkDiagnosticTlv.encode([{ type: NetworkDiagTlvType.IPV6_ADDRESS_LIST, value }]);

        // Header is type:1 + 0xFF:1 + length:2 = 4 bytes, plus the value.
        expect(encoded.length).to.equal(4 + value.length);
        expect(encoded[1]).to.equal(0xff);

        const decoded = NetworkDiagnosticTlv.decode(encoded);
        expect(decoded).to.have.lengthOf(1);
        expect(decoded[0].value).to.deep.equal(value);
    });

    it("preserves unknown TLV types as raw entries", () => {
        // Use a numeric value that we have NOT registered (240) — survives round-trip.
        const entries = [
            { type: 240, value: Bytes.of(Bytes.fromHex("deadbeef")) },
            { type: NetworkDiagTlvType.VERSION, value: Bytes.of(Bytes.fromHex("0004")) },
        ];
        const encoded = NetworkDiagnosticTlv.encode(entries);
        const decoded = NetworkDiagnosticTlv.decode(encoded);
        expect(decoded).to.deep.equal(entries);
    });

    it("returns an empty array for empty input", () => {
        expect(NetworkDiagnosticTlv.decode(new Uint8Array())).to.deep.equal([]);
    });

    it("encodes an empty entry list to empty bytes", () => {
        expect(NetworkDiagnosticTlv.encode([])).to.deep.equal(new Uint8Array());
    });
});
