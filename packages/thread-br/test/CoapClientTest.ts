/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Environment, type Transport } from "@matter/general";
import { CoapClient, CoapTimeoutError } from "../src/coap/CoapClient.js";
import { CoapMessage } from "../src/coap/CoapMessage.js";
import type { DtlsChannel } from "../src/dtls/channel/DtlsChannel.js";

class MockChannel implements DtlsChannel {
    readonly sent = new Array<Uint8Array>();
    readonly #queue = new Array<Bytes>();
    #waiter: { resolve: (result: IteratorResult<Bytes>) => void } | undefined;
    #closed = false;
    readonly #closeListeners = new Set<() => void>();

    async send(bytes: Bytes): Promise<void> {
        this.sent.push(Uint8Array.from(Bytes.of(bytes)));
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return {
            next: (): Promise<IteratorResult<Bytes>> => {
                if (this.#queue.length > 0) {
                    return Promise.resolve({ value: this.#queue.shift()!, done: false });
                }
                if (this.#closed) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise<IteratorResult<Bytes>>(resolve => {
                    this.#waiter = { resolve };
                });
            },
        };
    }

    onClose(listener: () => void): Transport.Listener {
        this.#closeListeners.add(listener);
        return {
            close: async () => {
                this.#closeListeners.delete(listener);
            },
        };
    }

    async close(): Promise<void> {
        if (this.#closed) return;
        this.#closed = true;
        const waiter = this.#waiter;
        this.#waiter = undefined;
        waiter?.resolve({ value: undefined, done: true });
        for (const listener of this.#closeListeners) {
            listener();
        }
    }

    deliver(bytes: Uint8Array): void {
        const waiter = this.#waiter;
        if (waiter !== undefined) {
            this.#waiter = undefined;
            waiter.resolve({ value: bytes, done: false });
        } else {
            this.#queue.push(bytes);
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

const environment = new Environment("test", Environment.default);

describe("CoapClient", () => {
    before(MockTime.enable);

    it("sends a CON request and resolves when ACK arrives", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment, { ackTimeoutMs: 5_000 });

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
        const socket = new MockChannel();

        const client = new CoapClient(socket, environment, { ackTimeoutMs: 20 });

        let sendCount = 0;
        const origSend = socket.send.bind(socket);
        socket.send = async (bytes: Bytes): Promise<void> => {
            await origSend(bytes);
            sendCount++;
            if (sendCount >= 2) {
                const msg = CoapMessage.decode(Bytes.of(bytes));
                socket.deliverMessage(makeAck(msg));
            }
        };

        const reqPromise = client.request({ type: "CON", code: "0.02", uriPath: ["c", "cp"] });

        // Yield so the initial socket.send() and its .then() (which arms the retransmit timer) complete.
        await MockTime.yield();
        // Advance past the max initial delay (ackTimeoutMs * RFC_ACK_RANDOM_FACTOR = 20 * 1.5 = 30ms) to fire the timer.
        await MockTime.advance(30);
        // Yield so the timer callback's socket.send() resolves and the recv loop processes the ACK.
        await MockTime.yield();

        const response = await reqPromise;

        expect(sendCount).to.be.greaterThanOrEqual(2);
        expect(response.code).to.equal("2.04");

        await client.close();
    });

    it("throws CoapTimeoutError when MAX_RETRANSMIT is exhausted", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment, { ackTimeoutMs: 5 });

        const reqPromise = client.request({ type: "CON", code: "0.02", uriPath: ["c", "cp"] });

        // Yield so the initial send and its .then() run, arming the first retransmit timer.
        await MockTime.yield();
        // Advance enough to fire all 5 timer callbacks (4 retransmits + final reject).
        // Max total time: 7.5 + 15 + 30 + 60 + 80 = 192.5ms (ackTimeoutMs=5, cap=5*2^4=80).
        await MockTime.advance(200);
        // Yield so any pending microtasks (socket.send in timer callbacks) settle.
        await MockTime.yield();

        try {
            await reqPromise;
            expect.fail("expected CoapTimeoutError");
        } catch (err) {
            expect(err).to.be.instanceOf(CoapTimeoutError);
        }

        await client.close();
    });

    it("sends a NON request and returns immediately without waiting for ACK", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment);

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
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment);

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

        await MockTime.yield3();

        expect(received).to.have.length(1);
        expect(received[0].payload).to.deep.equal(new Uint8Array([0xaa, 0xbb]));

        await client.close();
    });

    it("listen handler is NOT called when uriPath differs", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment);

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

        await MockTime.yield3();

        expect(called).to.equal(false);

        await client.close();
    });

    it("multiple listeners on the same path are all called", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment);

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

        await MockTime.yield3();

        expect(countA).to.equal(1);
        expect(countB).to.equal(1);

        await client.close();
    });

    it("unsubscribe stops further listener calls", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment);

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
        await MockTime.yield3();
        expect(count).to.equal(1);

        unsubscribe();
        socket.deliverMessage(makeInbound(0x4445));
        await MockTime.yield3();
        expect(count).to.equal(1);

        await client.close();
    });

    it("listener that throws does not break the recv loop", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment);

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
        await MockTime.yield3();

        socket.deliverMessage(makeInbound(0x5556));
        await MockTime.yield3();

        expect(secondCount).to.equal(2);

        await client.close();
    });

    it("resolves with separate CON response after empty ACK (RFC 7252 §5.2.2)", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment, { ackTimeoutMs: 5_000 });

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

        // Yield so #dispatchInbound runs and onEmptyAck arms the separate-response timer.
        await MockTime.yield();

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
        await MockTime.yield();
        const ackSent = socket.sent.slice(1).map(b => CoapMessage.decode(b));
        const matchingAck = ackSent.find(m => m.type === "ACK" && m.messageId === 0xfa11);
        expect(matchingAck).to.exist;
        expect(matchingAck?.code).to.equal("0.00");

        await client.close();
    });

    it("resolves with NON separate response after empty ACK without sending ACK back", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment, { ackTimeoutMs: 5_000 });

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

        await MockTime.yield();

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
        await MockTime.yield();
        expect(socket.sent.length).to.equal(sentCount);

        await client.close();
    });

    it("times out if separate response never arrives", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment, { ackTimeoutMs: 5_000, separateResponseTimeoutMs: 30 });

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

        // Yield so #dispatchInbound runs and the separate-response timer is armed.
        await MockTime.yield();
        // Advance past the separate-response timeout (30ms) to fire the rejection timer.
        await MockTime.advance(30);

        try {
            await reqPromise;
            expect.fail("expected timeout");
        } catch (err) {
            expect(err).to.be.instanceOf(CoapTimeoutError);
        }

        await client.close();
    });

    it("auto-ACKs inbound CON dispatched to listeners", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment);

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

        // CON path: recv loop → sendEmptyAck (one extra await) → dispatchToListeners.
        await MockTime.yield3();
        await MockTime.yield3();

        expect(received).to.have.length(1);
        const ackSent = socket.sent.map(b => CoapMessage.decode(b));
        const ack = ackSent.find(m => m.type === "ACK" && m.messageId === 0xc010);
        expect(ack).to.exist;
        expect(ack?.code).to.equal("0.00");

        await client.close();
    });

    it("close() clears all listeners", async () => {
        const socket = new MockChannel();
        const client = new CoapClient(socket, environment);

        let count = 0;
        client.listen(["d", "da"], () => {
            count++;
        });

        await client.close();

        const socket2 = new MockChannel();
        const client2 = new CoapClient(socket2, environment);
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
        await MockTime.yield3();

        expect(count).to.equal(1);

        await client2.close();
    });
});
