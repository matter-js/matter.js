/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CoapClient } from "../src/coap/CoapClient.js";
import { CoapMessage } from "../src/coap/CoapMessage.js";
import type { Commissioner } from "../src/commissioner/Commissioner.js";
import { MeshCopTlvType } from "../src/dataset/meshcopTlvTypes.js";
import { MeshCopDiagnosticSource } from "../src/diagnostic/MeshCopDiagnosticSource.js";
import { OtbrRestError } from "../src/otbr-rest/OtbrRestError.js";
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";

type CommissionerLike = Pick<Commissioner, "withSession">;
type CoapLike = Pick<CoapClient, "request" | "listen">;
type RequestOpts = { type: "CON" | "NON"; code: string; uriPath: string[]; payload?: Uint8Array };

function mockCommissioner(): CommissionerLike {
    return {
        withSession: async <T>(fn: (sessionId: number) => Promise<T>) => fn(42),
    };
}

function ackMessage(): CoapMessage {
    return { type: "ACK", code: "2.04", messageId: 1, token: new Uint8Array(), payload: new Uint8Array() };
}

/**
 * Build a c/er (MGMT_ED_REPORT) CoAP message with the given energy bytes.
 * Energy bytes are one signed byte per channel in channel-number order within the mask.
 */
function buildEnergyReport(energyBytes: number[]): CoapMessage {
    const payload = BasicTlv.encode([{ type: MeshCopTlvType.ENERGY_LIST, value: new Uint8Array(energyBytes) }]);
    return {
        type: "NON",
        code: "0.02",
        messageId: 0x1234,
        token: new Uint8Array(4),
        uriPath: ["c", "er"],
        payload,
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

// CHANNEL_MASK 53 → 4-byte big-endian; COUNT 54 → 1 byte; PERIOD 55 → 2-byte BE; SCAN_DURATION 56 → 2-byte BE
// channelMask=0x07FFF800 (channels 11-25), count=3, period=128, scanDuration=16
const TEST_OPTS = { channelMask: 0x07fff800, count: 3, period: 128, scanDuration: 16 };

describe("MeshCopDiagnosticSource.energyScan", () => {
    it("sends c/es with the four MeshCoP TLVs encoded correctly", async () => {
        const requests = new Array<RequestOpts>();
        let erHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/er") erHandler = handler;
                return () => {};
            },
            request: async opts => {
                requests.push(opts);
                // Deliver the energy report synchronously after the request.
                // channels 11-14 set → 4 energy bytes: -90, -85, -80, -75 (signed)
                erHandler!(buildEnergyReport([0xa6, 0xab, 0xb0, 0xb5]));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        const result = await source.energyScan({ channelMask: 0x00007800, count: 2, period: 64, scanDuration: 8 });

        expect(requests).to.have.length(1);
        const req = requests[0];
        expect(req.type).to.equal("NON");
        expect(req.code).to.equal("0.02");
        expect(req.uriPath).to.deep.equal(["c", "es"]);

        const tlvs = BasicTlv.walk(req.payload!);
        const maskEntry = tlvs.find(e => e.type === MeshCopTlvType.CHANNEL_MASK);
        const countEntry = tlvs.find(e => e.type === MeshCopTlvType.COUNT);
        const periodEntry = tlvs.find(e => e.type === MeshCopTlvType.PERIOD);
        const durationEntry = tlvs.find(e => e.type === MeshCopTlvType.SCAN_DURATION);

        expect(maskEntry).to.not.be.undefined;
        expect(countEntry).to.not.be.undefined;
        expect(periodEntry).to.not.be.undefined;
        expect(durationEntry).to.not.be.undefined;

        // channelMask=0x00007800 → bytes 00 00 78 00
        expect(maskEntry!.value).to.deep.equal(new Uint8Array([0x00, 0x00, 0x78, 0x00]));
        // count=2
        expect(countEntry!.value).to.deep.equal(new Uint8Array([0x02]));
        // period=64 → 0x0040
        expect(periodEntry!.value).to.deep.equal(new Uint8Array([0x00, 0x40]));
        // scanDuration=8 → 0x0008
        expect(durationEntry!.value).to.deep.equal(new Uint8Array([0x00, 0x08]));

        // channels 11,12,13,14 are set in mask 0x00007800: bits 11,12,13,14
        expect(result).to.have.length(4);
        expect(result[0]).to.deep.equal({ channel: 11, energy: -90 });
        expect(result[1]).to.deep.equal({ channel: 12, energy: -85 });
        expect(result[2]).to.deep.equal({ channel: 13, energy: -80 });
        expect(result[3]).to.deep.equal({ channel: 14, energy: -75 });
    });

    it("registers c/er listener BEFORE sending c/es", async () => {
        const events = new Array<string>();
        let erHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (uriPath, handler) => {
                events.push("listen:" + uriPath.join("/"));
                if (uriPath.join("/") === "c/er") erHandler = handler;
                return () => {};
            },
            request: async opts => {
                events.push("request:" + opts.uriPath.join("/"));
                erHandler!(buildEnergyReport([0xa6]));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        await source.energyScan({ channelMask: 0x00000800, count: 1, period: 64, scanDuration: 8 });

        expect(events[0]).to.equal("listen:c/er");
        expect(events[1]).to.equal("request:c/es");
    });

    it("parses ENERGY_LIST bytes as signed (negative dBm values)", async () => {
        let erHandler: ((msg: CoapMessage) => void) | undefined;
        const coap: CoapLike = {
            listen: (_uri, handler) => {
                erHandler = handler;
                return () => {};
            },
            request: async () => {
                // 0x9c = 156 unsigned = -100 signed; 0xce = 206 = -50 signed
                erHandler!(buildEnergyReport([0x9c, 0xce]));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        // channelMask with bits 11 and 12 set
        const result = await source.energyScan({ channelMask: 0x00001800, count: 1, period: 64, scanDuration: 8 });

        expect(result).to.have.length(2);
        expect(result[0].energy).to.equal(-100);
        expect(result[1].energy).to.equal(-50);
    });

    it("rejects with error when c/er carries no ENERGY_LIST TLV", async () => {
        let erHandler: ((msg: CoapMessage) => void) | undefined;
        const coap: CoapLike = {
            listen: (_uri, handler) => {
                erHandler = handler;
                return () => {};
            },
            request: async () => {
                // Send c/er with a different TLV type (no ENERGY_LIST)
                const payload = BasicTlv.encode([{ type: MeshCopTlvType.STATE, value: new Uint8Array([0x01]) }]);
                erHandler!({
                    type: "NON",
                    code: "0.02",
                    messageId: 1,
                    token: new Uint8Array(4),
                    uriPath: ["c", "er"],
                    payload,
                });
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        try {
            await source.energyScan(TEST_OPTS);
            expect.fail("expected Error");
        } catch (err) {
            expect(err instanceof Error && err.message).to.include("ENERGY_LIST");
        }
    });

    it("unsubscribes the c/er listener after completion", async () => {
        let unsubCalled = false;
        let erHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (_uri, handler) => {
                erHandler = handler;
                return () => {
                    unsubCalled = true;
                };
            },
            request: async () => {
                erHandler!(buildEnergyReport([0xa6]));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        await source.energyScan({ channelMask: 0x00000800, count: 1, period: 64, scanDuration: 8 });
        expect(unsubCalled).to.equal(true);
    });
});

describe("OtbrRestClient.getEnergyScanTask", () => {
    it("POSTs the correct JSON body to /api/actions", async () => {
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
            await client.getEnergyScanTask({ action: "getEnergyScanTask" });
            expect(capturedUrl).to.equal("http://br.example:8081/api/actions");
            expect(capturedInit?.method).to.equal("POST");
            expect(capturedInit?.headers).to.deep.include({ "Content-Type": "application/json" });
            const bodyStr = capturedInit?.body;
            expect(typeof bodyStr === "string" && JSON.parse(bodyStr)).to.deep.equal({ action: "getEnergyScanTask" });
        } finally {
            restore();
        }
    });

    it("throws OtbrRestError(rest_protocol) on non-2xx", async () => {
        const restore = installFetch(async () => new Response("nope", { status: 500 }));
        try {
            const { OtbrRestClient } = await import("../src/otbr-rest/OtbrRestClient.js");
            const client = new OtbrRestClient({ host: "br.example" });
            try {
                await client.getEnergyScanTask({ action: "getEnergyScanTask" });
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

    it("throws OtbrRestError(rest_unreachable) on network error", async () => {
        const restore = installFetch(async () => {
            throw new TypeError("fetch failed");
        });
        try {
            const { OtbrRestClient } = await import("../src/otbr-rest/OtbrRestClient.js");
            const client = new OtbrRestClient({ host: "br.example" });
            try {
                await client.getEnergyScanTask({ action: "getEnergyScanTask" });
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
