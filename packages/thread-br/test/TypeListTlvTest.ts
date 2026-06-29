/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkDiagnosticTlv } from "../src/tlv/NetworkDiagnosticTlv.js";
import { NetworkDiagTlvType } from "../src/tlv/networkDiagTlvTypes.js";
import { TypeListTlv } from "../src/tlv/TypeListTlv.js";

describe("TypeListTlv", () => {
    it("round-trips a list of requested TLV types", () => {
        const types = [0, 1, 5, 16, 24];
        expect(TypeListTlv.decode(TypeListTlv.encode(types))).to.deep.equal(types);
    });

    it("encodes an empty list to an empty value", () => {
        expect(TypeListTlv.encode([])).to.deep.equal(new Uint8Array());
        expect(TypeListTlv.decode(new Uint8Array())).to.deep.equal([]);
    });

    it("encodes a single requested type", () => {
        expect(TypeListTlv.encode([NetworkDiagTlvType.EXT_MAC_ADDRESS])).to.deep.equal(new Uint8Array([0]));
    });

    it("supports the maximum 256 distinct type bytes", () => {
        const types = new Array<number>();
        for (let i = 0; i < 256; i++) types.push(i);
        const encoded = TypeListTlv.encode(types);
        expect(encoded.length).to.equal(256);
        expect(TypeListTlv.decode(encoded)).to.deep.equal(types);
    });

    it("rejects entries outside the 0..255 range", () => {
        expect(() => TypeListTlv.encode([-1])).to.throw(/range/);
        expect(() => TypeListTlv.encode([256])).to.throw(/range/);
    });

    it("composes correctly with the outer NetworkDiagnosticTlv frame", () => {
        const types = [0, 5];
        const outer = NetworkDiagnosticTlv.encode([
            { type: NetworkDiagTlvType.TYPE_LIST, value: TypeListTlv.encode(types) },
        ]);
        // Outer header: type=18, length=2, then [0x00, 0x05].
        expect(outer).to.deep.equal(new Uint8Array([18, 2, 0, 5]));

        const decoded = NetworkDiagnosticTlv.decode(outer);
        expect(decoded).to.have.lengthOf(1);
        expect(decoded[0].type).to.equal(NetworkDiagTlvType.TYPE_LIST);
        expect(TypeListTlv.decode(decoded[0].value)).to.deep.equal(types);
    });
});
