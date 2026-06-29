/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { LeadKa } from "../src/commissioner/LeadKa.js";
import { MeshCopTlvType } from "../src/dataset/meshcopTlvTypes.js";
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";

function buildStateResponse(state: number): Uint8Array {
    return BasicTlv.encode([{ type: MeshCopTlvType.STATE, value: new Uint8Array([state]) }]);
}

describe("LeadKa", () => {
    describe("buildRequest", () => {
        it("encodes State(accept) then the session ID as a 2-byte BE TLV", () => {
            const payload = LeadKa.buildRequest(0x0007);
            const entries = BasicTlv.walk(payload);
            expect(entries).to.have.lengthOf(2);
            expect(entries[0].type).to.equal(MeshCopTlvType.STATE);
            expect(entries[0].value).to.deep.equal(new Uint8Array([0x01]));
            expect(entries[1].type).to.equal(MeshCopTlvType.COMMISSIONER_SESSION_ID);
            expect(entries[1].value).to.deep.equal(new Uint8Array([0x00, 0x07]));
        });

        it("encodes max uint16 session ID correctly", () => {
            const payload = LeadKa.buildRequest(0xffff);
            const entries = BasicTlv.walk(payload);
            expect(entries[1].value).to.deep.equal(new Uint8Array([0xff, 0xff]));
        });

        it("round-trips session ID 0 (edge case)", () => {
            const payload = LeadKa.buildRequest(0);
            const entries = BasicTlv.walk(payload);
            expect(entries[1].value).to.deep.equal(new Uint8Array([0x00, 0x00]));
        });
    });

    describe("parseResponse", () => {
        it("parses accept state", () => {
            const result = LeadKa.parseResponse(buildStateResponse(1));
            expect(result.state).to.equal("accept");
        });

        it("parses reject state", () => {
            const result = LeadKa.parseResponse(buildStateResponse(0xff));
            expect(result.state).to.equal("reject");
        });

        it("parses pending state", () => {
            const result = LeadKa.parseResponse(buildStateResponse(0x00));
            expect(result.state).to.equal("pending");
        });

        it("throws on unknown state byte", () => {
            expect(() => LeadKa.parseResponse(buildStateResponse(99))).to.throw(/state/i);
        });

        it("throws when STATE TLV is missing", () => {
            const payload = BasicTlv.encode([
                { type: MeshCopTlvType.COMMISSIONER_SESSION_ID, value: new Uint8Array([0x00, 0x07]) },
            ]);
            expect(() => LeadKa.parseResponse(payload)).to.throw(/STATE/i);
        });
    });

    describe("round-trip", () => {
        it("encodes session ID and can verify it in the raw TLV bytes", () => {
            const sessionId = 1234;
            const payload = LeadKa.buildRequest(sessionId);
            const entries = BasicTlv.walk(payload);
            const decoded = (entries[1].value[0] << 8) | entries[1].value[1];
            expect(decoded).to.equal(sessionId);
        });
    });
});
