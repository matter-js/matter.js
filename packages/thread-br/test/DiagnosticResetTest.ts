/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import type { CoapClient } from "../src/coap/CoapClient.js";
import { CoapMessage } from "../src/coap/CoapMessage.js";
import type { Commissioner } from "../src/commissioner/Commissioner.js";
import { MeshCopTlvType } from "../src/dataset/meshcopTlvTypes.js";
import { MeshCopDiagnosticSource } from "../src/diagnostic/MeshCopDiagnosticSource.js";
import type { OtbrRestCapability } from "../src/otbr-rest/OtbrRestCapability.js";
import type { OtbrRestClient } from "../src/otbr-rest/OtbrRestClient.js";
import { OtbrRestDiagnosticSource } from "../src/otbr-rest/OtbrRestDiagnosticSource.js";
import { OtbrRestError } from "../src/otbr-rest/OtbrRestError.js";
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";
import { Ip6AddressTlv } from "../src/tlv/meshcop/Ip6AddressTlv.js";
import { UdpEncapsulationTlv } from "../src/tlv/meshcop/UdpEncapsulationTlv.js";
import { NetworkDiagTlvType } from "../src/tlv/networkDiagTlvTypes.js";

type CommissionerLike = Pick<Commissioner, "withSession">;
type CoapLike = Pick<CoapClient, "request" | "listen">;
type RequestOpts = { type: "CON" | "NON"; code: string; uriPath: string[]; payload?: Uint8Array };

const ML_PREFIX = new Uint8Array([0xfd, 0xda, 0x3f, 0xb0, 0x2c, 0x67, 0x00, 0x00]);

function mockCommissioner(): CommissionerLike {
    return {
        withSession: async <T>(fn: (sessionId: number) => Promise<T>) => fn(42),
    };
}

function ackMessage(): CoapMessage {
    return { type: "ACK", code: "2.04", messageId: 1, token: new Uint8Array(), payload: new Uint8Array() };
}

function unwrapProxyTx(proxyPayload: Uint8Array): {
    inner: CoapMessage;
    targetAddr: Uint8Array;
    sourcePort: number;
    destinationPort: number;
} {
    const entries = BasicTlv.walk(proxyPayload);
    const encapEntry = entries.find(e => e.type === MeshCopTlvType.UDP_ENCAPSULATION);
    const addrEntry = entries.find(e => e.type === MeshCopTlvType.IPV6_ADDRESS);
    if (encapEntry === undefined || addrEntry === undefined) {
        throw new Error("ProxyTx payload missing UDP_ENCAPSULATION or IPV6_ADDRESS TLV");
    }
    const encap = UdpEncapsulationTlv.decode(encapEntry.value);
    return {
        inner: CoapMessage.decode(encap.payload),
        targetAddr: Ip6AddressTlv.decode(addrEntry.value),
        sourcePort: encap.sourcePort,
        destinationPort: encap.destinationPort,
    };
}

function makeCapability(keyFormat: "camel" | "pascal"): OtbrRestCapability {
    return {
        baseUrl: "http://br.example:8081",
        keyFormat,
        probedAt: 1_700_000_000_000,
        networkName: "TestNet",
        extPanId: Bytes.of(Bytes.fromHex("1122334455667788")),
    };
}

type ClientLike = Pick<OtbrRestClient, "getDiagnostics" | "getNode" | "resetDiagnosticCounters">;

function mockRestClient(onReset?: (body: unknown) => void): ClientLike {
    return {
        getDiagnostics: async () => [],
        getNode: async () => {
            throw new Error("not used");
        },
        resetDiagnosticCounters: async (body: unknown) => {
            onReset?.(body);
        },
    };
}

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

function installFetch(handler: FetchHandler): () => void {
    const original = globalThis.fetch;
    const replacement: typeof fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return handler(url, init);
    };
    globalThis.fetch = replacement;
    return () => {
        globalThis.fetch = original;
    };
}

// Expected TypeList TLV payload for [MAC_COUNTERS=9, MLE_COUNTERS=34]:
// outer TLV: type=18(TYPE_LIST), length=2, value=[9, 34]
// => bytes: 0x12 0x02 0x09 0x22
const EXPECTED_TYPE_LIST_PAYLOAD = new Uint8Array([0x12, 0x02, 0x09, 0x22]);

