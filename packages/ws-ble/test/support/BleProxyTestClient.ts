/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test double for a BLE proxy client (the HA side of the protocol).
 *
 * Speaks the raw wire protocol directly over a mock transport rather than going through the
 * hub's own connection wrapper, so tests exercise the hub against the same bytes a real proxy
 * client would send.
 */

import {
    createPromise,
    Logger,
    PromiseTimeoutError,
    WsProxyConnectionClosedError,
    Seconds,
    withTimeout,
    type Duration,
    type HttpEndpoint,
} from "@matter/general";
import {
    BLE_PROXY_PROTOCOL_VERSION,
    BleProxyCommand,
    encodeBinaryFrame,
    type BleProxyCommandName,
    type CommandMessage,
} from "../../src/BleProxyProtocol.js";

const logger = Logger.get("BleProxyTestClient");

const BLE_COMMAND_NAMES = new Set<string>(Object.values(BleProxyCommand));

type CommandHandler = (args: Record<string, unknown>) => Promise<Record<string, unknown> | void>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommandMessage(value: Record<string, unknown>): value is CommandMessage {
    return typeof value.id === "number" && typeof value.command === "string" && BLE_COMMAND_NAMES.has(value.command);
}

export class BleProxyTestClient {
    #writer?: WritableStreamDefaultWriter<HttpEndpoint.WsMessage>;
    #reader?: ReadableStreamDefaultReader<HttpEndpoint.WsMessage>;
    #running?: Promise<void>;
    #commandHandlers = new Map<BleProxyCommandName, CommandHandler>();
    #receivedCommands = new Array<CommandMessage>();
    #commandWaiters = new Array<{ command: BleProxyCommandName; resolve: (msg: CommandMessage) => void }>();

    /** Perform the hello handshake over `connection` and start processing subsequent messages. */
    async connect(connection: HttpEndpoint.WsConnection): Promise<void> {
        const writer = connection.writable.getWriter();
        this.#writer = writer;
        const reader = connection.readable.getReader();
        this.#reader = reader;

        await this.#write(JSON.stringify({ type: "hello", version: BLE_PROXY_PROTOCOL_VERSION }));

        const { done, value } = await reader.read();
        if (done || typeof value !== "string") {
            throw new WsProxyConnectionClosedError("BLE proxy connection closed during handshake");
        }

        const response = JSON.parse(value) as Record<string, unknown>;
        if (response.type !== "hello_response" || response.error !== undefined) {
            throw new WsProxyConnectionClosedError(
                `Handshake failed: ${response.error !== undefined ? String(response.error) : `unexpected message type ${String(response.type)}`}`,
            );
        }

        this.#running = this.#readLoop(reader);
    }

    /** Register the response an inbound command receives; unregistered commands auto-succeed with `{}`. */
    onCommand(command: BleProxyCommandName, handler: CommandHandler): void {
        this.#commandHandlers.set(command, handler);
    }

    async sendEvent(event: string, data: Record<string, unknown>): Promise<void> {
        await this.#write(JSON.stringify({ event, data }));
    }

    async sendBinaryFrame(opcode: number, connectionHandle: number, payload: Uint8Array): Promise<void> {
        await this.#write(encodeBinaryFrame(opcode, connectionHandle, payload));
    }

    /** Wait for a command of the given name, resolving immediately if one already arrived. */
    waitForCommand(command: BleProxyCommandName, timeout: Duration = Seconds(5)): Promise<CommandMessage> {
        const existing = this.#receivedCommands.find(c => c.command === command);
        if (existing) {
            this.#receivedCommands = this.#receivedCommands.filter(c => c !== existing);
            return Promise.resolve(existing);
        }

        const { promise, resolver } = createPromise<CommandMessage>();
        const waiter = { command, resolve: resolver };
        this.#commandWaiters.push(waiter);
        return withTimeout(timeout, promise, () => {
            const idx = this.#commandWaiters.indexOf(waiter);
            if (idx !== -1) {
                this.#commandWaiters.splice(idx, 1);
            }
            throw new PromiseTimeoutError(`Timeout waiting for command: ${command}`);
        });
    }

    get receivedCommands(): CommandMessage[] {
        return [...this.#receivedCommands];
    }

    async close(): Promise<void> {
        const writer = this.#writer;
        this.#writer = undefined;
        if (writer) {
            await writer.close();
        }

        const reader = this.#reader;
        this.#reader = undefined;
        if (reader) {
            await reader.cancel();
        }

        await this.#running;
    }

    async #readLoop(reader: ReadableStreamDefaultReader<HttpEndpoint.WsMessage>): Promise<void> {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            if (typeof value !== "string") {
                // The test client only speaks the JSON command/event envelope, matching what the ownership and
                // scan-broadcast tests exercise.
                continue;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(value);
            } catch (error) {
                logger.warn("Received invalid JSON:", error);
                continue;
            }
            if (!isRecord(parsed) || !isCommandMessage(parsed)) {
                continue;
            }

            this.#receivedCommands.push(parsed);
            this.#resolveCommandWaiters(parsed);
            this.#dispatchCommand(parsed).catch(error => logger.warn("Command dispatch failed:", error));
        }
    }

    async #dispatchCommand(msg: CommandMessage): Promise<void> {
        const handler = this.#commandHandlers.get(msg.command);
        if (!handler) {
            await this.#write(JSON.stringify({ id: msg.id, success: true, result: {} }));
            return;
        }

        try {
            const result = await handler(msg.args ?? {});
            await this.#write(JSON.stringify({ id: msg.id, success: true, result: result ?? {} }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.#write(JSON.stringify({ id: msg.id, success: false, error: "test_error", message }));
        }
    }

    #resolveCommandWaiters(msg: CommandMessage): void {
        const idx = this.#commandWaiters.findIndex(w => w.command === msg.command);
        if (idx !== -1) {
            const waiter = this.#commandWaiters.splice(idx, 1)[0];
            waiter.resolve(msg);
        }
    }

    async #write(message: HttpEndpoint.WsMessage): Promise<void> {
        const writer = this.#writer;
        if (!writer) {
            throw new WsProxyConnectionClosedError("BleProxyTestClient is not connected");
        }
        await writer.write(message);
    }
}
