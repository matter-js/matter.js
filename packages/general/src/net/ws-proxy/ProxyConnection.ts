/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { ImplementationError } from "#MatterError.js";
import { Duration } from "#time/Duration.js";
import { Time, Timer } from "#time/Time.js";
import { Seconds } from "#time/TimeUnit.js";
import { Bytes } from "#util/Bytes.js";
import { errorOf } from "#util/Error.js";
import { Observable } from "#util/Observable.js";
import { createPromise, PromiseTimeoutError, withTimeout } from "#util/Promises.js";
import type { HttpEndpoint } from "../http/HttpEndpoint.js";
import { decodeProxyFrame, encodeProxyFrame, type ProxyFrame } from "./ProxyFrame.js";
import {
    ProxyCommandError,
    ProxyConnectionClosedError,
    type ProxyCommandMessage,
    type ProxyEventMessage,
    type ProxyHelloMessage,
    type ProxyHelloResponseMessage,
    type ProxyResponseMessage,
} from "./ProxyMessage.js";

const logger = Logger.get("ProxyConnection");

const DEFAULT_HANDSHAKE_TIMEOUT = Seconds(10);
const DEFAULT_COMMAND_TIMEOUT = Seconds(60);
const DEFAULT_ID_PREFIX = "wsp";

let connectionIdCounter = 0;

/**
 * Generate a connection ID as a short hex string, rolling over at 0xFFFF.  The prefix distinguishes proxy sockets from
 * other connections in shared logs.
 */
function generateConnectionId(prefix: string) {
    const id = connectionIdCounter;
    connectionIdCounter = (connectionIdCounter + 1) & 0xffff;
    return `${prefix}${id.toString(16)}`;
}

