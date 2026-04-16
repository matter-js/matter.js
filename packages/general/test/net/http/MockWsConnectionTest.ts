/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpEndpoint } from "#net/http/HttpEndpoint.js";
import { MockWsConnection } from "#net/http/MockWsConnection.js";
import { Bytes } from "#util/Bytes.js";

const { send, receive } = MockWsConnection;

/**
 * Read a raw (unparsed) message from a WsConnection readable.
 */
async function receiveRaw(connection: HttpEndpoint.WsConnection) {
    const reader = connection.readable.getReader();
    try {
        const result = await reader.read();
        expect(result.done).false;
        return result.value!;
    } finally {
        reader.releaseLock();
    }
}

/**
 * Assert the readable signals end-of-stream.
 */
async function expectEnd(connection: HttpEndpoint.WsConnection) {
    const reader = connection.readable.getReader();
    try {
        const result = await reader.read();
        expect(result.done).true;
    } finally {
        reader.releaseLock();
    }
}

describe("MockWsConnection", () => {
    it("pipes messages between client and server", async () => {
        const { client, server } = MockWsConnection();

        await send(client, { hello: "server" });
        expect(await receive(server)).deep.equals({ hello: "server" });

        await send(server, { hello: "client" });
        expect(await receive(client)).deep.equals({ hello: "client" });

        await client.writable.close();
        await server.writable.close();
    });

    it("handles multiple messages in sequence", async () => {
        const { client, server } = MockWsConnection();

        await send(client, { n: 1 });
        await send(client, { n: 2 });
        await send(client, { n: 3 });

        expect(await receive(server)).deep.equals({ n: 1 });
        expect(await receive(server)).deep.equals({ n: 2 });
        expect(await receive(server)).deep.equals({ n: 3 });

        await client.writable.close();
        await server.writable.close();
    });

    it("closes readable when writable closes", async () => {
        const { client, server } = MockWsConnection();

        await send(client, { final: true });
        await client.writable.close();

        expect(await receive(server)).deep.equals({ final: true });
        await expectEnd(server);

        await server.writable.close();
    });

    it("passes string messages through unchanged", async () => {
        const { client, server } = MockWsConnection();

        const writer = client.writable.getWriter();
        await writer.write("plain text");
        writer.releaseLock();

        const raw = await receiveRaw(server);
        expect(typeof raw).equals("string");
        expect(raw).equals("plain text");

        await client.writable.close();
        await server.writable.close();
    });

    it("passes binary messages through unchanged", async () => {
        const { client, server } = MockWsConnection();

        const binary = Bytes.fromHex("deadbeef");
        const writer = client.writable.getWriter();
        await writer.write(binary);
        writer.releaseLock();

        const raw = await receiveRaw(server);
        expect(Bytes.toHex(raw as Bytes)).equals("deadbeef");

        await client.writable.close();
        await server.writable.close();
    });

    it("supports bidirectional interleaved traffic", async () => {
        const { client, server } = MockWsConnection();

        await send(client, { dir: "c2s", seq: 1 });
        await send(server, { dir: "s2c", seq: 1 });
        await send(client, { dir: "c2s", seq: 2 });
        await send(server, { dir: "s2c", seq: 2 });

        expect(await receive(server)).deep.equals({ dir: "c2s", seq: 1 });
        expect(await receive(client)).deep.equals({ dir: "s2c", seq: 1 });
        expect(await receive(server)).deep.equals({ dir: "c2s", seq: 2 });
        expect(await receive(client)).deep.equals({ dir: "s2c", seq: 2 });

        await client.writable.close();
        await server.writable.close();
    });

    it("abort signals end of stream", async () => {
        const { client, server } = MockWsConnection();

        await client.writable.abort();

        // Server readable should end since nothing was buffered
        await expectEnd(server);

        await server.writable.close();
    });
});
