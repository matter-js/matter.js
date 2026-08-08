/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProxyConnection, type HttpEndpoint, type Observable } from "@matter/general";
import {
    BLE_PROXY_PROTOCOL_VERSION,
    type BinaryFrame,
    type BleProxyCommandMap,
    type BleProxyCommandName,
    type BleProxyEventName,
} from "./BleProxyProtocol.js";

/**
 * Hub-side BLE proxy connection.
 *
 * A thin wrapper around {@link ProxyConnection} that fixes the responder role, the BLE proxy protocol version, and
 * the connection id prefix, and narrows the generic command/event vocabulary to the BLE proxy's. All handshake,
 * framing, and transport-failure handling is delegated to {@link ProxyConnection}.
 */
export class BleProxyConnection {
    readonly #connection: ProxyConnection;

    readonly binaryFrameReceived: Observable<[frame: BinaryFrame]>;
    readonly eventReceived: Observable<[event: BleProxyEventName, data: Record<string, unknown>]>;
    readonly handshakeCompleted: Observable<[]>;
    readonly closed: Observable<[]>;

    constructor(connection: HttpEndpoint.WsConnection) {
        this.#connection = new ProxyConnection({
            connection,
            version: BLE_PROXY_PROTOCOL_VERSION,
            role: "responder",
            idPrefix: "ble",
        });

        this.binaryFrameReceived = this.#connection.frameReceived;
        this.eventReceived = this.#connection.eventReceived as Observable<
            [event: BleProxyEventName, data: Record<string, unknown>]
        >;
        this.handshakeCompleted = this.#connection.handshakeCompleted;
        this.closed = this.#connection.closed;

        this.#connection.start();
    }

    get id(): string {
        return this.#connection.id;
    }

    /** See {@link ProxyConnection.connected}. */
    get connected(): boolean {
        return this.#connection.connected;
    }

    /** Wait for the handshake to complete.  See {@link ProxyConnection.opened}. */
    opened(): Promise<void> {
        return this.#connection.opened();
    }

    /**
     * Send a typed command to the BLE proxy client and wait for its response.
     */
    async sendCommand<C extends BleProxyCommandName>(
        command: C,
        ...rest: BleProxyCommandMap[C]["args"] extends undefined ? [] : [args: BleProxyCommandMap[C]["args"]]
    ): Promise<BleProxyCommandMap[C]["result"]> {
        const [args] = rest;
        const result = await this.#connection.sendCommand(command, args as Record<string, unknown> | undefined);
        return result as BleProxyCommandMap[C]["result"];
    }

    /** Send a raw binary frame to the BLE proxy client.  See {@link ProxyConnection.sendFrame}. */
    sendBinaryFrame(opcode: number, connectionHandle: number, payload: Uint8Array): void {
        this.#connection.sendFrame(opcode, connectionHandle, payload);
    }

    /** Close the connection, rejecting any pending commands.  See {@link ProxyConnection.close}. */
    close(): Promise<void> {
        return this.#connection.close();
    }
}
