/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import { CoapError, CoapMessage } from "../src/coap/CoapMessage.js";

describe("CoapMessage", () => {
    describe("raw wire vectors (byte-for-byte vs coap-packet reference)", () => {
        const vectors: Array<{ name: string; msg: CoapMessage; hex: string }> = [
            {
                name: "CON 0.02 with path and payload",
                msg: {
                    type: "CON",
                    code: "0.02",
                    messageId: 0x1234,
                    token: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
                    uriPath: ["c", "cp"],
                    payload: new Uint8Array([0x0a, 0x02, 0x68, 0x69]),
                },
                hex: "44021234deadbeefb163026370ff0a026869",
            },
            {
                name: "NON 0.02 no path, empty payload",
                msg: {
                    type: "NON",
                    code: "0.02",
                    messageId: 0x0001,
                    token: new Uint8Array([0x01, 0x02]),
                    payload: new Uint8Array(),
                },
                hex: "520200010102",
            },
            {
                name: "ACK 2.04 no path with payload",
                msg: {
                    type: "ACK",
                    code: "2.04",
                    messageId: 0x2222,
                    token: new Uint8Array([0x11, 0x22, 0x33, 0x44]),
                    payload: new Uint8Array([0x10, 0x01, 0x01]),
                },
                hex: "6444222211223344ff100101",
            },
            {
                name: "CON 0.02 path c/ka with payload",
                msg: {
                    type: "CON",
                    code: "0.02",
                    messageId: 0x3333,
                    token: new Uint8Array([0xaa, 0xbb]),
                    uriPath: ["c", "ka"],
                    payload: new Uint8Array([0x0b, 0x02, 0x00, 0x01]),
                },
                hex: "42023333aabbb163026b61ff0b020001",
            },
        ];

        for (const { name, msg, hex } of vectors) {
            it(`encodes ${name} to exact bytes`, () => {
                expect(Bytes.toHex(CoapMessage.encode(msg))).to.equal(hex);
            });

            it(`decodes ${name} back to the message`, () => {
                const decoded = CoapMessage.decode(Bytes.of(Bytes.fromHex(hex)));
                expect(decoded.type).to.equal(msg.type);
                expect(decoded.code).to.equal(msg.code);
                expect(decoded.messageId).to.equal(msg.messageId);
                expect(decoded.token).to.deep.equal(msg.token);
                expect(decoded.uriPath).to.deep.equal(msg.uriPath);
                expect(decoded.payload).to.deep.equal(msg.payload);
            });
        }
    });

    describe("extended option length", () => {
        it("round-trips a Uri-Path segment longer than 12 bytes", () => {
            const segment = "abcdefghijklmnopqrstuvwxyz"; // 26 bytes → extended length nibble 13
            const msg: CoapMessage = {
                type: "CON",
                code: "0.02",
                messageId: 0x0042,
                token: new Uint8Array([0x01]),
                uriPath: [segment],
                payload: new Uint8Array(),
            };
            const encoded = CoapMessage.encode(msg);
            // Option header: delta=11 (nibble 11), len=26 → nibble 13, extended byte = 26-13 = 13.
            const decoded = CoapMessage.decode(encoded);
            expect(decoded.uriPath).to.deep.equal([segment]);
        });
    });

    describe("malformed input", () => {
        it("rejects a truncated message with CoapError", () => {
            expect(() => CoapMessage.decode(new Uint8Array([0x44, 0x02]))).to.throw(CoapError);
        });

        it("rejects a payload marker with no payload", () => {
            // CON, code 0.02, msgId 0, empty token, then 0xFF with nothing after.
            expect(() => CoapMessage.decode(new Uint8Array([0x40, 0x02, 0x00, 0x00, 0xff]))).to.throw(CoapError);
        });
    });

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
