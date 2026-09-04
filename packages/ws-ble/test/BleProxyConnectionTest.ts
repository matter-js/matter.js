/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    MockWsConnection,
    NetworkError,
    WsProxyCommandError,
    WsProxyConnectionClosedError,
    type Observable,
} from "@matter/general";
import { BleProxyConnection } from "../src/BleProxyConnection.js";
import { BinaryFrameOpcode, BLE_PROXY_PROTOCOL_VERSION, BleProxyCommand } from "../src/BleProxyProtocol.js";

const VERSION = BLE_PROXY_PROTOCOL_VERSION;

const { send, receive } = MockWsConnection;

/**
 * Create a connected {@link BleProxyConnection} plus the mock client side of its transport.
 */
async function connect() {
    const { client, server } = MockWsConnection();
    const connection = new BleProxyConnection(server);

    await send(client, { type: "hello", version: VERSION });
    expect(await receive(client)).deep.equals({ type: "hello_response", version: VERSION });
    expect(connection.connected).true;

    return { client, connection };
}

function settlement<T>(promise: Promise<T>) {
    return promise.then(
        () => undefined,
        (error: unknown) => error,
    );
}

function nextEmit(observable: Observable<[]>) {
    return new Promise<void>(resolve => observable.on(() => resolve()));
}

/**
 * Assert a settled value is an error of the expected type and narrow it for further assertions.
 */
function errorOfType<T extends Error>(value: unknown, type: new (...args: never[]) => T) {
    expect(value).instanceOf(type);
    if (!(value instanceof type)) {
        throw new NetworkError(`Expected ${type.name}`);
    }
    return value;
}

