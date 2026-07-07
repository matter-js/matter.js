/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Observable } from "@matter/general";
import type { DiagnosticResponse } from "../src/diagnostic/DiagnosticResponse.js";
import type { DiagnosticSource, QueryMulticastHandle } from "../src/diagnostic/DiagnosticSource.js";
import { HybridDiagnosticSource } from "../src/diagnostic/HybridDiagnosticSource.js";

const EXT_PAN = Bytes.of(Bytes.fromHex("1122334455667788"));

class FakeSource implements DiagnosticSource {
    unicastCalls = 0;
    multicastCalls = 0;
    resetCalls = 0;
    constructor(
        readonly kind: "meshcop" | "otbr-rest",
        private readonly answers = true,
    ) {}
    canQuery(extPanId: Bytes): boolean {
        return this.answers && Bytes.areEqual(extPanId, EXT_PAN);
    }
    async queryUnicast(): Promise<DiagnosticResponse> {
        this.unicastCalls++;
        return { unknown: [], rloc16: this.kind === "meshcop" ? 0x1000 : 0x2000 };
    }
    queryMulticast(): QueryMulticastHandle {
        this.multicastCalls++;
        const onNode = new Observable<[DiagnosticResponse]>();
        const onError = new Observable<[Error]>();
        return { onNode, onError, done: Promise.resolve(), close: async () => {} };
    }
    async resetCounters(): Promise<void> {
        this.resetCalls++;
    }
}

describe("HybridDiagnosticSource", () => {
    it("routes queryUnicast to CoAP by default", async () => {
        const coap = new FakeSource("meshcop");
        const rest = new FakeSource("otbr-rest");
        const hybrid = new HybridDiagnosticSource({ coap, rest });
        const res = await hybrid.queryUnicast({ rloc16: 1 }, []);
        expect(res.rloc16).to.equal(0x1000);
        expect(coap.unicastCalls).to.equal(1);
        expect(rest.unicastCalls).to.equal(0);
    });

    it('routes queryUnicast to REST when detailTransport="rest"', async () => {
        const coap = new FakeSource("meshcop");
        const rest = new FakeSource("otbr-rest");
        const hybrid = new HybridDiagnosticSource({ coap, rest, detailTransport: "rest" });
        const res = await hybrid.queryUnicast({ rloc16: 1 }, []);
        expect(res.rloc16).to.equal(0x2000);
        expect(rest.unicastCalls).to.equal(1);
        expect(coap.unicastCalls).to.equal(0);
    });

    it("falls back to REST when no CoAP source is present, even with default transport", async () => {
        const rest = new FakeSource("otbr-rest");
        const hybrid = new HybridDiagnosticSource({ rest });
        const res = await hybrid.queryUnicast({ rloc16: 1 }, []);
        expect(res.rloc16).to.equal(0x2000);
        expect(rest.unicastCalls).to.equal(1);
    });

    it('falls back to CoAP when detailTransport="rest" but no REST source is present', async () => {
        const coap = new FakeSource("meshcop");
        const hybrid = new HybridDiagnosticSource({ coap, detailTransport: "rest" });
        const res = await hybrid.queryUnicast({ rloc16: 1 }, []);
        expect(res.rloc16).to.equal(0x1000);
        expect(coap.unicastCalls).to.equal(1);
    });

    it("routes queryMulticast and resetCounters to the preferred transport", async () => {
        const coap = new FakeSource("meshcop");
        const rest = new FakeSource("otbr-rest");
        const hybrid = new HybridDiagnosticSource({ coap, rest });
        hybrid.queryMulticast("ff03::2", { tlvTypes: [], windowMs: 0 });
        await hybrid.resetCounters({ rloc16: 1 });
        expect(coap.multicastCalls).to.equal(1);
        expect(coap.resetCalls).to.equal(1);
        expect(rest.multicastCalls).to.equal(0);
    });

    it("reports the active transport's kind", () => {
        const coap = new FakeSource("meshcop");
        const rest = new FakeSource("otbr-rest");
        expect(new HybridDiagnosticSource({ coap, rest }).kind).to.equal("meshcop");
        expect(new HybridDiagnosticSource({ coap, rest, detailTransport: "rest" }).kind).to.equal("otbr-rest");
        expect(new HybridDiagnosticSource({ rest }).kind).to.equal("otbr-rest");
    });

    it("canQuery is true when either transport can serve the extPanId", () => {
        const coap = new FakeSource("meshcop", false);
        const rest = new FakeSource("otbr-rest", true);
        const hybrid = new HybridDiagnosticSource({ coap, rest });
        expect(hybrid.canQuery(EXT_PAN)).to.equal(true);
    });

    it("throws when constructed with neither transport", () => {
        expect(() => new HybridDiagnosticSource({})).to.throw(/at least one/i);
    });
});
