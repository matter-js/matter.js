/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoapMessage } from "../src/coap/CoapMessage.js";

describe("CoapMessage", () => {
    describe("round-trip", () => {
        it("encodes and decodes a CON POST with path and payload", () => {
            const msg: CoapMessage = {
                type: "CON",
                code: "0.02",
                messageId: 0x1234,
                token: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
                uriPath: ["c", "cp"],
                payload: new Uint8Array([0x0a, 0x02, 0x68, 0x69]),
            };
            const encoded = CoapMessage.encode(msg);
            const decoded = CoapMessage.decode(encoded);

            expect(decoded.type).to.equal("CON");
            expect(decoded.code).to.equal("0.02");
            expect(decoded.messageId).to.equal(0x1234);
            expect(decoded.token).to.deep.equal(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
            expect(decoded.uriPath).to.deep.equal(["c", "cp"]);
            expect(decoded.payload).to.deep.equal(new Uint8Array([0x0a, 0x02, 0x68, 0x69]));
        });

        it("encodes and decodes a NON with no payload and no path", () => {
            const msg: CoapMessage = {
                type: "NON",
                code: "0.01",
                messageId: 0x0001,
                token: new Uint8Array([0x01, 0x02]),
                payload: new Uint8Array(),
            };
            const encoded = CoapMessage.encode(msg);
            const decoded = CoapMessage.decode(encoded);

            expect(decoded.type).to.equal("NON");
            expect(decoded.code).to.equal("0.01");
            expect(decoded.messageId).to.equal(0x0001);
            expect(decoded.payload).to.deep.equal(new Uint8Array());
            expect(decoded.uriPath).to.be.undefined;
        });

        it("preserves code and token through ACK 2.04 Changed", () => {
            const msg: CoapMessage = {
                type: "ACK",
                code: "2.04",
                messageId: 0xabcd,
                token: new Uint8Array([0x11, 0x22, 0x33, 0x44]),
                payload: new Uint8Array([0x10, 0x01, 0x01]),
            };
            const encoded = CoapMessage.encode(msg);
            const decoded = CoapMessage.decode(encoded);

            expect(decoded.code).to.equal("2.04");
            expect(decoded.token).to.deep.equal(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
        });

        it("round-trips a multi-segment Uri-Path", () => {
            const msg: CoapMessage = {
                type: "CON",
                code: "0.03",
                messageId: 0x5678,
                token: new Uint8Array([0xaa, 0xbb]),
                uriPath: ["c", "ka"],
                payload: new Uint8Array([0x0b, 0x02, 0x00, 0x01]),
            };
            const decoded = CoapMessage.decode(CoapMessage.encode(msg));
            expect(decoded.uriPath).to.deep.equal(["c", "ka"]);
        });
    });
});
