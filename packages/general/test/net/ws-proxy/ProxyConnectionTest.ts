/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Installs the platform Time implementation; no other module in this test's import graph does
import "#index.js";

import { ImplementationError } from "#MatterError.js";
import type { HttpEndpoint } from "#net/http/HttpEndpoint.js";
import { MockWsConnection } from "#net/http/MockWsConnection.js";
import { NetworkError } from "#net/Network.js";
import { ProxyConnection } from "#net/ws-proxy/ProxyConnection.js";
import { decodeProxyFrame, encodeProxyFrame, type ProxyFrame } from "#net/ws-proxy/ProxyFrame.js";
import { ProxyCommandError, ProxyConnectionClosedError } from "#net/ws-proxy/ProxyMessage.js";
import { Millis, Seconds } from "#time/TimeUnit.js";
import { Bytes } from "#util/Bytes.js";
import type { Observable } from "#util/Observable.js";

const VERSION = 1;

const { send, receive } = MockWsConnection;

async function receiveFrame(connection: HttpEndpoint.WsConnection) {
    const reader = connection.readable.getReader();
    try {
        const result = await reader.read();
        expect(result.done).false;
        return decodeProxyFrame(Bytes.of(result.value as Bytes));
    } finally {
        reader.releaseLock();
    }
}

async function sendBytes(connection: HttpEndpoint.WsConnection, bytes: Uint8Array) {
    const writer = connection.writable.getWriter();
    try {
        await writer.write(bytes);
    } finally {
        writer.releaseLock();
    }
}

async function sendRaw(connection: HttpEndpoint.WsConnection, message: string) {
    const writer = connection.writable.getWriter();
    try {
        await writer.write(message);
    } finally {
        writer.releaseLock();
    }
}

async function expectEnd(connection: HttpEndpoint.WsConnection) {
    const reader = connection.readable.getReader();
    try {
        expect((await reader.read()).done).true;
    } finally {
        reader.releaseLock();
    }
}

function nextEmit(observable: Observable<[]>) {
    return new Promise<void>(resolve => observable.on(() => resolve()));
}

function settlement<T>(promise: Promise<T>) {
    return promise.then(
        () => undefined,
        (error: unknown) => error,
    );
}

/**
 * A connection whose inbound stream can be errored and whose outbound stream can be made to fail, which
 * {@link MockWsConnection} cannot do but a real WebSocket does.
 */
function faultyConnection() {
    let inbound: ReadableStreamDefaultController<HttpEndpoint.WsMessage>;
    let writesFail = false;
    const written = new Array<HttpEndpoint.WsMessage>();

    const connection: HttpEndpoint.WsConnection = {
        readable: new ReadableStream<HttpEndpoint.WsMessage>({
            start(controller) {
                inbound = controller;
            },
        }),

        writable: new WritableStream<HttpEndpoint.WsMessage>({
            write(chunk) {
                if (writesFail) {
                    throw new NetworkError("Simulated transport failure");
                }
                written.push(chunk);
            },
        }),
    };

    return {
        connection,
        written,
        deliver: (message: object) => inbound.enqueue(JSON.stringify(message)),
        breakInbound: () => inbound.error(new NetworkError("Simulated inbound failure")),
        breakOutbound: () => (writesFail = true),
    };
}

/**
 * Create a responder that has completed its handshake, plus the far side of the connection.
 */
async function connectResponder(options?: Partial<ProxyConnection.Options>) {
    const { client, server } = MockWsConnection();
    const connection = new ProxyConnection({
        connection: server,
        version: VERSION,
        role: "responder",
        ...options,
    });
    connection.start();

    await send(client, { type: "hello", version: VERSION });
    expect(await receive(client)).deep.equals({ type: "hello_response", version: VERSION });
    expect(connection.connected).true;

    return { client, connection };
}

