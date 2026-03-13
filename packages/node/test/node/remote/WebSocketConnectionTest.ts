/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteResponse } from "#behavior/system/remote/api/RemoteResponse.js";
import type { StateStream } from "#node/integration/StateStream.js";
import { WebSocketConnection } from "#node/remote/WebSocketConnection.js";
import { Environment, MockWsConnection, WebSocketClient } from "@matter/general";

const { send, receive } = MockWsConnection;

function mockEnv(pair: MockWsConnection.Pair) {
    const env = new Environment("test");
    const client = new WebSocketClient();
    client.connect = async () => pair.client;
    env.set(WebSocketClient, client);
    return env;
}

/**
 * Close a WebSocketConnection cleanly.  The server writable must close first so the mock pipe unblocks the read loop.
 */
async function closeConnection(connection: WebSocketConnection, pair: MockWsConnection.Pair) {
    await pair.server.writable.close();
    await connection.close();
}

describe("WebSocketConnection", () => {
    it("sends requests and receives responses", async () => {
        const pair = MockWsConnection();

        const connection = new WebSocketConnection("ws://test", mockEnv(pair));
        await connection.open();

        // Start the request (don't await yet — we need to respond from the server side)
        const requestPromise = connection.request({ method: "read", target: "parts/light/onOff/onOff" });

        // Read the request from the server side
        const request = await receive(pair.server);
        expect(request.method).equals("read");
        expect(request.target).equals("parts/light/onOff/onOff");
        expect(request.id).a("string");

        // Send a response
        await send(pair.server, { kind: "value", id: request.id, value: false } satisfies RemoteResponse.Value);

        const response = await requestPromise;
        expect(response.kind).equals("value");
        expect((response as RemoteResponse.Value).value).equals(false);

        await closeConnection(connection, pair);
    });

    it("handles error responses", async () => {
        const pair = MockWsConnection();

        const connection = new WebSocketConnection("ws://test", mockEnv(pair));
        await connection.open();

        const requestPromise = connection.request({ method: "read", target: "nonexistent" });

        const request = await receive(pair.server);
        await send(pair.server, {
            kind: "error",
            id: request.id,
            code: "not-found",
            message: 'Target "nonexistent" not found',
        } satisfies RemoteResponse.Error);

        await expect(requestPromise).rejectedWith('Target "nonexistent" not found');

        await closeConnection(connection, pair);
    });

    it("handles subscriptions", async () => {
        const pair = MockWsConnection();

        const connection = new WebSocketConnection("ws://test", mockEnv(pair));
        await connection.open();

        const updates = Array<RemoteResponse>();

        const subscribePromise = connection.subscribe({ method: "subscribe", target: "changes" }, response => {
            updates.push(response);
        });

        // Read the subscribe request from the server side
        const request = await receive(pair.server);
        expect(request.method).equals("subscribe");
        expect(request.target).equals("changes");

        // Send the initial "ok" acknowledgement
        await send(pair.server, { kind: "ok", id: request.id } satisfies RemoteResponse.OK);

        const okResponse = await subscribePromise;
        expect(okResponse.kind).equals("ok");

        // Now send subscription updates using the same id
        await send(pair.server, {
            kind: "update",
            id: request.id,
            node: "test",
            endpoint: 0,
            version: 1,
            behavior: "onOff",
            changes: { onOff: true },
        });

        // Allow microtask processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(updates).length(1);
        expect(updates[0].kind).equals("update");

        const update = updates[0] as unknown as StateStream.WireUpdate;
        expect(update.node).equals("test");
        expect(update.endpoint).equals(0);
        expect(update.behavior).equals("onOff");
        expect(update.changes).deep.equals({ onOff: true });

        // Send another update
        await send(pair.server, {
            kind: "update",
            id: request.id,
            node: "test",
            endpoint: 1,
            version: 2,
            behavior: "descriptor",
            changes: { partsList: [1, 2] },
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(updates).length(2);

        await closeConnection(connection, pair);
    });

    it("correlates responses by id", async () => {
        const pair = MockWsConnection();

        const connection = new WebSocketConnection("ws://test", mockEnv(pair));
        await connection.open();

        // Send first request and let its send complete before starting the second
        const promise1 = connection.request({ method: "read", target: "a" });
        const req1 = await receive(pair.server);

        const promise2 = connection.request({ method: "read", target: "b" });
        const req2 = await receive(pair.server);

        // Respond in reverse order to verify id-based correlation
        await send(pair.server, { kind: "value", id: req2.id, value: "second" });
        await send(pair.server, { kind: "value", id: req1.id, value: "first" });

        const [resp1, resp2] = await Promise.all([promise1, promise2]);
        expect((resp1 as RemoteResponse.Value).value).equals("first");
        expect((resp2 as RemoteResponse.Value).value).equals("second");

        await closeConnection(connection, pair);
    });
});