describe("BleProxyConnection", () => {
    before(() => MockTime.enable());

    it("reports connected after handshake", async () => {
        const { connection } = await connect();

        expect(connection.connected).true;

        await connection.close();
    });

    it("opened resolves once the handshake completes", async () => {
        const { client, server } = MockWsConnection();
        const connection = new BleProxyConnection(server);

        const opened = connection.opened();

        await send(client, { type: "hello", version: VERSION });
        await opened;

        expect(connection.connected).true;

        await connection.close();
    });

    it("emits handshakeCompleted once the handshake completes", async () => {
        const { client, server } = MockWsConnection();
        const connection = new BleProxyConnection(server);
        const completed = nextEmit(connection.handshakeCompleted);

        await send(client, { type: "hello", version: VERSION });
        await completed;

        expect(connection.connected).true;

        await connection.close();
    });

    it("rejects opened() when the connection closes before the handshake completes", async () => {
        const { client, server } = MockWsConnection();
        const connection = new BleProxyConnection(server);

        const opened = settlement(connection.opened());

        await send(client, { type: "something-else" });

        errorOfType(await opened, WsProxyConnectionClosedError);
        expect(connection.connected).false;

        await connection.close();
    });

    it("rejects a version mismatch and reports the supported version", async () => {
        const { client, server } = MockWsConnection();
        const connection = new BleProxyConnection(server);
        const closed = nextEmit(connection.closed);

        await send(client, { type: "hello", version: VERSION + 1 });

        expect(await receive(client)).deep.equals({
            type: "hello_response",
            version: VERSION,
            error: "unsupported_version",
            message: `Server supports protocol version ${VERSION}, client sent version ${VERSION + 1}`,
        });

        await closed;
        expect(connection.connected).false;

        await connection.close();
    });

    it("rejects a command sent before the handshake completes", async () => {
        const { server } = MockWsConnection();
        const connection = new BleProxyConnection(server);

        errorOfType(await settlement(connection.sendCommand(BleProxyCommand.StopScan)), WsProxyConnectionClosedError);

        await connection.close();
    });

    it("exposes a non-empty connection id with the ble prefix", async () => {
        const { connection } = await connect();

        expect(connection.id).match(/^ble[0-9a-f]+$/);

        await connection.close();
    });

    it("sends a typed command and resolves with the typed result", async () => {
        const { client, connection } = await connect();

        const result = connection.sendCommand(BleProxyCommand.Connect, { address: "AA:BB:CC:DD:EE:FF" });

        expect(await receive(client)).deep.equals({
            id: 0,
            command: BleProxyCommand.Connect,
            args: { address: "AA:BB:CC:DD:EE:FF" },
        });
        await send(client, { id: 0, success: true, result: { connection_handle: 1, mtu: 247 } });

        expect(await result).deep.equals({ connection_handle: 1, mtu: 247 });

        await connection.close();
    });

    it("omits args for a command that takes none", async () => {
        const { client, connection } = await connect();

        const result = connection.sendCommand(BleProxyCommand.StopScan);

        expect(await receive(client)).deep.equals({ id: 0, command: BleProxyCommand.StopScan });
        await send(client, { id: 0, success: true });
        await result;

        await connection.close();
    });

    it("rejects when the client returns an error response, preserving the wire message format", async () => {
        const { client, connection } = await connect();

        const result = settlement(connection.sendCommand(BleProxyCommand.Connect, { address: "XX" }));

        expect(await receive(client)).deep.equals({
            id: 0,
            command: BleProxyCommand.Connect,
            args: { address: "XX" },
        });
        await send(client, { id: 0, success: false, error: "device_not_found", message: "Device not found" });

        const error = errorOfType(await result, WsProxyCommandError);
        expect(error.code).equals("device_not_found");
        expect(error.message).equals("device_not_found: Device not found");

        await connection.close();
    });

    it("emits eventReceived for JSON events from the client", async () => {
        const { client, connection } = await connect();

        const received = new Promise<[event: string, data: Record<string, unknown>]>(resolve =>
            connection.eventReceived.on((event, data) => resolve([event, data])),
        );

        await send(client, { event: "scan_stopped", data: { reason: "test" } });

        const [event, data] = await received;
        expect(event).equals("scan_stopped");
        expect(data.reason).equals("test");

        await connection.close();
    });

    it("emits binaryFrameReceived for binary frames from the client", async () => {
        const { client, connection } = await connect();

        const received = new Promise<{ opcode: number; handle: number; payload: Uint8Array }>(resolve =>
            connection.binaryFrameReceived.on(frame => resolve(frame)),
        );

        const writer = client.writable.getWriter();
        try {
            const frame = new Uint8Array([BinaryFrameOpcode.Notification, 0x00, 0x05, 1, 2, 3]);
            await writer.write(frame);
        } finally {
            writer.releaseLock();
        }

        const got = await received;
        expect(got.opcode).equals(BinaryFrameOpcode.Notification);
        expect(got.handle).equals(5);
        expect(Array.from(got.payload)).deep.equals([1, 2, 3]);

        await connection.close();
    });

    it("sends binary frames to the client", async () => {
        const { client, connection } = await connect();

        connection.sendBinaryFrame(BinaryFrameOpcode.WriteData, 42, new Uint8Array([0xaa, 0xbb]));

        const reader = client.readable.getReader();
        let frame: Uint8Array;
        try {
            const { value } = await reader.read();
            if (value === undefined || typeof value === "string") {
                throw new NetworkError("Expected a binary frame");
            }
            frame = Bytes.of(value);
        } finally {
            reader.releaseLock();
        }

        expect(frame[0]).equals(BinaryFrameOpcode.WriteData);
        expect(frame[1]).equals(0x00);
        expect(frame[2]).equals(42);
        expect(Array.from(frame.subarray(3))).deep.equals([0xaa, 0xbb]);

        await connection.close();
    });

    it("emits closed exactly once and rejects pending commands when the transport closes", async () => {
        const { client, connection } = await connect();

        let closeCount = 0;
        connection.closed.on(() => {
            closeCount++;
        });

        const pending = settlement(connection.sendCommand(BleProxyCommand.StopScan));
        expect(await receive(client)).deep.equals({ id: 0, command: BleProxyCommand.StopScan });

        await client.writable.close();

        errorOfType(await pending, WsProxyConnectionClosedError);
        expect(connection.connected).false;
        expect(closeCount).equals(1);

        await connection.close();
        expect(closeCount).equals(1);
    });

    it("emits closed exactly once across overlapping close() calls", async () => {
        const { connection } = await connect();

        let closeCount = 0;
        connection.closed.on(() => {
            closeCount++;
        });

        await Promise.all([connection.close(), connection.close()]);

        expect(closeCount).equals(1);
        expect(connection.connected).false;
    });
});