describe("ProxyConnection", () => {
    before(() => MockTime.enable());

    describe("handshake", () => {
        it("completes the responder handshake", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });
            const completed = nextEmit(connection.handshakeCompleted);

            connection.start();
            expect(connection.connected).false;

            await send(client, { type: "hello", version: VERSION });

            expect(await receive(client)).deep.equals({ type: "hello_response", version: VERSION });
            await completed;
            expect(connection.connected).true;

            await connection.close();
        });

        it("rejects an unsupported responder version", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });
            const closed = nextEmit(connection.closed);

            connection.start();
            await send(client, { type: "hello", version: 99 });

            expect(await receive(client)).deep.equals({
                type: "hello_response",
                version: VERSION,
                error: "unsupported_version",
                message: "Server supports protocol version 1, client sent version 99",
            });

            await closed;
            expect(connection.connected).false;
            await expectEnd(client);
        });

        it("closes when the first responder message is not a hello", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });
            const closed = nextEmit(connection.closed);

            connection.start();
            await send(client, { type: "something-else" });

            await closed;
            expect(connection.connected).false;
            await expectEnd(client);
        });

        it("completes the initiator handshake", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: client, version: VERSION, role: "initiator" });
            const completed = nextEmit(connection.handshakeCompleted);

            connection.start();

            expect(await receive(server)).deep.equals({ type: "hello", version: VERSION });

            await send(server, { type: "hello_response", version: VERSION });
            await completed;
            expect(connection.connected).true;

            await connection.close();
        });

        it("includes additive hello fields and omits absent ones", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({
                connection: client,
                version: VERSION,
                role: "initiator",
                hello: { role: "provider" },
            });

            connection.start();

            const hello = await receive(server);
            expect(hello).deep.equals({ type: "hello", version: VERSION, role: "provider" });
            expect("features" in hello).false;

            await connection.close();
        });

        it("closes when the initiator hello is rejected", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: client, version: VERSION, role: "initiator" });
            const closed = nextEmit(connection.closed);

            connection.start();
            expect(await receive(server)).deep.equals({ type: "hello", version: VERSION });

            await send(server, {
                type: "hello_response",
                version: VERSION,
                error: "unsupported_version",
                message: "nope",
            });

            await closed;
            expect(connection.connected).false;

            await connection.close();
        });

        it("closes when the handshake times out", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({
                connection: server,
                version: VERSION,
                role: "responder",
                handshakeTimeout: Seconds(1),
            });
            const closed = nextEmit(connection.closed);

            connection.start();
            await MockTime.advance(Seconds(1));

            await closed;
            expect(connection.connected).false;
            await expectEnd(client);
        });
    });

    describe("commands", () => {
        it("resolves a command with its result", async () => {
            const { client, connection } = await connectResponder();

            const result = connection.sendCommand("ping", { a: 1 });

            expect(await receive(client)).deep.equals({ id: 0, command: "ping", args: { a: 1 } });
            await send(client, { id: 0, success: true, result: { b: 2 } });

            expect(await result).deep.equals({ b: 2 });

            await connection.close();
        });

        it("increments command ids and omits absent args", async () => {
            const { client, connection } = await connectResponder();

            const first = connection.sendCommand("x");
            expect(await receive(client)).deep.equals({ id: 0, command: "x" });
            await send(client, { id: 0, success: true });
            expect(await first).undefined;

            const second = connection.sendCommand("y");
            expect(await receive(client)).deep.equals({ id: 1, command: "y" });
            await send(client, { id: 1, success: true });
            await second;

            await connection.close();
        });

        it("rejects a command with an error response", async () => {
            const { client, connection } = await connectResponder();

            const result = settlement(connection.sendCommand("boom"));
            expect(await receive(client)).deep.equals({ id: 0, command: "boom" });
            await send(client, { id: 0, success: false, error: "not_connected", message: "no peripheral" });

            const error = await result;
            expect(error).instanceOf(ProxyCommandError);
            expect((error as ProxyCommandError).code).equals("not_connected");
            expect((error as ProxyCommandError).message).equals("not_connected: no peripheral");

            await connection.close();
        });

        it("rejects and forgets a command that times out", async () => {
            const { client, connection } = await connectResponder({ commandTimeout: Millis(500) });

            const timedOut = settlement(connection.sendCommand("slow"));
            expect(await receive(client)).deep.equals({ id: 0, command: "slow" });

            await MockTime.advance(Millis(500));
            expect(await timedOut).instanceOf(Error);

            // The pending command is forgotten so the late response is ignored, and the connection remains usable
            await send(client, { id: 0, success: true, result: { late: true } });

            const next = connection.sendCommand("after");
            expect(await receive(client)).deep.equals({ id: 1, command: "after" });
            await send(client, { id: 1, success: true, result: { ok: true } });
            expect(await next).deep.equals({ ok: true });

            await connection.close();
        });

        it("ignores a response for an unknown command id", async () => {
            const { client, connection } = await connectResponder();

            await send(client, { id: 42, success: true, result: {} });

            const result = connection.sendCommand("still-alive");
            expect(await receive(client)).deep.equals({ id: 0, command: "still-alive" });
            await send(client, { id: 0, success: true });
            await result;

            await connection.close();
        });

        it("throws when sending a command while not connected", async () => {
            const { server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });

            await expect(connection.sendCommand("x")).rejectedWith(ProxyConnectionClosedError);

            await connection.close();
        });

        it("correlates concurrent commands answered out of order", async () => {
            const { client, connection } = await connectResponder();

            const first = connection.sendCommand("a");
            const second = settlement(connection.sendCommand("b"));
            const third = connection.sendCommand("c");

            expect(await receive(client)).deep.equals({ id: 0, command: "a" });
            expect(await receive(client)).deep.equals({ id: 1, command: "b" });
            expect(await receive(client)).deep.equals({ id: 2, command: "c" });

            await send(client, { id: 2, success: true, result: { n: 2 } });
            await send(client, { id: 0, success: true, result: { n: 0 } });
            await send(client, { id: 1, success: false, error: "bad", message: "nope" });

            expect(await first).deep.equals({ n: 0 });
            expect(await third).deep.equals({ n: 2 });
            expect(await second).instanceOf(ProxyCommandError);

            await connection.close();
        });

        it("rejects an error response that carries no code", async () => {
            const { client, connection } = await connectResponder();

            const result = settlement(connection.sendCommand("boom"));
            expect(await receive(client)).deep.equals({ id: 0, command: "boom" });
            await send(client, { id: 0, success: false });

            const error = await result;
            expect(error).instanceOf(ProxyCommandError);
            expect((error as ProxyCommandError).code).equals("unknown_error");

            await connection.close();
        });

        it("refuses to send anything before the handshake completes", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });
            connection.start();

            await expect(connection.sendCommand("x")).rejectedWith(ProxyConnectionClosedError);
            expect(() => connection.sendEvent("e", {})).throws(ProxyConnectionClosedError);
            expect(() => connection.sendFrame(1, 1, new Uint8Array(0))).throws(ProxyConnectionClosedError);

            await send(client, { type: "hello", version: VERSION });

            // Nothing reached the wire ahead of the hello response
            expect(await receive(client)).deep.equals({ type: "hello_response", version: VERSION });

            await connection.close();
        });

        it("rejects pending commands when the connection closes", async () => {
            const { client, connection } = await connectResponder();

            const result = connection.sendCommand("pending");
            expect(await receive(client)).deep.equals({ id: 0, command: "pending" });

            await connection.close();

            await expect(result).rejectedWith(ProxyConnectionClosedError);
        });

        it("emits closed exactly once across repeated closes", async () => {
            const { connection } = await connectResponder();

            let closeCount = 0;
            connection.closed.on(() => {
                closeCount++;
            });

            await connection.close();
            await connection.close();

            expect(closeCount).equals(1);
            expect(connection.connected).false;
        });
    });

    describe("command handler", () => {
        it("answers an inbound command with a result", async () => {
            const { client, connection } = await connectResponder();

            const invocations = new Array<[string, Record<string, unknown> | undefined]>();
            connection.setCommandHandler(async (command, args) => {
                invocations.push([command, args]);
                return { b: 2 };
            });

            await send(client, { id: 5, command: "ping", args: { a: 1 } });

            expect(await receive(client)).deep.equals({ id: 5, success: true, result: { b: 2 } });
            expect(invocations).deep.equals([["ping", { a: 1 }]]);

            await connection.close();
        });

        it("answers with the wire code of a ProxyCommandError", async () => {
            const { client, connection } = await connectResponder();

            connection.setCommandHandler(async () => {
                throw new ProxyCommandError("not_connected", "nope");
            });

            await send(client, { id: 5, command: "ping" });

            expect(await receive(client)).deep.equals({
                id: 5,
                success: false,
                error: "not_connected",
                message: "nope",
            });

            await connection.close();
        });

        it("answers with internal_error for an unexpected handler failure", async () => {
            const { client, connection } = await connectResponder();

            connection.setCommandHandler(async () => {
                throw new ProxyConnectionClosedError("kaboom");
            });

            await send(client, { id: 7, command: "ping" });

            expect(await receive(client)).deep.equals({
                id: 7,
                success: false,
                error: "internal_error",
                message: "kaboom",
            });

            await connection.close();
        });

        it("answers a handler that returns no result", async () => {
            const { client, connection } = await connectResponder();

            connection.setCommandHandler(async () => {});

            await send(client, { id: 8, command: "ping" });

            expect(await receive(client)).deep.equals({ id: 8, success: true });

            await connection.close();
        });

        it("answers with not_supported when no handler is installed", async () => {
            const { client, connection } = await connectResponder();

            await send(client, { id: 3, command: "ping" });

            expect(await receive(client)).deep.equals({
                id: 3,
                success: false,
                error: "not_supported",
                message: "Command ping is not supported",
            });

            await connection.close();
        });

        it("supports a handler that issues its own command", async () => {
            const { client, connection } = await connectResponder();

            connection.setCommandHandler(async command => {
                expect(command).equals("outer");
                const result = await connection.sendCommand("inner");
                return { echoed: result?.value };
            });

            await send(client, { id: 9, command: "outer" });

            expect(await receive(client)).deep.equals({ id: 0, command: "inner" });
            await send(client, { id: 0, success: true, result: { value: 7 } });

            expect(await receive(client)).deep.equals({ id: 9, success: true, result: { echoed: 7 } });

            await connection.close();
        });

        it("keeps serving commands while a handler is in flight", async () => {
            const { client, connection } = await connectResponder();

            let release: (() => void) | undefined;
            const blocked = new Promise<void>(resolve => (release = resolve));

            connection.setCommandHandler(async command => {
                if (command === "slow") {
                    await blocked;
                    return { slow: true };
                }
                return { fast: true };
            });

            await send(client, { id: 1, command: "slow" });
            await send(client, { id: 2, command: "fast" });

            expect(await receive(client)).deep.equals({ id: 2, success: true, result: { fast: true } });

            release?.();
            expect(await receive(client)).deep.equals({ id: 1, success: true, result: { slow: true } });

            await connection.close();
        });
    });

    describe("events", () => {
        it("sends events", async () => {
            const { client, connection } = await connectResponder();

            connection.sendEvent("scanResult", { address: "aa:bb" });

            expect(await receive(client)).deep.equals({ event: "scanResult", data: { address: "aa:bb" } });

            await connection.close();
        });

        it("receives events", async () => {
            const { client, connection } = await connectResponder();

            const received = new Array<[string, Record<string, unknown>]>();
            const first = new Promise<void>(resolve =>
                connection.eventReceived.on((event, data) => {
                    received.push([event, data]);
                    resolve();
                }),
            );

            await send(client, { event: "disconnected", data: { handle: 3 } });
            await first;

            expect(received).deep.equals([["disconnected", { handle: 3 }]]);

            await connection.close();
        });

        it("throws when sending an event while not connected", async () => {
            const { server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });

            expect(() => connection.sendEvent("x", {})).throws(ProxyConnectionClosedError);

            await connection.close();
        });

        it("ignores malformed JSON", async () => {
            const { client, connection } = await connectResponder();

            await sendRaw(client, "{not json");

            const result = connection.sendCommand("still-alive");
            expect(await receive(client)).deep.equals({ id: 0, command: "still-alive" });
            await send(client, { id: 0, success: true });
            await result;

            await connection.close();
        });
    });

    describe("frames", () => {
        it("sends binary frames", async () => {
            const { client, connection } = await connectResponder();

            connection.sendFrame(2, 42, new Uint8Array([0xaa, 0xbb]));

            const frame = await receiveFrame(client);
            expect(frame.opcode).equals(2);
            expect(frame.handle).equals(42);
            expect(Array.from(frame.payload)).deep.equals([0xaa, 0xbb]);

            await connection.close();
        });

        it("receives binary frames", async () => {
            const { client, connection } = await connectResponder();

            const frames = new Array<ProxyFrame>();
            const first = new Promise<void>(resolve =>
                connection.frameReceived.on(frame => {
                    frames.push(frame);
                    resolve();
                }),
            );

            await sendBytes(client, encodeProxyFrame(3, 7, new Uint8Array([0x01, 0x02])));
            await first;

            expect(frames).length(1);
            expect(frames[0].opcode).equals(3);
            expect(frames[0].handle).equals(7);
            expect(Array.from(frames[0].payload)).deep.equals([0x01, 0x02]);

            await connection.close();
        });

        it("ignores binary frames received before the handshake", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });

            const frames = new Array<ProxyFrame>();
            connection.frameReceived.on(frame => {
                frames.push(frame);
            });

            connection.start();
            await sendBytes(client, encodeProxyFrame(1, 1, new Uint8Array([0xff])));

            // The connection stays in handshake state and still accepts the hello
            await send(client, { type: "hello", version: VERSION });
            expect(await receive(client)).deep.equals({ type: "hello_response", version: VERSION });

            expect(frames).length(0);

            await connection.close();
        });

        it("ignores undecodable binary frames", async () => {
            const { client, connection } = await connectResponder();

            const frames = new Array<ProxyFrame>();
            const decoded = new Promise<void>(resolve =>
                connection.frameReceived.on(frame => {
                    frames.push(frame);
                    resolve();
                }),
            );

            await sendBytes(client, new Uint8Array([0x01]));
            await sendBytes(client, encodeProxyFrame(4, 4, new Uint8Array([0x05])));
            await decoded;

            expect(frames).length(1);
            expect(frames[0].opcode).equals(4);

            await connection.close();
        });

        it("rejects an out-of-range opcode or handle", async () => {
            const { connection } = await connectResponder();

            expect(() => connection.sendFrame(0x100, 1, new Uint8Array(0))).throws(ImplementationError);
            expect(() => connection.sendFrame(1, 0x10000, new Uint8Array(0))).throws(ImplementationError);
            expect(() => connection.sendFrame(1, -1, new Uint8Array(0))).throws(ImplementationError);

            await connection.close();
        });

        it("throws when sending a frame while not connected", async () => {
            const { server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });

            expect(() => connection.sendFrame(1, 1, new Uint8Array(0))).throws(ProxyConnectionClosedError);

            await connection.close();
        });
    });

    describe("lifecycle", () => {
        it("closes when the peer ends the stream", async () => {
            const { client, connection } = await connectResponder();
            const closed = nextEmit(connection.closed);

            await client.writable.close();

            await closed;
            expect(connection.connected).false;

            await connection.close();
        });

        it("survives an observer that throws", async () => {
            const { client, connection } = await connectResponder();

            connection.eventReceived.on(() => {
                throw new NetworkError("Observer failure");
            });

            await send(client, { event: "boom", data: {} });

            const result = connection.sendCommand("still-alive");
            expect(await receive(client)).deep.equals({ id: 0, command: "still-alive" });
            await send(client, { id: 0, success: true });
            await result;

            expect(connection.connected).true;

            await connection.close();
        });

        it("closes despite a closed observer that throws", async () => {
            const { connection } = await connectResponder();

            connection.closed.on(() => {
                throw new NetworkError("Observer failure");
            });

            await connection.close();

            expect(connection.connected).false;
        });

        it("tolerates overlapping closes", async () => {
            const { connection } = await connectResponder();

            let closeCount = 0;
            connection.closed.on(() => {
                closeCount++;
            });

            await Promise.all([connection.close(), connection.close()]);

            expect(closeCount).equals(1);
        });

        it("closes the transport when closed before start", async () => {
            const { client, server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });

            await connection.close();

            await expectEnd(client);
        });

        it("refuses to start a closed connection", async () => {
            const { server } = MockWsConnection();
            const connection = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });

            await connection.close();

            expect(() => connection.start()).throws(ImplementationError);
        });

        it("refuses to start twice", async () => {
            const { connection } = await connectResponder();

            expect(() => connection.start()).throws(ImplementationError);

            await connection.close();
        });

        it("tears down when the inbound stream errors", async () => {
            const faulty = faultyConnection();
            const connection = new ProxyConnection({
                connection: faulty.connection,
                version: VERSION,
                role: "responder",
            });
            const completed = nextEmit(connection.handshakeCompleted);
            const closed = nextEmit(connection.closed);

            connection.start();
            faulty.deliver({ type: "hello", version: VERSION });
            await completed;

            const pending = settlement(connection.sendCommand("x"));
            faulty.breakInbound();

            await closed;
            expect(await pending).instanceOf(ProxyConnectionClosedError);
            expect(connection.connected).false;

            await connection.close();
        });

        it("tears down when an outbound write fails", async () => {
            const faulty = faultyConnection();
            const connection = new ProxyConnection({
                connection: faulty.connection,
                version: VERSION,
                role: "responder",
            });
            const completed = nextEmit(connection.handshakeCompleted);
            const closed = nextEmit(connection.closed);

            connection.start();
            faulty.deliver({ type: "hello", version: VERSION });
            await completed;

            faulty.breakOutbound();
            const failed = settlement(connection.sendCommand("x"));

            expect(await failed).instanceOf(ProxyConnectionClosedError);
            await closed;
            expect(connection.connected).false;

            await connection.close();
        });

        it("assigns distinct ids with the configured prefix", async () => {
            const { client, server } = MockWsConnection();
            const first = new ProxyConnection({ connection: server, version: VERSION, role: "responder" });
            const second = new ProxyConnection({
                connection: client,
                version: VERSION,
                role: "initiator",
                idPrefix: "ble",
            });

            expect(first.id).match(/^wsp[0-9a-f]+$/);
            expect(second.id).match(/^ble[0-9a-f]+$/);
            expect(first.id.slice(3)).not.equals(second.id.slice(3));
        });
    });
});
