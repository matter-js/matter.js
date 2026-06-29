/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { UdpEncapsulationTlv } from "../src/tlv/meshcop/UdpEncapsulationTlv.js";

describe("UdpEncapsulationTlv", () => {
    it("encodes source/dest ports big-endian followed by payload", () => {
        const payload = new Uint8Array([0xaa, 0xbb, 0xcc]);
        const out = UdpEncapsulationTlv.encode({ sourcePort: 0xc000, destinationPort: 61631, payload });
        expect(out).to.deep.equal(new Uint8Array([0xc0, 0x00, 0xf0, 0xbf, 0xaa, 0xbb, 0xcc]));
    });

    it("round-trips through decode", () => {
        const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
        const decoded = UdpEncapsulationTlv.decode(
            UdpEncapsulationTlv.encode({ sourcePort: 49152, destinationPort: 61631, payload }),
        );
        expect(decoded.sourcePort).to.equal(49152);
        expect(decoded.destinationPort).to.equal(61631);
        expect(decoded.payload).to.deep.equal(payload);
    });

    it("supports an empty payload", () => {
        const decoded = UdpEncapsulationTlv.decode(
            UdpEncapsulationTlv.encode({ sourcePort: 1, destinationPort: 2, payload: new Uint8Array() }),
        );
        expect(decoded.payload).to.have.length(0);
    });

    it("throws on a value shorter than the 4-byte port header", () => {
        expect(() => UdpEncapsulationTlv.decode(new Uint8Array([0x00, 0x01, 0x02]))).to.throw("at least 4 bytes");
    });

    it("throws on out-of-range ports", () => {
        expect(() =>
            UdpEncapsulationTlv.encode({ sourcePort: 0x10000, destinationPort: 1, payload: new Uint8Array() }),
        ).to.throw("sourcePort");
        expect(() =>
            UdpEncapsulationTlv.encode({ sourcePort: 1, destinationPort: -1, payload: new Uint8Array() }),
        ).to.throw("destinationPort");
    });
});
