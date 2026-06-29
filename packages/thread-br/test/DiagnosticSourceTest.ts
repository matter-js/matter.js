/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CoapClient } from "../src/coap/CoapClient.js";
import { CoapTimeoutError } from "../src/coap/CoapClient.js";
import { CoapMessage } from "../src/coap/CoapMessage.js";
import type { Commissioner } from "../src/commissioner/Commissioner.js";
import { MeshCopTlvType } from "../src/dataset/meshcopTlvTypes.js";
import type { DiagnosticResponse } from "../src/diagnostic/DiagnosticResponse.js";
import { MeshCopDiagnosticSource, missingRouterIds } from "../src/diagnostic/MeshCopDiagnosticSource.js";
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";
import { Ip6AddressTlv } from "../src/tlv/meshcop/Ip6AddressTlv.js";
import { UdpEncapsulationTlv } from "../src/tlv/meshcop/UdpEncapsulationTlv.js";
import { NetworkDiagnosticTlv } from "../src/tlv/NetworkDiagnosticTlv.js";
import { NetworkDiagTlvType } from "../src/tlv/networkDiagTlvTypes.js";
import { ALL_THREAD_ROUTERS_REALM_LOCAL, deriveMeshLocalAddress } from "../src/util/meshLocalAddr.js";

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

function buildDiagPayload(type: number, value: Uint8Array): Uint8Array {
    return BasicTlv.encode([{ type, value }]);
}

/** Decode the outer ProxyTx TLVs the source built, returning the inner CoAP
 *  message and the target IPv6 address. */
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

/** Build a `c/ur` (ProxyRx) reply that wraps a diagnostic answer with the given
 *  inner CoAP token and source address. */
function buildProxyRxReply(
    innerToken: Uint8Array,
    diagPayload: Uint8Array,
    sourceAddr: Uint8Array,
    innerType: "CON" | "NON" = "NON",
    innerMessageId = 0x1234,
): CoapMessage {
    const innerCoap = CoapMessage.encode({
        type: innerType,
        code: "2.04",
        messageId: innerMessageId,
        token: innerToken,
        uriPath: ["d", "da"],
        payload: diagPayload,
    });
    const proxyPayload = BasicTlv.encode([
        {
            type: MeshCopTlvType.UDP_ENCAPSULATION,
            value: UdpEncapsulationTlv.encode({ sourcePort: 61631, destinationPort: 49152, payload: innerCoap }),
        },
        { type: MeshCopTlvType.IPV6_ADDRESS, value: Ip6AddressTlv.encode(sourceAddr) },
    ]);
    return {
        type: "NON",
        code: "0.02",
        messageId: 7,
        token: new Uint8Array(4),
        uriPath: ["c", "ur"],
        payload: proxyPayload,
    };
}

async function collect(
    handle: import("../src/diagnostic/DiagnosticSource.js").QueryMulticastHandle,
): Promise<DiagnosticResponse[]> {
    const responses = new Array<DiagnosticResponse>();
    handle.onNode.on(n => {
        responses.push(n);
    });
    await handle.done;
    return responses;
}

