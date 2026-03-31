/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType, isConnectedChannel } from "#net/Channel.js";
import { MockTcpConnection } from "#net/mock/MockTcpConnection.js";
import { TcpChannel } from "#net/tcp/TcpChannel.js";
import { DEFAULT_MAX_TCP_MESSAGE_SIZE } from "#net/tcp/TcpConnection.js";
import { Bytes } from "#util/Bytes.js";

/** Build a 4-byte LE length header for the given payload length. */
function lengthHeader(len: number): Uint8Array {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, len, true);
    return buf;
}

/** Concatenate Uint8Arrays. */
function concat(...arrays: Uint8Array[]): Uint8Array {
    let total = 0;
    for (const a of arrays) total += a.length;
    const result = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        result.set(a, offset);
        offset += a.length;
    }
    return result;
}

/** Build a framed message (4-byte LE header + payload). */
function frame(payload: Uint8Array): Uint8Array {
    return concat(lengthHeader(payload.length), payload);
}

describe("TcpChannel", () => {
    function createPair() {
        const [client, server] = MockTcpConnection.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);
        return { client, server };
    }

    describe("send framing", () => {
        it("prepends 4-byte LE length header when sending", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(client);

            const received: Bytes[] = [];
            server.onData(data => received.push(data));

            const payload = Bytes.fromHex("deadbeef");
            await conn.send(payload);

            expect(received).length(1);
            const sent = Bytes.of(received[0]);
            // First 4 bytes = LE uint32 of payload length (4 bytes = 0x04000000 LE)
            const view = new DataView(sent.buffer, sent.byteOffset, sent.byteLength);
            expect(view.getUint32(0, true)).equals(4);
            expect(Bytes.toHex(sent.slice(4))).equals("deadbeef");

            await conn.close();
        });
    });

    describe("receive single complete message", () => {
        it("emits a complete message received in one chunk", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            const messages: Bytes[] = [];
            conn.onMessage(data => messages.push(data));

            const payload = Bytes.fromHex("cafebabe");
            await client.send(frame(Bytes.of(payload)));

            expect(messages).length(1);
            expect(Bytes.toHex(messages[0])).equals("cafebabe");

            await conn.close();
        });
    });

    describe("receive partial length header", () => {
        it("reassembles when length header is split across chunks", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            const messages: Bytes[] = [];
            conn.onMessage(data => messages.push(data));

            const payload = Bytes.fromHex("aabbccdd");
            const framed = frame(Bytes.of(payload));

            // Send first 2 bytes of the header
            await client.send(framed.slice(0, 2));
            expect(messages).length(0);

            // Send remaining header + payload
            await client.send(framed.slice(2));
            expect(messages).length(1);
            expect(Bytes.toHex(messages[0])).equals("aabbccdd");

            await conn.close();
        });
    });

    describe("receive multiple messages in one chunk", () => {
        it("emits multiple messages when concatenated in a single chunk", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            const messages: Bytes[] = [];
            conn.onMessage(data => messages.push(data));

            const payload1 = Bytes.fromHex("1111");
            const payload2 = Bytes.fromHex("2222");
            const combined = concat(frame(Bytes.of(payload1)), frame(Bytes.of(payload2)));

            await client.send(combined);

            expect(messages).length(2);
            expect(Bytes.toHex(messages[0])).equals("1111");
            expect(Bytes.toHex(messages[1])).equals("2222");

            await conn.close();
        });
    });

    describe("receive split payload", () => {
        it("reassembles when payload is split across chunks", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            const messages: Bytes[] = [];
            conn.onMessage(data => messages.push(data));

            const payload = Bytes.fromHex("0102030405060708");
            const framed = frame(Bytes.of(payload));

            // Send header + half of payload
            const splitPoint = 4 + 4; // 4-byte header + 4 bytes of 8-byte payload
            await client.send(framed.slice(0, splitPoint));
            expect(messages).length(0);

            // Send remaining payload
            await client.send(framed.slice(splitPoint));
            expect(messages).length(1);
            expect(Bytes.toHex(messages[0])).equals("0102030405060708");

            await conn.close();
        });
    });

    describe("channel properties", () => {
        it("reports correct channel type properties", async () => {
            const { server } = createPair();
            const conn = new TcpChannel(server);

            expect(conn.isReliable).equals(true);
            expect(conn.supportsLargeMessages).equals(true);
            expect(conn.type).equals(ChannelType.TCP);

            await conn.close();
        });

        it("is recognized as ConnectedChannel", async () => {
            const { server } = createPair();
            const conn = new TcpChannel(server);

            expect(isConnectedChannel(conn)).true;

            await conn.close();
        });
    });

    describe("networkAddress", () => {
        it("returns a ServerAddressTcp with correct values", async () => {
            const { server } = createPair();
            const conn = new TcpChannel(server);

            const addr = conn.networkAddress;
            expect(addr.type).equals("tcp");
            // server socket's remote is the client
            expect(addr.ip).equals("1.2.3.4");
            expect(addr.port).equals(5000);

            await conn.close();
        });
    });

    describe("name", () => {
        it("returns tcp:// formatted name", async () => {
            const { server } = createPair();
            const conn = new TcpChannel(server);
            expect(conn.name).equals("tcp://1.2.3.4:5000");

            await conn.close();
        });

        it("wraps IPv6 addresses in brackets", async () => {
            const [, server] = MockTcpConnection.createPair("::1", 5000, "::2", 6000);
            const conn = new TcpChannel(server);
            expect(conn.name).equals("tcp://[::1]:5000");

            await conn.close();
        });
    });

    describe("oversized message handling", () => {
        it("rejects message at the size limit", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            let closed = false;
            conn.onClose(() => {
                closed = true;
            });

            const messages: Bytes[] = [];
            conn.onMessage(data => messages.push(data));

            // Max message content = 64000 - 4 = 63996. Sending 64000 exceeds it.
            await client.send(lengthHeader(DEFAULT_MAX_TCP_MESSAGE_SIZE));

            expect(messages).length(0);
            expect(closed).true;
        });

        it("accepts message just under the size limit", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            let closed = false;
            conn.onClose(() => {
                closed = true;
            });

            const messages: Bytes[] = [];
            conn.onMessage(data => messages.push(data));

            // Max message content = DEFAULT_MAX_TCP_MESSAGE_SIZE - 4 (framing) = 63996
            // The check is >= so 63995 should be accepted (just under limit)
            const messageSize = DEFAULT_MAX_TCP_MESSAGE_SIZE - 4 - 1; // 63995
            const payload = new Uint8Array(messageSize);
            for (let i = 0; i < messageSize; i++) {
                payload[i] = i & 0xff;
            }

            await client.send(concat(lengthHeader(messageSize), payload));

            expect(messages).length(1);
            expect(Bytes.of(messages[0]).length).equals(messageSize);
            expect(closed).false;

            await conn.close();
        });

        it("rejects way-oversized message", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            let closed = false;
            conn.onClose(() => {
                closed = true;
            });

            const messages: Bytes[] = [];
            conn.onMessage(data => messages.push(data));

            // Send header claiming 100000 bytes
            await client.send(lengthHeader(100_000));

            expect(messages).length(0);
            expect(closed).true;
        });
    });

    describe("send-side size check", () => {
        it("rejects messages above the size limit", async () => {
            const { server } = createPair();
            const conn = new TcpChannel(server);

            // maxMessageSize = DEFAULT_MAX_TCP_MESSAGE_SIZE - 4 = 63996
            const oversized = new Uint8Array(conn.maxMessageSize + 1);

            let threw = false;
            try {
                await conn.send(oversized);
            } catch (e) {
                threw = true;
                expect((e as Error).message).to.include("exceeds TCP limit");
            }
            expect(threw).true;

            await conn.close();
        });

        it("accepts messages exactly at the size limit", async () => {
            const { server } = createPair();
            const conn = new TcpChannel(server);

            const atLimit = new Uint8Array(conn.maxMessageSize);

            // Should not throw — maxMessageSize is inclusive
            await conn.send(atLimit);

            await conn.close();
        });
    });

    describe("close", () => {
        it("closes the underlying socket", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            let clientClosed = false;
            client.onClose(() => {
                clientClosed = true;
            });

            await conn.close();
            expect(clientClosed).true;
        });

        it("fires close listeners", async () => {
            const { server } = createPair();
            const conn = new TcpChannel(server);

            let closed = false;
            conn.onClose(() => {
                closed = true;
            });

            await conn.close();
            expect(closed).true;
        });
    });

    describe("async iteration", () => {
        it("yields messages via for-await", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            const payload1 = Bytes.fromHex("aabb");
            const payload2 = Bytes.fromHex("ccdd");
            await client.send(frame(Bytes.of(payload1)));
            await client.send(frame(Bytes.of(payload2)));

            const messages: Bytes[] = [];
            const iterator = conn[Symbol.asyncIterator]();

            const result1 = await iterator.next();
            expect(result1.done).false;
            messages.push(result1.value);

            const result2 = await iterator.next();
            expect(result2.done).false;
            messages.push(result2.value);

            expect(messages).length(2);
            expect(Bytes.toHex(messages[0])).equals("aabb");
            expect(Bytes.toHex(messages[1])).equals("ccdd");

            await conn.close();
        });

        it("terminates iterator on close", async () => {
            const { server } = createPair();
            const conn = new TcpChannel(server);

            const iterator = conn[Symbol.asyncIterator]();

            // Close before any messages — next() should return done
            await conn.close();

            const result = await iterator.next();
            expect(result.done).true;
        });

        it("terminates iterator on remote disconnect", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            const iterator = conn[Symbol.asyncIterator]();

            // Simulate remote disconnect
            await client.close();

            const result = await iterator.next();
            expect(result.done).true;
        });

        it("delivers queued messages then terminates on close", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            // Send a message before iterating
            await client.send(frame(Bytes.of(Bytes.fromHex("1234"))));

            // Close after message is queued
            await client.close();

            const messages: Bytes[] = [];
            for await (const msg of conn) {
                messages.push(msg);
            }

            expect(messages).length(1);
            expect(Bytes.toHex(messages[0])).equals("1234");
        });

        it("works alongside callback listeners", async () => {
            const { client, server } = createPair();
            const conn = new TcpChannel(server);

            const callbackMessages: Bytes[] = [];
            conn.onMessage(data => callbackMessages.push(data));

            await client.send(frame(Bytes.of(Bytes.fromHex("5678"))));

            // Both callback and iterator should receive the message
            const iterator = conn[Symbol.asyncIterator]();
            const result = await iterator.next();

            expect(callbackMessages).length(1);
            expect(result.done).false;
            expect(Bytes.toHex(callbackMessages[0])).equals("5678");
            expect(Bytes.toHex(result.value)).equals("5678");

            await conn.close();
        });
    });
});
