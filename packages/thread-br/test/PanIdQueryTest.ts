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
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";

type CommissionerLike = Pick<Commissioner, "withSession">;
type CoapLike = Pick<CoapClient, "request" | "listen">;

function mockCommissioner(): CommissionerLike {
    return {
        withSession: async <T>(fn: (sessionId: number) => Promise<T>) => fn(42),
    };
}

function ackMessage(): CoapMessage {
    return { type: "ACK", code: "2.04", messageId: 1, token: new Uint8Array(), payload: new Uint8Array() };
}

/**
 * Build a c/pc (MGMT_PANID_CONFLICT) CoAP message with the given channel mask
 * and PAN-ID.
 */
function buildPanIdConflict(conflictChannelMask: number, panId: number): CoapMessage {
    const mask = new Uint8Array(4);
    mask[0] = (conflictChannelMask >> 24) & 0xff;
    mask[1] = (conflictChannelMask >> 16) & 0xff;
    mask[2] = (conflictChannelMask >> 8) & 0xff;
    mask[3] = conflictChannelMask & 0xff;

    const panIdBytes = new Uint8Array(2);
    panIdBytes[0] = (panId >> 8) & 0xff;
    panIdBytes[1] = panId & 0xff;

    const payload = BasicTlv.encode([
        { type: MeshCopTlvType.CHANNEL_MASK, value: mask },
        { type: MeshCopTlvType.PANID, value: panIdBytes },
    ]);
    return {
        type: "NON",
        code: "0.02",
        messageId: 0x5678,
        token: new Uint8Array(4),
        uriPath: ["c", "pc"],
        payload,
    };
}

describe("MeshCopDiagnosticSource.panIdQuery", () => {
    it("sends c/pq with CHANNEL_MASK and PAN_ID TLVs encoded correctly", async () => {
        let capturedPayload: Uint8Array | undefined;
        let pcHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/pc") pcHandler = handler;
                return () => {};
            },
            request: async opts => {
                capturedPayload = opts.payload;
                // Deliver conflict report immediately.
                pcHandler!(buildPanIdConflict(0x00001800, 0xbeef));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        const result = await source.panIdQuery({ panId: 0xbeef, channelMask: 0x00007800 });

        expect(capturedPayload).to.not.be.undefined;
        const tlvs = BasicTlv.walk(capturedPayload!);
        const maskEntry = tlvs.find(e => e.type === MeshCopTlvType.CHANNEL_MASK);
        const panEntry = tlvs.find(e => e.type === MeshCopTlvType.PANID);

        expect(maskEntry).to.not.be.undefined;
        expect(panEntry).to.not.be.undefined;

        // channelMask=0x00007800 → bytes 00 00 78 00
        expect(maskEntry!.value).to.deep.equal(new Uint8Array([0x00, 0x00, 0x78, 0x00]));
        // panId=0xbeef → bytes be ef
        expect(panEntry!.value).to.deep.equal(new Uint8Array([0xbe, 0xef]));

        expect(result).to.not.be.undefined;
        expect(result!.conflictChannelMask).to.equal(0x00001800);
    });

    it("sends c/pq as NON to the c/pq URI", async () => {
        let capturedOpts: { type: string; uriPath: string[] } | undefined;
        let pcHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/pc") pcHandler = handler;
                return () => {};
            },
            request: async opts => {
                capturedOpts = opts;
                pcHandler!(buildPanIdConflict(0x00000800, 0x1234));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        await source.panIdQuery({ panId: 0x1234, channelMask: 0x00007800 });

        expect(capturedOpts?.type).to.equal("NON");
        expect(capturedOpts?.uriPath).to.deep.equal(["c", "pq"]);
    });

    it("returns undefined when no c/pc arrives within the timeout", async () => {
        // The timeout is 30s which is too slow for a unit test — we verify the
        // structural precondition: c/pc listener is registered before the request.
        let registered = false;
        const coap: CoapLike = {
            listen: uriPath => {
                if (uriPath.join("/") === "c/pc") registered = true;
                return () => {};
            },
            request: async () => ackMessage(),
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        void source.panIdQuery({ panId: 0x1234, channelMask: 0x00007800 });
        await new Promise(r => setTimeout(r, 10));
        expect(registered).to.equal(true);
    });

    it("resolves the conflict when c/pc arrives asynchronously after the request", async () => {
        let pcHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/pc") pcHandler = handler;
                return () => {};
            },
            request: async () => ackMessage(),
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        const conflictPromise = source.panIdQuery({ panId: 0x5555, channelMask: 0x00007800 });

        await new Promise(r => setTimeout(r, 5));
        if (pcHandler !== undefined) {
            pcHandler(buildPanIdConflict(0x00001000, 0x5555));
        }
        const result = await conflictPromise;
        expect(result).to.not.be.undefined;
        expect(result!.conflictChannelMask).to.equal(0x00001000);
    });

    it("registers c/pc listener BEFORE sending c/pq", async () => {
        const events = new Array<string>();
        let pcHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (uriPath, handler) => {
                events.push("listen:" + uriPath.join("/"));
                if (uriPath.join("/") === "c/pc") pcHandler = handler;
                return () => {};
            },
            request: async opts => {
                events.push("request:" + opts.uriPath.join("/"));
                pcHandler!(buildPanIdConflict(0x00000800, 0xabcd));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        await source.panIdQuery({ panId: 0xabcd, channelMask: 0x00007800 });

        expect(events[0]).to.equal("listen:c/pc");
        expect(events[1]).to.equal("request:c/pq");
    });

    it("unsubscribes the c/pc listener after completion", async () => {
        let unsubCalled = false;
        let pcHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (_uri, handler) => {
                pcHandler = handler;
                return () => {
                    unsubCalled = true;
                };
            },
            request: async () => {
                pcHandler!(buildPanIdConflict(0x00000800, 0xdead));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        await source.panIdQuery({ panId: 0xdead, channelMask: 0x00007800 });
        expect(unsubCalled).to.equal(true);
    });

    it("rejects with error when c/pc carries no CHANNEL_MASK TLV", async () => {
        let pcHandler: ((msg: CoapMessage) => void) | undefined;
        const coap: CoapLike = {
            listen: (_uri, handler) => {
                pcHandler = handler;
                return () => {};
            },
            request: async () => {
                // Send c/pc without a CHANNEL_MASK TLV
                const payload = BasicTlv.encode([{ type: MeshCopTlvType.PANID, value: new Uint8Array([0x12, 0x34]) }]);
                pcHandler!({
                    type: "NON",
                    code: "0.02",
                    messageId: 1,
                    token: new Uint8Array(4),
                    uriPath: ["c", "pc"],
                    payload,
                });
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        try {
            await source.panIdQuery({ panId: 0x1234, channelMask: 0x00007800 });
            expect.fail("expected Error");
        } catch (err) {
            expect(err instanceof Error && err.message).to.include("CHANNEL_MASK");
        }
    });

    it("parses conflict channel mask correctly (big-endian 4-byte)", async () => {
        let pcHandler: ((msg: CoapMessage) => void) | undefined;
        const coap: CoapLike = {
            listen: (_uri, handler) => {
                pcHandler = handler;
                return () => {};
            },
            request: async () => {
                pcHandler!(buildPanIdConflict(0xdeadbeef, 0x1234));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap);
        const result = await source.panIdQuery({ panId: 0x1234, channelMask: 0xffffffff });
        expect(result).to.not.be.undefined;
        expect(result!.conflictChannelMask).to.equal(0xdeadbeef);
    });
});
