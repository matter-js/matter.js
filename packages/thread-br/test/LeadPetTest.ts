/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { LeadPet } from "../src/commissioner/LeadPet.js";
import { MeshCopTlvType } from "../src/dataset/meshcopTlvTypes.js";
import type { BasicTlvEntry } from "../src/tlv/BasicTlvCodec.js";
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";

function buildResponse(state: number, sessionId?: number): Uint8Array {
    const entries = new Array<BasicTlvEntry>();
    entries.push({ type: MeshCopTlvType.STATE, value: new Uint8Array([state]) });
    if (sessionId !== undefined) {
        entries.push({
            type: MeshCopTlvType.COMMISSIONER_SESSION_ID,
            value: new Uint8Array([(sessionId >> 8) & 0xff, sessionId & 0xff]),
        });
    }
    return BasicTlv.encode(entries);
}

describe("LeadPet", () => {
    describe("buildRequest", () => {
        it("encodes the commissioner ID as a TLV", () => {
            const payload = LeadPet.buildRequest("matter-server");
            const entries = BasicTlv.walk(payload);
            expect(entries).to.have.lengthOf(1);
            expect(entries[0].type).to.equal(MeshCopTlvType.COMMISSIONER_ID);
            expect(new TextDecoder().decode(entries[0].value)).to.equal("matter-server");
        });

        it("handles an empty commissioner ID", () => {
            const payload = LeadPet.buildRequest("");
            const entries = BasicTlv.walk(payload);
            expect(entries[0].value.length).to.equal(0);
        });
    });

    describe("parseResponse", () => {
        it("parses accept with session ID", () => {
            const payload = buildResponse(1, 0x0007);
            const result = LeadPet.parseResponse(payload);
            expect(result.state).to.equal("accept");
            expect(result.sessionId).to.equal(7);
        });

        it("parses reject (no session ID)", () => {
            const payload = buildResponse(0xff);
            const result = LeadPet.parseResponse(payload);
            expect(result.state).to.equal("reject");
            expect(result.sessionId).to.be.undefined;
        });

        it("parses pending (no session ID)", () => {
            const payload = buildResponse(0x00);
            const result = LeadPet.parseResponse(payload);
            expect(result.state).to.equal("pending");
            expect(result.sessionId).to.be.undefined;
        });

        it("parses session ID with max uint16 value", () => {
            const payload = buildResponse(1, 0xffff);
            const result = LeadPet.parseResponse(payload);
            expect(result.state).to.equal("accept");
            expect(result.sessionId).to.equal(0xffff);
        });

        it("throws on unknown state byte", () => {
            const payload = buildResponse(99);
            expect(() => LeadPet.parseResponse(payload)).to.throw(/state/i);
        });

        it("throws when STATE TLV is missing", () => {
            const payload = BasicTlv.encode([
                { type: MeshCopTlvType.COMMISSIONER_SESSION_ID, value: new Uint8Array([0x00, 0x07]) },
            ]);
            expect(() => LeadPet.parseResponse(payload)).to.throw(/STATE/i);
        });
    });

    describe("round-trip", () => {
        it("buildRequest then parseResponse round-trips when simulating a server response", () => {
            const reqPayload = LeadPet.buildRequest("matter-server");
            expect(reqPayload.length).to.be.greaterThan(0);

            // Simulate the server responding with Accept + session ID.
            const respPayload = buildResponse(1, 42);
            const result = LeadPet.parseResponse(respPayload);
            expect(result.state).to.equal("accept");
            expect(result.sessionId).to.equal(42);
        });
    });
});