function frameHead(payload: Uint8Array) {
    return Bytes.toHex(payload.subarray(0, 8));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One end of a WebSocket proxy connection.
 *
 * The protocol multiplexes three message kinds over a single WebSocket:
 *
 * - JSON commands with correlated responses
 * - JSON events without responses
 * - binary frames (see {@link ProxyFrame})
 *
 * A connection opens with a hello exchange.  The *initiator* sends the hello, the *responder* answers it.  Once the
 * handshake completes both roles are symmetric.
 *
 * The responder accepts any peer that completes the version handshake; it performs no authentication of its own.
 * Securing the endpoint (authentication in front of the upgrade, network isolation, a reverse proxy) is the
 * embedder's responsibility.
 */
export class ProxyConnection {
    readonly #connection: HttpEndpoint.WsConnection;
    readonly #version: number;
    readonly #role: ProxyConnection.Role;
    readonly #hello?: ProxyConnection.HelloFields;
    readonly #handshakeTimeout: Duration;
    readonly #commandTimeout: Duration;
    readonly #id: string;
    readonly #pendingCommands = new Map<number, ProxyConnection.PendingCommand>();

    #reader?: ReadableStreamDefaultReader<HttpEndpoint.WsMessage>;
    #writer?: WritableStreamDefaultWriter<HttpEndpoint.WsMessage>;
    #running?: Promise<void>;
    #handshakeTimer?: Timer;
    #handshakeComplete = false;
    #closedEmitted = false;
    #commandHandler?: ProxyConnection.CommandHandler;
    #nextCommandId = 0;

    // An observer that throws must not abort emission or tear down the transport, so every observable installs an
    // error handler in place of the default rethrow
    readonly #observerFailed = (error: Error) => logger.error(`[${this.#id}] Observer failed:`, error);

    /** Emitted once when the protocol handshake completes.  Prefer {@link opened} for waiting on it. */
    readonly handshakeCompleted = new Observable<[]>(this.#observerFailed);

    /**
     * Emitted once when the connection stops being usable (close, error, or handshake failure).  Stream teardown may
     * still be in progress; await {@link close} for that.
     */
    readonly closed = new Observable<[]>(this.#observerFailed);

    readonly eventReceived = new Observable<[event: string, data: Record<string, unknown>]>(this.#observerFailed);

    readonly frameReceived = new Observable<[frame: ProxyFrame]>(this.#observerFailed);

    constructor(options: ProxyConnection.Options) {
        this.#connection = options.connection;
        this.#version = options.version;
        this.#role = options.role;
        this.#hello = options.hello;
        this.#handshakeTimeout = options.handshakeTimeout ?? DEFAULT_HANDSHAKE_TIMEOUT;
        this.#commandTimeout = options.commandTimeout ?? DEFAULT_COMMAND_TIMEOUT;
        this.#id = generateConnectionId(options.idPrefix ?? DEFAULT_ID_PREFIX);
    }

    get id() {
        return this.#id;
    }

    /** True once the handshake completed and until the connection closes. */
    get connected() {
        return this.#handshakeComplete;
    }

    /**
     * Begin processing the connection.  An initiator sends its hello here; a responder waits for one.
     */
    start() {
        if (this.#running !== undefined) {
            throw new ImplementationError(`[${this.#id}] Connection is already started`);
        }
        if (this.#closedEmitted) {
            throw new ImplementationError(`[${this.#id}] Connection is closed`);
        }

        const reader = this.#connection.readable.getReader();
        this.#reader = reader;
        this.#writer = this.#connection.writable.getWriter();

        this.#handshakeTimer = Time.getTimer("Proxy handshake timeout", this.#handshakeTimeout, () => {
            if (this.#handshakeComplete) {
                return;
            }
            logger.warn(`[${this.#id}] Handshake timeout - closing connection`);
            this.#detach(this.close());
        }).start();

        this.#running = this.#run(reader);
    }

    /**
     * Wait for the handshake to complete.
     *
     * Resolves immediately if the connection is already open and rejects with {@link ProxyConnectionClosedError} if
     * the connection closes first, so consumers do not have to race {@link handshakeCompleted} against
     * {@link closed} themselves.
     */
    async opened(): Promise<void> {
        if (this.#handshakeComplete) {
            return;
        }

        if (this.#closedEmitted) {
            throw new ProxyConnectionClosedError(`[${this.#id}] Connection closed before the handshake completed`);
        }

        const { promise, resolver, rejecter } = createPromise<void>();

        const onOpened = () => {
            release();
            resolver();
        };

        const onClosed = () => {
            release();
            rejecter(new ProxyConnectionClosedError(`[${this.#id}] Connection closed before the handshake completed`));
        };

        const release = () => {
            this.handshakeCompleted.off(onOpened);
            this.closed.off(onClosed);
        };

        this.handshakeCompleted.on(onOpened);
        this.closed.on(onClosed);

        return promise;
    }

    /**
     * Install the handler invoked for inbound commands.  Without a handler the peer receives a `not_supported`
     * error response.
     *
     * Throw {@link ProxyCommandError} from the handler to select the error code reported to the peer.
     */
    setCommandHandler(handler: ProxyConnection.CommandHandler) {
        this.#commandHandler = handler;
    }

    /**
     * Send a command and wait for the peer's response.
     */
    async sendCommand(command: string, args?: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
        if (!this.connected) {
            throw new ProxyConnectionClosedError(`[${this.#id}] Cannot send command ${command}, not connected`);
        }

        const id = this.#allocateCommandId();

        const message: ProxyCommandMessage = { id, command };
        if (args !== undefined) {
            message.args = args;
        }

        const { promise, resolver, rejecter } = createPromise<Record<string, unknown> | undefined>();
        this.#pendingCommands.set(id, { resolver, rejecter });

        // Install the timeout wrapper before the first await so the pending promise never rejects unobserved
        const response = withTimeout(this.#commandTimeout, promise, () => {
            this.#pendingCommands.delete(id);
            rejecter(
                new PromiseTimeoutError(
                    `[${this.#id}] Command ${command} timed out after ${Duration.format(this.#commandTimeout)}`,
                ),
            );
        });

        try {
            await this.#write(JSON.stringify(message));
        } catch (error) {
            if (this.#pendingCommands.delete(id)) {
                rejecter(errorOf(error));
            }
        }

        return response;
    }

    sendEvent(event: string, data: Record<string, unknown>) {
        if (!this.connected) {
            throw new ProxyConnectionClosedError(`[${this.#id}] Cannot send event ${event}, not connected`);
        }

        const message: ProxyEventMessage = { event, data };
        this.#detach(this.#write(JSON.stringify(message)));
    }

    sendFrame(opcode: number, handle: number, payload: Uint8Array) {
        if (!this.connected) {
            throw new ProxyConnectionClosedError(`[${this.#id}] Cannot send frame ${opcode}, not connected`);
        }

        // The frame header truncates silently, which would misroute the frame to a valid but different handle
        if (opcode < 0 || opcode > 0xff || handle < 0 || handle > 0xffff) {
            throw new ImplementationError(`[${this.#id}] Frame opcode ${opcode} or handle ${handle} is out of range`);
        }

        logger.debug(
            `[${this.#id}] [FRAME] -> opcode=${opcode} handle=${handle} len=${payload.length} head=${frameHead(payload)}`,
        );
        this.#detach(this.#write(encodeProxyFrame(opcode, handle, payload)));
    }

    /**
     * Close the connection, rejecting pending commands.  Safe to call repeatedly and before {@link start}.
     */
    async close() {
        this.#settleClosed();

        if (this.#running === undefined) {
            await this.#closeUnusedStreams();
            return;
        }

        // Flush and close the outbound half first; cancelling the reader may take the whole transport down with it
        await this.#releaseWriter();

        const reader = this.#reader;
        if (reader !== undefined) {
            try {
                await reader.cancel();
            } catch (error) {
                logger.debug(`[${this.#id}] Error cancelling input:`, error);
            }
        }

        await this.#running;
    }

    /**
     * Own a promise we do not await elsewhere.  Failures are diagnostic only; the connection state they reflect is
     * already handled by {@link #write}.
     */
    #detach(work: Promise<unknown>) {
        work.catch(error => logger.debug(`[${this.#id}] Background operation failed:`, error));
    }

    async #run(reader: ReadableStreamDefaultReader<HttpEndpoint.WsMessage>) {
        try {
            if (this.#role === "initiator") {
                await this.#sendHello();
            }
            await this.#readLoop(reader);
        } catch (error) {
            logger.debug(`[${this.#id}] Connection terminated:`, error);
        } finally {
            try {
                await this.#terminate();
            } catch (error) {
                logger.error(`[${this.#id}] Error closing connection:`, error);
            }
        }
    }

    async #readLoop(reader: ReadableStreamDefaultReader<HttpEndpoint.WsMessage>) {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                logger.info(`[${this.#id}] Peer closed the connection`);
                break;
            }

            if (this.#handshakeComplete) {
                this.#receive(value);
            } else if (!(await this.#receiveHandshake(value))) {
                break;
            }
        }
    }

    async #sendHello() {
        const hello: ProxyHelloMessage = { type: "hello", version: this.#version, ...this.#hello };
        await this.#write(JSON.stringify(hello));
    }

    /**
     * Process a message received before the handshake completes.  Returns false if the connection must close.
     */
    async #receiveHandshake(message: HttpEndpoint.WsMessage) {
        if (this.#closedEmitted) {
            return false;
        }

        if (typeof message !== "string") {
            logger.warn(`[${this.#id}] Received binary frame before handshake`);
            return true;
        }

        const parsed = this.#parse(message);
        if (parsed === undefined) {
            return true;
        }

        return this.#role === "responder" ? this.#receiveHello(parsed) : this.#receiveHelloResponse(parsed);
    }

    async #receiveHello(message: Record<string, unknown>) {
        if (message.type !== "hello") {
            logger.warn(`[${this.#id}] Expected hello message, got: ${JSON.stringify(message)}`);
            return false;
        }

        this.#handshakeTimer?.stop();

        const { version } = message;
        if (version !== this.#version) {
            logger.warn(`[${this.#id}] Peer protocol version ${String(version)} is not supported`);
            const response: ProxyHelloResponseMessage = {
                type: "hello_response",
                version: this.#version,
                error: "unsupported_version",
                message: `Server supports protocol version ${this.#version}, client sent version ${String(version)}`,
            };
            await this.#write(JSON.stringify(response));
            return false;
        }

        const response: ProxyHelloResponseMessage = { type: "hello_response", version: this.#version };
        await this.#write(JSON.stringify(response));

        return this.#completeHandshake();
    }

    #receiveHelloResponse(message: Record<string, unknown>) {
        if (message.type !== "hello_response") {
            logger.warn(`[${this.#id}] Expected hello_response message, got: ${JSON.stringify(message)}`);
            return false;
        }

        this.#handshakeTimer?.stop();

        if (message.error !== undefined) {
            logger.error(`[${this.#id}] Peer rejected handshake: ${String(message.error)} ${String(message.message)}`);
            return false;
        }

        if (message.version !== this.#version) {
            logger.error(
                `[${this.#id}] Peer protocol version ${String(message.version)} does not match ${this.#version}`,
            );
            return false;
        }

        return this.#completeHandshake();
    }

    /**
     * Commit the handshake.  Returns false if the connection reached its terminal state while the response was in
     * flight, in which case the peer's message arrives too late to open the connection.
     */
    #completeHandshake() {
        if (this.#closedEmitted) {
            logger.debug(`[${this.#id}] Handshake completed after close, ignoring`);
            return false;
        }

        this.#handshakeComplete = true;
        logger.info(`[${this.#id}] Handshake complete (version ${this.#version})`);
        this.handshakeCompleted.emit();

        return true;
    }

    #receive(message: HttpEndpoint.WsMessage) {
        if (this.#closedEmitted) {
            return;
        }

        if (typeof message !== "string") {
            this.#receiveFrame(message);
            return;
        }

        const parsed = this.#parse(message);
        if (parsed === undefined) {
            return;
        }

        if ("id" in parsed && "success" in parsed) {
            this.#receiveResponse(parsed);
            return;
        }

        if ("id" in parsed && "command" in parsed) {
            this.#receiveCommand(parsed);
            return;
        }

        if ("event" in parsed && "data" in parsed) {
            const { event, data } = parsed;
            if (typeof event === "string" && isRecord(data)) {
                this.eventReceived.emit(event, data);
                return;
            }
        }

        logger.warn(`[${this.#id}] Received unknown message:`, parsed);
    }

    #receiveResponse(message: Record<string, unknown>) {
        const { id } = message;
        if (typeof id !== "number") {
            logger.warn(`[${this.#id}] Received response with invalid command id ${String(id)}`);
            return;
        }

        const pending = this.#pendingCommands.get(id);
        if (pending === undefined) {
            logger.warn(`[${this.#id}] Received response for unknown command id ${id}`);
            return;
        }
        this.#pendingCommands.delete(id);

        if (message.success) {
            pending.resolver(isRecord(message.result) ? message.result : undefined);
        } else {
            const code = typeof message.error === "string" ? message.error : "unknown_error";
            const detail = typeof message.message === "string" ? message.message : `Command ${id} failed`;
            pending.rejecter(new ProxyCommandError(code, detail));
        }
    }

    /**
     * Allocate a command ID, skipping IDs still in flight so a wrap cannot orphan a pending command.
     */
    #allocateCommandId() {
        if (this.#pendingCommands.size > 0xffff) {
            throw new ImplementationError(`[${this.#id}] Too many commands in flight`);
        }

        let id = this.#nextCommandId;
        while (this.#pendingCommands.has(id)) {
            id = (id + 1) & 0xffff;
        }
        this.#nextCommandId = (id + 1) & 0xffff;

        return id;
    }

    #receiveCommand(message: Record<string, unknown>) {
        const { id, command } = message;
        if (typeof id !== "number" || typeof command !== "string") {
            logger.warn(`[${this.#id}] Received malformed command:`, message);
            return;
        }

        const handler = this.#commandHandler;
        if (handler === undefined) {
            // Leaving a request unanswered would stall the peer until its own command timeout
            logger.warn(`[${this.#id}] Received command ${command} but no handler is installed`);
            const response: ProxyResponseMessage = {
                id,
                success: false,
                error: "not_supported",
                message: `Command ${command} is not supported`,
            };
            this.#detach(this.#write(JSON.stringify(response)));
            return;
        }

        // Dispatch without blocking the read loop so a handler may itself exchange messages with the peer
        this.#detach(this.#invokeCommand(handler, id, command, isRecord(message.args) ? message.args : undefined));
    }

    async #invokeCommand(
        handler: ProxyConnection.CommandHandler,
        id: number,
        command: string,
        args?: Record<string, unknown>,
    ) {
        let response: ProxyResponseMessage;

        try {
            const result = await handler(command, args);
            response = { id, success: true };
            if (isRecord(result)) {
                response.result = result;
            }
        } catch (cause) {
            const error = errorOf(cause);
            if (error instanceof ProxyCommandError) {
                response = { id, success: false, error: error.code, message: error.detail };
            } else {
                logger.error(`[${this.#id}] Command ${command} failed:`, error);
                response = { id, success: false, error: "internal_error", message: error.message };
            }
        }

        await this.#write(JSON.stringify(response));
    }

    #receiveFrame(message: Exclude<HttpEndpoint.WsMessage, string>) {
        let frame: ProxyFrame;
        try {
            frame = decodeProxyFrame(Bytes.of(message));
        } catch (error) {
            logger.warn(`[${this.#id}] Failed to decode binary frame:`, error);
            return;
        }

        logger.debug(
            `[${this.#id}] [FRAME] <- opcode=${frame.opcode} handle=${frame.handle} len=${frame.payload.length} head=${frameHead(frame.payload)}`,
        );
        this.frameReceived.emit(frame);
    }

    #parse(message: string) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(message);
        } catch (error) {
            logger.warn(`[${this.#id}] Received invalid JSON:`, error);
            return undefined;
        }

        if (!isRecord(parsed)) {
            logger.warn(`[${this.#id}] Received JSON message that is not an object`);
            return undefined;
        }

        return parsed;
    }

    async #write(message: HttpEndpoint.WsMessage) {
        const writer = this.#writer;
        if (writer === undefined) {
            throw new ProxyConnectionClosedError(`[${this.#id}] Cannot write, connection is not open`);
        }

        try {
            await writer.write(message);
        } catch (cause) {
            const error = errorOf(cause);
            this.#fail(error);
            throw new ProxyConnectionClosedError(`[${this.#id}] Write failed`, { cause: error });
        }
    }

    /**
     * Handle a transport failure detected on the outbound path.  Cancelling the reader ends the read loop, which then
     * performs stream teardown.
     */
    #fail(error: Error) {
        logger.debug(`[${this.#id}] Connection failed:`, error);
        this.#settleClosed();

        const reader = this.#reader;
        if (reader !== undefined) {
            this.#detach(reader.cancel());
        }
    }

    #settleClosed() {
        this.#handshakeTimer?.stop();
        this.#handshakeComplete = false;

        const pending = [...this.#pendingCommands.values()];
        this.#pendingCommands.clear();
        for (const { rejecter } of pending) {
            rejecter(new ProxyConnectionClosedError(`[${this.#id}] Peer disconnected`));
        }

        if (!this.#closedEmitted) {
            this.#closedEmitted = true;
            this.closed.emit();
        }
    }

    async #terminate() {
        this.#settleClosed();
        await this.#releaseWriter();
        await this.#releaseReader();
    }

    async #releaseWriter() {
        const writer = this.#writer;
        if (writer === undefined) {
            return;
        }
        this.#writer = undefined;

        try {
            await writer.close();
        } catch (error) {
            logger.debug(`[${this.#id}] Error closing output:`, error);
        }

        try {
            writer.releaseLock();
        } catch (error) {
            logger.debug(`[${this.#id}] Error releasing output:`, error);
        }
    }

    async #releaseReader() {
        const reader = this.#reader;
        if (reader === undefined) {
            return;
        }
        this.#reader = undefined;

        try {
            await reader.cancel();
        } catch (error) {
            logger.debug(`[${this.#id}] Error cancelling input:`, error);
        }

        try {
            reader.releaseLock();
        } catch (error) {
            logger.debug(`[${this.#id}] Error releasing input:`, error);
        }
    }

    /**
     * Close a transport we never took ownership of, so abandoning a connection before {@link start} does not leak it.
     */
    async #closeUnusedStreams() {
        try {
            await this.#connection.writable.close();
        } catch (error) {
            logger.debug(`[${this.#id}] Error closing output:`, error);
        }

        try {
            await this.#connection.readable.cancel();
        } catch (error) {
            logger.debug(`[${this.#id}] Error cancelling input:`, error);
        }
    }
}

export namespace ProxyConnection {
    export type Role = "responder" | "initiator";

    /** Additive hello fields.  Version 1 peers ignore them. */
    export interface HelloFields {
        role?: string;
        features?: string[];
    }

    export type CommandHandler = (
        command: string,
        args: Record<string, unknown> | undefined,
    ) => Promise<Record<string, unknown> | void>;

    export interface Options {
        connection: HttpEndpoint.WsConnection;

        /** Protocol version we implement. */
        version: number;

        /** A responder waits for the peer's hello; an initiator sends one on {@link ProxyConnection.start}. */
        role: Role;

        /** Prefix for the generated connection ID.  Defaults to "wsp". */
        idPrefix?: string;

        /** Additive fields for the hello an initiator sends. */
        hello?: HelloFields;

        /** Time allowed for the handshake.  Defaults to 10 seconds. */
        handshakeTimeout?: Duration;

        /** Time allowed for a command response.  Defaults to 60 seconds. */
        commandTimeout?: Duration;
    }

    export interface PendingCommand {
        resolver: (result: Record<string, unknown> | undefined) => void;
        rejecter: (reason: unknown) => void;
    }
}