describe("MeshCopDiagnosticSource", () => {
    it("kind is 'meshcop'", () => {
        const source = new MeshCopDiagnosticSource(mockCommissioner(), {
            request: async () => ackMessage(),
            listen: () => () => {},
        });
        expect(source.kind).to.equal("meshcop");
    });

    it("canQuery always returns true", () => {
        const source = new MeshCopDiagnosticSource(mockCommissioner(), {
            request: async () => ackMessage(),
            listen: () => () => {},
        });
        expect(source.canQuery(new Uint8Array(8))).to.equal(true);
        expect(source.canQuery(new Uint8Array(0))).to.equal(true);
    });

    it("queryUnicast wraps /d/dg in a c/ut ProxyTx to the node's mesh-local address and decodes the c/ur reply", async () => {
        const extMacValue = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        const responsePayload = buildDiagPayload(NetworkDiagTlvType.EXT_MAC_ADDRESS, extMacValue);

        let capturedOpts: RequestOpts | undefined;
        let urHandler: ((msg: CoapMessage) => void) | undefined;
        const sourceAddr = deriveMeshLocalAddress(ML_PREFIX, 0x0400);

        const coap: CoapLike = {
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/ur") urHandler = handler;
                return () => {};
            },
            request: async opts => {
                capturedOpts = opts;
                const { inner } = unwrapProxyTx(opts.payload!);
                urHandler!(buildProxyRxReply(inner.token, responsePayload, sourceAddr));
                return ackMessage();
            },
        };

        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const result = await source.queryUnicast({ rloc16: 0x0400 }, [NetworkDiagTlvType.EXT_MAC_ADDRESS]);

        expect(capturedOpts).to.not.be.undefined;
        expect(capturedOpts!.type).to.equal("NON");
        expect(capturedOpts!.code).to.equal("0.02");
        expect(capturedOpts!.uriPath).to.deep.equal(["c", "ut"]);

        const { inner, targetAddr } = unwrapProxyTx(capturedOpts!.payload!);
        expect(inner.type).to.equal("CON");
        expect(inner.code).to.equal("0.02");
        expect(inner.uriPath).to.deep.equal(["d", "dg"]);
        expect(inner.payload).to.deep.equal(new Uint8Array([0x12, 0x01, NetworkDiagTlvType.EXT_MAC_ADDRESS]));
        expect(targetAddr).to.deep.equal(sourceAddr);

        expect(result.extMacAddress).to.deep.equal(extMacValue);
    });

    it("queryUnicast propagates errors from coap.request", async () => {
        const coap: CoapLike = {
            listen: () => () => {},
            request: async () => {
                throw new CoapTimeoutError(0);
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        try {
            await source.queryUnicast({ rloc16: 0x0400 }, [0]);
            expect.fail("expected CoapTimeoutError");
        } catch (err) {
            expect(err).to.be.instanceOf(CoapTimeoutError);
        }
    });

    it("queryUnicast places unknown TLV types in response.unknown", async () => {
        const unknownType = 0xfe;
        const unknownValue = new Uint8Array([0xaa, 0xbb]);
        const responsePayload = buildDiagPayload(unknownType, unknownValue);
        let urHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            listen: (_uri, handler) => {
                urHandler = handler;
                return () => {};
            },
            request: async opts => {
                const { inner } = unwrapProxyTx(opts.payload!);
                urHandler!(buildProxyRxReply(inner.token, responsePayload, deriveMeshLocalAddress(ML_PREFIX, 0x0400)));
                return ackMessage();
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const result = await source.queryUnicast({ rloc16: 0x0400 }, [unknownType]);

        expect(result.unknown).to.have.length(1);
        expect(result.unknown[0].type).to.equal(unknownType);
        expect(result.unknown[0].value).to.deep.equal(unknownValue);
        expect(result.extMacAddress).to.be.undefined;
    });

    it("queryUnicast throws when target.ip is supplied", async () => {
        const source = new MeshCopDiagnosticSource(
            mockCommissioner(),
            { request: async () => ackMessage(), listen: () => () => {} },
            ML_PREFIX,
        );
        try {
            await source.queryUnicast({ ip: "fd00::1" }, [0]);
            expect.fail("expected Error");
        } catch (err) {
            expect((err as Error).message).to.include("ip-routed");
        }
    });

    it("queryUnicast throws when rloc16 is missing", async () => {
        const source = new MeshCopDiagnosticSource(
            mockCommissioner(),
            { request: async () => ackMessage(), listen: () => () => {} },
            ML_PREFIX,
        );
        try {
            await source.queryUnicast({}, [0]);
            expect.fail("expected Error");
        } catch (err) {
            expect((err as Error).message).to.include("rloc16");
        }
    });

    it("queryUnicast throws when no mesh-local prefix was provided", async () => {
        const source = new MeshCopDiagnosticSource(mockCommissioner(), {
            request: async () => ackMessage(),
            listen: () => () => {},
        });
        try {
            await source.queryUnicast({ rloc16: 0x0400 }, [0]);
            expect.fail("expected Error");
        } catch (err) {
            expect((err as Error).message).to.include("mesh-local prefix");
        }
    });

    it("queryMulticast streams parsed c/ur replies through onNode and resolves done at window end", async () => {
        const extMacA = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        const extMacB = new Uint8Array([0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18]);
        const ansA = buildDiagPayload(NetworkDiagTlvType.EXT_MAC_ADDRESS, extMacA);
        const ansB = buildDiagPayload(NetworkDiagTlvType.EXT_MAC_ADDRESS, extMacB);
        let urHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            request: async () => ackMessage(),
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/ur") urHandler = handler;
                return () => {};
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);

        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS],
            windowMs: 50,
        });
        const responses = new Array<DiagnosticResponse>();
        handle.onNode.on(n => {
            responses.push(n);
        });

        await new Promise(r => setTimeout(r, 10));
        expect(urHandler).to.not.be.undefined;
        urHandler!(buildProxyRxReply(new Uint8Array([1, 2, 3, 4]), ansA, deriveMeshLocalAddress(ML_PREFIX, 0x0400)));
        urHandler!(buildProxyRxReply(new Uint8Array([5, 6, 7, 8]), ansB, deriveMeshLocalAddress(ML_PREFIX, 0x0800)));

        await handle.done;
        expect(responses).to.have.length(2);
        expect(responses[0].extMacAddress).to.deep.equal(extMacA);
        expect(responses[1].extMacAddress).to.deep.equal(extMacB);
    });

    it("queryMulticast subscribes to c/ur BEFORE sending the c/ut ProxyTx", async () => {
        const events = new Array<string>();
        const listenedPaths = new Array<string[]>();
        const requestedPaths = new Array<string[]>();

        const coap: CoapLike = {
            request: async opts => {
                events.push("request");
                requestedPaths.push(opts.uriPath);
                return ackMessage();
            },
            listen: uriPath => {
                events.push("listen");
                listenedPaths.push(uriPath);
                return () => {};
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS],
            windowMs: 10,
        });
        await handle.done;

        expect(events).to.deep.equal(["listen", "request"]);
        expect(listenedPaths.map(p => p.join("/"))).to.deep.equal(["c/ur"]);
        expect(requestedPaths.map(p => p.join("/"))).to.deep.equal(["c/ut"]);
    });

    it("queryMulticast sends a NON /d/dq inner query to the all-routers group", async () => {
        let capturedPayload: Uint8Array | undefined;
        const coap: CoapLike = {
            request: async opts => {
                capturedPayload = opts.payload;
                return ackMessage();
            },
            listen: () => () => {},
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS, NetworkDiagTlvType.ADDRESS16],
            windowMs: 10,
        });
        await handle.done;

        const { inner, targetAddr } = unwrapProxyTx(capturedPayload!);
        expect(inner.type).to.equal("NON");
        expect(inner.uriPath).to.deep.equal(["d", "dq"]);
        expect(inner.payload).to.deep.equal(new Uint8Array([0x12, 0x02, 0x00, 0x01]));
        expect(targetAddr).to.deep.equal(ALL_THREAD_ROUTERS_REALM_LOCAL);
    });

    it("queryMulticast ACKs a confirmable inner d/da via a c/ut ProxyTx to the responder", async () => {
        const ans = buildDiagPayload(NetworkDiagTlvType.EXT_MAC_ADDRESS, new Uint8Array(8));
        const sourceAddr = deriveMeshLocalAddress(ML_PREFIX, 0x0400);
        const requests = new Array<RequestOpts>();
        let urHandler: ((msg: CoapMessage) => void) | undefined;

        const coap: CoapLike = {
            request: async opts => {
                requests.push(opts);
                return ackMessage();
            },
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/ur") urHandler = handler;
                return () => {};
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS],
            windowMs: 30,
        });

        await new Promise(r => setTimeout(r, 5));
        urHandler!(buildProxyRxReply(new Uint8Array([1, 2, 3, 4]), ans, sourceAddr, "CON", 0x55aa));
        await handle.done;

        const ackSends = requests
            .filter(r => r.uriPath.join("/") === "c/ut")
            .map(r => unwrapProxyTx(r.payload!))
            .filter(({ inner }) => inner.type === "ACK");
        expect(ackSends).to.have.length(1);
        expect(ackSends[0].inner.code).to.equal("0.00");
        expect(ackSends[0].inner.messageId).to.equal(0x55aa);
        expect(ackSends[0].targetAddr).to.deep.equal(sourceAddr);
        // ACK mirrors the received datagram's ports: the reply was sent 61631->49152,
        // so the ACK goes back 49152->61631 (from the port the node addressed).
        expect(ackSends[0].sourcePort).to.equal(49152);
        expect(ackSends[0].destinationPort).to.equal(61631);
    });

    it("queryMulticast does NOT ACK a non-confirmable inner d/da", async () => {
        const ans = buildDiagPayload(NetworkDiagTlvType.EXT_MAC_ADDRESS, new Uint8Array(8));
        const requests = new Array<RequestOpts>();
        let urHandler: ((msg: CoapMessage) => void) | undefined;
        const coap: CoapLike = {
            request: async opts => {
                requests.push(opts);
                return ackMessage();
            },
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/ur") urHandler = handler;
                return () => {};
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS],
            windowMs: 30,
        });

        await new Promise(r => setTimeout(r, 5));
        urHandler!(buildProxyRxReply(new Uint8Array([1, 2, 3, 4]), ans, deriveMeshLocalAddress(ML_PREFIX, 0x0400)));
        await handle.done;

        const ackSends = requests
            .filter(r => r.uriPath.join("/") === "c/ut")
            .map(r => unwrapProxyTx(r.payload!))
            .filter(({ inner }) => inner.type === "ACK");
        expect(ackSends).to.have.length(0);
    });

    it("queryMulticast yields no nodes when no c/ur arrives within windowMs", async () => {
        const coap: CoapLike = { request: async () => ackMessage(), listen: () => () => {} };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS],
            windowMs: 10,
        });
        expect(await collect(handle)).to.have.length(0);
    });

    it("queryMulticast drops c/ur replies whose inner diagnostic payload is empty", async () => {
        let urHandler: ((msg: CoapMessage) => void) | undefined;
        const coap: CoapLike = {
            request: async () => ackMessage(),
            listen: (_uri, handler) => {
                urHandler = handler;
                return () => {};
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS],
            windowMs: 30,
        });

        await new Promise(r => setTimeout(r, 5));
        urHandler!(
            buildProxyRxReply(
                new Uint8Array([1, 2, 3, 4]),
                new Uint8Array(),
                deriveMeshLocalAddress(ML_PREFIX, 0x0400),
            ),
        );

        expect(await collect(handle)).to.have.length(0);
    });

    it("queryMulticast surfaces decode failures on onError and continues running", async () => {
        let urHandler: ((msg: CoapMessage) => void) | undefined;
        const coap: CoapLike = {
            request: async () => ackMessage(),
            listen: (_uri, handler) => {
                urHandler = handler;
                return () => {};
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS],
            windowMs: 30,
        });

        const errors = new Array<Error>();
        handle.onError.on(e => {
            errors.push(e);
        });

        await new Promise(r => setTimeout(r, 5));
        // Truncated inner diag TLV: type=0, length=8, but only 2 bytes follow.
        urHandler!(
            buildProxyRxReply(
                new Uint8Array([1, 2, 3, 4]),
                new Uint8Array([0x00, 0x08, 0x01, 0x02]),
                deriveMeshLocalAddress(ML_PREFIX, 0x0400),
            ),
        );

        expect(await collect(handle)).to.have.length(0);
        expect(errors.length).to.be.greaterThan(0);
    });

    it("queryMulticast unsubscribes after the window closes", async () => {
        let unsubCalled = false;
        const coap: CoapLike = {
            request: async () => ackMessage(),
            listen: () => () => {
                unsubCalled = true;
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.EXT_MAC_ADDRESS],
            windowMs: 10,
        });
        await handle.done;
        expect(unsubCalled).to.equal(true);
    });

    it("queryMulticast close() tears down before the window elapses", async () => {
        let unsubCalled = false;
        const coap: CoapLike = {
            request: async () => ackMessage(),
            listen: () => () => {
                unsubCalled = true;
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", { tlvTypes: [], windowMs: 10_000 });

        await new Promise(r => setTimeout(r, 5));
        await handle.close();
        expect(unsubCalled).to.equal(true);
    });

    it("queryMulticast unicast-fills routers referenced but not answered", async () => {
        // Route64 layout per Route64.decode: [idSequence:1][routerIdMask:8][oneEntryByte per set bit]
        // Bit for routerId is: byte[routerId >> 3] |= 0x80 >> (routerId & 7)
        function encodeRoute64(routerIds: number[]): Uint8Array {
            const mask = new Uint8Array(8);
            for (const id of routerIds) mask[id >> 3] |= 0x80 >> (id & 7);
            const entries = routerIds.map(() => 0x00);
            return new Uint8Array([0x00, ...mask, ...entries]);
        }

        const diagFor = (rloc16: number, refRouterIds: number[]): Uint8Array =>
            NetworkDiagnosticTlv.encode([
                { type: NetworkDiagTlvType.ADDRESS16, value: new Uint8Array([(rloc16 >> 8) & 0xff, rloc16 & 0xff]) },
                { type: NetworkDiagTlvType.ROUTE64, value: encodeRoute64(refRouterIds) },
            ]);

        const proxyTxTargets = new Array<Uint8Array>();
        let urHandler: ((msg: CoapMessage) => void) | undefined;
        const coap: CoapLike = {
            listen: (uriPath, handler) => {
                if (uriPath.join("/") === "c/ur") urHandler = handler;
                return () => {};
            },
            request: async opts => {
                if (opts.uriPath.join("/") === "c/ut") proxyTxTargets.push(unwrapProxyTx(opts.payload!).targetAddr);
                return ackMessage();
            },
        };
        const source = new MeshCopDiagnosticSource(mockCommissioner(), coap, ML_PREFIX);
        const handle = source.queryMulticast("ff03::2", {
            tlvTypes: [NetworkDiagTlvType.ADDRESS16, NetworkDiagTlvType.ROUTE64],
            windowMs: 80,
        });
        await new Promise(r => setTimeout(r, 10));
        // responder rloc16 0x1400 (routerId 5) references routerId 29 (rloc16 0x7400) which never answers
        urHandler!(
            buildProxyRxReply(
                new Uint8Array([1, 2, 3, 4]),
                diagFor(0x1400, [29]),
                deriveMeshLocalAddress(ML_PREFIX, 0x1400),
            ),
        );
        await handle.done;
        const want = deriveMeshLocalAddress(ML_PREFIX, (29 << 10) & 0xffff);
        expect(proxyTxTargets.some(t => t.length === want.length && t.every((b, i) => b === want[i]))).to.equal(true);
    });
});

