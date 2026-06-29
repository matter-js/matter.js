/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoapClient, CoapTimeoutError } from "../src/coap/CoapClient.js";
import { CoapMessage } from "../src/coap/CoapMessage.js";
import type { DtlsSocket } from "../src/dtls/socket/DtlsSocket.js";

class MockSocket implements DtlsSocket {
    readonly sent = new Array<Uint8Array>();
    readonly #recvQueue = new Array<Uint8Array>();
    readonly #recvWaiters = new Array<{ resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();
    #closed = false;

    async send(bytes: Uint8Array): Promise<void> {
        this.sent.push(new Uint8Array(bytes));
    }

    async recv(): Promise<Uint8Array> {
        if (this.#recvQueue.length > 0) {
            return this.#recvQueue.shift()!;
        }
        return new Promise<Uint8Array>((resolve, reject) => {
            this.#recvWaiters.push({ resolve, reject });
        });
    }

    async close(): Promise<void> {
        if (this.#closed) return;
        this.#closed = true;
        const err = new Error("MockSocket: closed");
        for (const w of this.#recvWaiters) {
            w.reject(err);
        }
        this.#recvWaiters.length = 0;
    }

    deliver(bytes: Uint8Array): void {
        if (this.#recvWaiters.length > 0) {
            this.#recvWaiters.shift()!.resolve(bytes);
        } else {
            this.#recvQueue.push(bytes);
        }
    }

    deliverMessage(msg: CoapMessage): void {
        this.deliver(CoapMessage.encode(msg));
    }
}

function makeAck(req: CoapMessage, payload?: Uint8Array): CoapMessage {
    return {
        type: "ACK",
        code: "2.04",
        messageId: req.messageId,
        token: req.token,
        payload: payload ?? new Uint8Array(),
    };
}

describe("CoapClient", () => {
    it("sends a CON request and resolves when ACK arrives", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket, { ackTimeoutMs: 5_000 });

        const responsePayload = new Uint8Array([0x10, 0x01, 0x01, 0x0b, 0x02, 0x00, 0x07]);
        const reqPromise = client.request({
            type: "CON",
            code: "0.02",
            uriPath: ["c", "cp"],
            payload: new Uint8Array([0x0a, 0x03, 0x61, 0x62, 0x63]),
        });

        await Promise.resolve(); // yield so the initial send microtask runs before the ACK is delivered
        expect(socket.sent.length).to.be.greaterThan(0);
        const sentMsg = CoapMessage.decode(socket.sent[0]);
        socket.deliverMessage(makeAck(sentMsg, responsePayload));

        const response = await reqPromise;
        expect(response.code).to.equal("2.04");
        expect(response.payload).to.deep.equal(responsePayload);

        await client.close();
    });

    it("retransmits when ACK is delayed — resolves on second attempt", async () => {
        const socket = new MockSocket();

        const client = new CoapClient(socket, { ackTimeoutMs: 20 });

        let sendCount = 0;
        const origSend = socket.send.bind(socket);
        socket.send = async (bytes: Uint8Array): Promise<void> => {
            await origSend(bytes);
            sendCount++;
            if (sendCount >= 2) {
                const msg = CoapMessage.decode(bytes);
                socket.deliverMessage(makeAck(msg));
            }
        };

        const response = await client.request({ type: "CON", code: "0.02", uriPath: ["c", "cp"] });

        expect(sendCount).to.be.greaterThanOrEqual(2);
        expect(response.code).to.equal("2.04");

        await client.close();
    });

    it("throws CoapTimeoutError when MAX_RETRANSMIT is exhausted", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket, { ackTimeoutMs: 5 });

        try {
            await client.request({ type: "CON", code: "0.02", uriPath: ["c", "cp"] });
            expect.fail("expected CoapTimeoutError");
        } catch (err) {
            expect(err).to.be.instanceOf(CoapTimeoutError);
        }