describe("MeshCopDiagnosticSource.resetCounters", () => {
    it("sends d/dr via c/ut proxy wrap with TypeList payload for default tlvTypes", async () => {
        const requests = new Array<RequestOpts>();
        const coap: CoapLike = {
            request: async opts => {
                requests.push(opts);
                return ackMessage();
            },
            listen: () => () => {},
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        await source.resetCounters({ rloc16: 0x0400 });

        expect(requests).to.have.length(1);
        const req = requests[0];
        expect(req.type).to.equal("NON");
        expect(req.code).to.equal("0.02");
        expect(req.uriPath).to.deep.equal(["c", "ut"]);

        const { inner } = unwrapProxyTx(req.payload!);
        expect(inner.type).to.equal("CON");
        expect(inner.code).to.equal("0.02");
        expect(inner.uriPath).to.deep.equal(["d", "dr"]);
        expect(inner.payload).to.deep.equal(EXPECTED_TYPE_LIST_PAYLOAD);
    });

    it("sends d/dr with custom tlvTypes when provided", async () => {
        const requests = new Array<RequestOpts>();
        const coap: CoapLike = {
            request: async opts => {
                requests.push(opts);
                return ackMessage();
            },
            listen: () => () => {},
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        await source.resetCounters({ rloc16: 0x0400 }, [NetworkDiagTlvType.MAC_COUNTERS]);

        expect(requests).to.have.length(1);
        const { inner } = unwrapProxyTx(requests[0].payload!);
        expect(inner.uriPath).to.deep.equal(["d", "dr"]);
        // TypeList for [9]: type=18, len=1, value=[9] => 0x12 0x01 0x09
        expect(inner.payload).to.deep.equal(new Uint8Array([0x12, 0x01, 0x09]));
    });

    it("proxy-wraps d/dr with same port mirroring as d/dq (src=49152, dst=61631)", async () => {
        const requests = new Array<RequestOpts>();
        const coap: CoapLike = {
            request: async opts => {
                requests.push(opts);
                return ackMessage();
            },
            listen: () => () => {},
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        await source.resetCounters({ rloc16: 0x0400 });

        const { sourcePort, destinationPort } = unwrapProxyTx(requests[0].payload!);
        expect(sourcePort).to.equal(49152);
        expect(destinationPort).to.equal(61631);
    });

    it("throws when rloc16 is missing", async () => {
        const source = new MeshCopDiagnosticSource(
            mockCommissioner(),
            { request: async () => ackMessage(), listen: () => () => {} },
            ML_PREFIX,
        );
        try {
            await source.resetCounters({});
            expect.fail("expected Error");
        } catch (err) {
            expect((err as Error).message).to.include("rloc16");
        }
    });

    it("throws when no mesh-local prefix was provided", async () => {
        const source = new MeshCopDiagnosticSource(mockCommissioner(), {
            request: async () => ackMessage(),
            listen: () => () => {},
        });
        try {
            await source.resetCounters({ rloc16: 0x0400 });
            expect.fail("expected Error");
        } catch (err) {
            expect((err as Error).message).to.include("mesh-local prefix");
        }
    });

    it("directs the proxy-wrapped reset to the target node's mesh-local address", async () => {
        const requests = new Array<RequestOpts>();
        const coap: CoapLike = {
            request: async opts => {
                requests.push(opts);
                return ackMessage();
            },
            listen: () => () => {},
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        await source.resetCounters({ rloc16: 0x0800 });

        const { targetAddr } = unwrapProxyTx(requests[0].payload!);
        // rloc16 0x0800 → last 2 bytes of mesh-local EID are 0x08 0x00 + IID suffix
        // deriveMeshLocalAddress packs rloc16 big-endian into the last 2 bytes of a /64 prefix
        expect(targetAddr[8]).to.equal(0x00);
        expect(targetAddr[9]).to.equal(0x00);
        expect(targetAddr[10]).to.equal(0x00);
        expect(targetAddr[11]).to.equal(0xff);
        expect(targetAddr[12]).to.equal(0xfe);
        expect(targetAddr[13]).to.equal(0x00);
        expect(targetAddr[14]).to.equal(0x08);
        expect(targetAddr[15]).to.equal(0x00);
    });
});

describe("OtbrRestDiagnosticSource.resetCounters", () => {
    it("delegates to client.resetDiagnosticCounters with resetNetworkDiagCounterTask body on camelCase backend", async () => {
        let capturedBody: unknown;
        const client = mockRestClient(body => {
            capturedBody = body;
        });
        const source = new OtbrRestDiagnosticSource(client, makeCapability("camel"));
        await source.resetCounters({ rloc16: 0x0400 });
        expect(capturedBody).to.deep.equal({ action: "resetNetworkDiagCounterTask" });
    });

    it("mock client resetDiagnosticCounters is called with correct body for custom tlvTypes", async () => {
        let capturedBody: unknown;
        const client = mockRestClient(body => {
            capturedBody = body;
        });
        const source = new OtbrRestDiagnosticSource(client, makeCapability("camel"));
        await source.resetCounters({ rloc16: 0x0400 }, [NetworkDiagTlvType.MAC_COUNTERS]);
        expect(capturedBody).to.deep.equal({ action: "resetNetworkDiagCounterTask" });
    });

    it("throws OtbrRestError(rest_disabled) when keyFormat is pascal", async () => {
        const client = mockRestClient();
        const source = new OtbrRestDiagnosticSource(client, makeCapability("pascal"));
        try {
            await source.resetCounters({ rloc16: 0x0400 });
            expect.fail("expected OtbrRestError");
        } catch (err) {
            expect(err).to.be.instanceOf(OtbrRestError);
            if (!(err instanceof OtbrRestError)) throw err;
            expect(err.code).to.equal("rest_disabled");
        }
    });

    it("OtbrRestClient.resetDiagnosticCounters posts the correct JSON body to /api/actions", async () => {
        let capturedUrl: string | undefined;
        let capturedInit: RequestInit | undefined;
        const restore = installFetch(async (url, init) => {
            capturedUrl = url;
            capturedInit = init;
            return new Response(null, { status: 204 });
        });
        try {
            const { OtbrRestClient } = await import("../src/otbr-rest/OtbrRestClient.js");
            const client = new OtbrRestClient({ host: "br.example" });
            await client.resetDiagnosticCounters({ action: "resetNetworkDiagCounterTask" });
            expect(capturedUrl).to.equal("http://br.example:8081/api/actions");
            expect(capturedInit?.method).to.equal("POST");
            expect(capturedInit?.headers).to.deep.include({ "Content-Type": "application/json" });
            expect(JSON.parse(capturedInit?.body as string)).to.deep.equal({
                action: "resetNetworkDiagCounterTask",
            });
        } finally {
            restore();
        }
    });

    it("OtbrRestClient.resetDiagnosticCounters throws OtbrRestError(rest_protocol) on non-2xx", async () => {
        const restore = installFetch(async () => new Response("nope", { status: 500 }));
        try {
            const { OtbrRestClient } = await import("../src/otbr-rest/OtbrRestClient.js");
            const client = new OtbrRestClient({ host: "br.example" });
            try {
                await client.resetDiagnosticCounters({ action: "resetNetworkDiagCounterTask" });
                expect.fail("expected OtbrRestError");
            } catch (err) {
                expect(err).to.be.instanceOf(OtbrRestError);
                if (!(err instanceof OtbrRestError)) throw err;
                expect(err.code).to.equal("rest_protocol");
            }
        } finally {
            restore();
        }
    });

    it("OtbrRestClient.resetDiagnosticCounters throws OtbrRestError(rest_unreachable) on network error", async () => {
        const restore = installFetch(async () => {
            throw new TypeError("fetch failed");
        });
        try {
            const { OtbrRestClient } = await import("../src/otbr-rest/OtbrRestClient.js");
            const client = new OtbrRestClient({ host: "br.example" });
            try {
                await client.resetDiagnosticCounters({ action: "resetNetworkDiagCounterTask" });
                expect.fail("expected OtbrRestError");
            } catch (err) {
                expect(err).to.be.instanceOf(OtbrRestError);
                if (!(err instanceof OtbrRestError)) throw err;
                expect(err.code).to.equal("rest_unreachable");
            }
        } finally {
            restore();
        }
    });
});