describe("missingRouterIds", () => {
    it("returns router ids referenced in route64 entries that have no answering responder", () => {
        const responses: DiagnosticResponse[] = [
            {
                rloc16: 0x7400,
                route64: {
                    idSequence: 0,
                    entries: [
                        { routerId: 5, linkQualityIn: 3, linkQualityOut: 3, routeCost: 1 },
                        { routerId: 9, linkQualityIn: 2, linkQualityOut: 2, routeCost: 2 },
                    ],
                },
                unknown: [],
            },
            {
                rloc16: 0x1400,
                route64: {
                    idSequence: 0,
                    entries: [
                        { routerId: 29, linkQualityIn: 3, linkQualityOut: 3, routeCost: 1 },
                        { routerId: 9, linkQualityIn: 1, linkQualityOut: 1, routeCost: 3 },
                    ],
                },
                unknown: [],
            },
        ];
        expect(missingRouterIds(responses)).to.deep.equal([9]);
    });

    it("returns empty when every referenced router answered", () => {
        const responses: DiagnosticResponse[] = [
            {
                rloc16: 0x7400,
                route64: {
                    idSequence: 0,
                    entries: [{ routerId: 5, linkQualityIn: 3, linkQualityOut: 3, routeCost: 1 }],
                },
                unknown: [],
            },
            {
                rloc16: 0x1400,
                route64: {
                    idSequence: 0,
                    entries: [{ routerId: 29, linkQualityIn: 3, linkQualityOut: 3, routeCost: 1 }],
                },
                unknown: [],
            },
        ];
        expect(missingRouterIds(responses)).to.deep.equal([]);
    });

    it("ignores responses without rloc16 or route64", () => {
        expect(missingRouterIds([{ unknown: [] }])).to.deep.equal([]);
    });

    it("counts a responder with rloc16 but no route64 as answered", () => {
        const responses: DiagnosticResponse[] = [
            {
                rloc16: 0x7400,
                route64: {
                    idSequence: 0,
                    entries: [{ routerId: 5, linkQualityIn: 3, linkQualityOut: 3, routeCost: 1 }],
                },
                unknown: [],
            },
            { rloc16: 0x1400, unknown: [] },
        ];
        expect(missingRouterIds(responses)).to.deep.equal([]);
    });
});