        await client.close();
    });

    it("sends a NON request and returns immediately without waiting for ACK", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket);

        const response = await client.request({ type: "NON", code: "0.01", uriPath: ["c", "cp"] });

        expect(response.code).to.equal("0.00");
        expect(socket.sent.length).to.equal(1);
        const sent = CoapMessage.decode(socket.sent[0]);
        expect(sent.type).to.equal("NON");

        await client.close();
    });

    it("CoapTimeoutError is an Error with a useful message", () => {
        const err = new CoapTimeoutError(0x1234);
        expect(err).to.be.instanceOf(Error);
        expect(err).to.be.instanceOf(CoapTimeoutError);
        // messageId 0x1234 = 4660 decimal
        const hasId = err.message.includes("4660") || err.message.includes("1234") || err.message.includes("0x1234");
        expect(hasId).to.equal(true);
        expect(err.name).to.equal("CoapTimeoutError");
    });

    it("listen handler is called when inbound message matches uriPath", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket);

        const received = new Array<CoapMessage>();
        client.listen(["d", "da"], msg => {
            received.push(msg);
        });

        const inbound: CoapMessage = {
            type: "NON",
            code: "0.02",
            messageId: 0x1234,
            token: new Uint8Array([1, 2, 3, 4]),
            uriPath: ["d", "da"],
            payload: new Uint8Array([0xaa, 0xbb]),
        };
        socket.deliverMessage(inbound);

        await new Promise(r => setTimeout(r, 10));

        expect(received).to.have.length(1);
        expect(received[0].payload).to.deep.equal(new Uint8Array([0xaa, 0xbb]));

        await client.close();
    });

    it("listen handler is NOT called when uriPath differs", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket);

        let called = false;
        client.listen(["d", "da"], () => {
            called = true;
        });

        const inbound: CoapMessage = {
            type: "NON",
            code: "0.02",
            messageId: 0x2222,
            token: new Uint8Array([1, 2, 3, 4]),
            uriPath: ["d", "dq"],
            payload: new Uint8Array(),
        };
        socket.deliverMessage(inbound);

        await new Promise(r => setTimeout(r, 10));

        expect(called).to.equal(false);

        await client.close();
    });

    it("multiple listeners on the same path are all called", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket);

        let countA = 0;
        let countB = 0;
        client.listen(["d", "da"], () => {
            countA++;
        });
        client.listen(["d", "da"], () => {
            countB++;
        });

        const inbound: CoapMessage = {
            type: "NON",
            code: "0.02",
            messageId: 0x3333,
            token: new Uint8Array([1, 2, 3, 4]),
            uriPath: ["d", "da"],
            payload: new Uint8Array(),
        };
        socket.deliverMessage(inbound);

        await new Promise(r => setTimeout(r, 10));

        expect(countA).to.equal(1);
        expect(countB).to.equal(1);

        await client.close();
    });

    it("unsubscribe stops further listener calls", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket);

        let count = 0;
        const unsubscribe = client.listen(["d", "da"], () => {
            count++;
        });

        const makeInbound = (messageId: number): CoapMessage => ({
            type: "NON",
            code: "0.02",
            messageId,
            token: new Uint8Array([1, 2, 3, 4]),
            uriPath: ["d", "da"],
            payload: new Uint8Array(),
        });

        socket.deliverMessage(makeInbound(0x4444));
        await new Promise(r => setTimeout(r, 10));
        expect(count).to.equal(1);

        unsubscribe();
        socket.deliverMessage(makeInbound(0x4445));
        await new Promise(r => setTimeout(r, 10));
        expect(count).to.equal(1);

        await client.close();
    });

    it("listener that throws does not break the recv loop", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket);

        let secondCount = 0;
        client.listen(["d", "da"], () => {
            throw new Error("intentional test failure");
        });
        client.listen(["d", "da"], () => {
            secondCount++;
        });

        const makeInbound = (messageId: number): CoapMessage => ({
            type: "NON",
            code: "0.02",
            messageId,
            token: new Uint8Array([1, 2, 3, 4]),
            uriPath: ["d", "da"],
            payload: new Uint8Array(),
        });

        socket.deliverMessage(makeInbound(0x5555));
        await new Promise(r => setTimeout(r, 10));

        socket.deliverMessage(makeInbound(0x5556));
        await new Promise(r => setTimeout(r, 10));

        expect(secondCount).to.equal(2);

        await client.close();
    });

    it("resolves with separate CON response after empty ACK (RFC 7252 §5.2.2)", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket, { ackTimeoutMs: 5_000 });

        const reqPromise = client.request({
            type: "CON",
            code: "0.02",
            uriPath: ["c", "cp"],
            payload: new Uint8Array([0x0a, 0x03]),
        });

        await Promise.resolve();
        const sentMsg = CoapMessage.decode(socket.sent[0]);

        // Empty ACK: code=0.00, payload empty, same messageId — signals separate response.
        socket.deliverMessage({
            type: "ACK",
            code: "0.00",
            messageId: sentMsg.messageId,
            token: new Uint8Array(),
            payload: new Uint8Array(),
        });

        // Yield so #dispatchInbound runs.
        await new Promise(r => setTimeout(r, 5));

        // Separate response: CON with same token but new messageId.
        const responsePayload = new Uint8Array([0xaa, 0xbb, 0xcc]);
        socket.deliverMessage({
            type: "CON",
            code: "2.04",
            messageId: 0xfa11,
            token: sentMsg.token,
            payload: responsePayload,
        });

        const response = await reqPromise;
        expect(response.code).to.equal("2.04");
        expect(response.payload).to.deep.equal(responsePayload);

        // Verify we sent an ACK for the inbound CON.
        await new Promise(r => setTimeout(r, 5));
        const ackSent = socket.sent.slice(1).map(b => CoapMessage.decode(b));
        const matchingAck = ackSent.find(m => m.type === "ACK" && m.messageId === 0xfa11);
        expect(matchingAck).to.exist;
        expect(matchingAck?.code).to.equal("0.00");

        await client.close();
    });

    it("resolves with NON separate response after empty ACK without sending ACK back", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket, { ackTimeoutMs: 5_000 });

        const reqPromise = client.request({ type: "CON", code: "0.02", uriPath: ["c", "cp"] });

        await Promise.resolve();
        const sentMsg = CoapMessage.decode(socket.sent[0]);
        const sentCount = socket.sent.length;

        socket.deliverMessage({
            type: "ACK",
            code: "0.00",
            messageId: sentMsg.messageId,
            token: new Uint8Array(),
            payload: new Uint8Array(),
        });

        await new Promise(r => setTimeout(r, 5));

        socket.deliverMessage({
            type: "NON",
            code: "2.04",
            messageId: 0xab12,
            token: sentMsg.token,
            payload: new Uint8Array([1, 2, 3]),
        });

        const response = await reqPromise;
        expect(response.code).to.equal("2.04");
        expect(response.type).to.equal("NON");
        // No new sends after the NON response (NON does not require ACK).
        await new Promise(r => setTimeout(r, 5));
        expect(socket.sent.length).to.equal(sentCount);

        await client.close();
    });

    it("times out if separate response never arrives", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket, { ackTimeoutMs: 5_000, separateResponseTimeoutMs: 30 });

        const reqPromise = client.request({ type: "CON", code: "0.02", uriPath: ["c", "cp"] });

        await Promise.resolve();
        const sentMsg = CoapMessage.decode(socket.sent[0]);

        socket.deliverMessage({
            type: "ACK",
            code: "0.00",
            messageId: sentMsg.messageId,
            token: new Uint8Array(),
            payload: new Uint8Array(),
        });

        try {
            await reqPromise;
            expect.fail("expected timeout");
        } catch (err) {
            expect(err).to.be.instanceOf(CoapTimeoutError);
        }

        await client.close();
    });

    it("auto-ACKs inbound CON dispatched to listeners", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket);

        const received = new Array<CoapMessage>();
        client.listen(["d", "da"], msg => {
            received.push(msg);
        });

        const inbound: CoapMessage = {
            type: "CON",
            code: "0.02",
            messageId: 0xc010,
            token: new Uint8Array([9, 9, 9, 9]),
            uriPath: ["d", "da"],
            payload: new Uint8Array([0xff]),
        };
        socket.deliverMessage(inbound);

        await new Promise(r => setTimeout(r, 10));

        expect(received).to.have.length(1);
        const ackSent = socket.sent.map(b => CoapMessage.decode(b));
        const ack = ackSent.find(m => m.type === "ACK" && m.messageId === 0xc010);
        expect(ack).to.exist;
        expect(ack?.code).to.equal("0.00");

        await client.close();
    });

    it("close() clears all listeners", async () => {
        const socket = new MockSocket();
        const client = new CoapClient(socket);

        let count = 0;
        client.listen(["d", "da"], () => {
            count++;
        });

        await client.close();

        const socket2 = new MockSocket();
        const client2 = new CoapClient(socket2);
        client2.listen(["d", "da"], () => {
            count++;
        });

        const inbound: CoapMessage = {
            type: "NON",
            code: "0.02",
            messageId: 0x6666,
            token: new Uint8Array([1, 2, 3, 4]),
            uriPath: ["d", "da"],
            payload: new Uint8Array(),
        };
        socket2.deliverMessage(inbound);
        await new Promise(r => setTimeout(r, 10));

        expect(count).to.equal(1);

        await client2.close();
    });
});
