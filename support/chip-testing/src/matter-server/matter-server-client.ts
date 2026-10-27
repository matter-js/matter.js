/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Abort,
    Bytes,
    ClosedError,
    Diagnostic,
    Duration,
    isObject,
    Logger,
    MatterError,
    Observable,
    Seconds,
    Time,
    TimeoutError,
    UnexpectedDataError,
    WebSocketClient,
} from "@matter/general";
import type { HttpEndpoint, Timer } from "@matter/general";

const logger = Logger.get("MatterServerClient");

const DEFAULT_COMMAND_TIMEOUT = Seconds(60);
const DEFAULT_CONNECT_TIMEOUT = Seconds(10);
const CLOSE_TIMEOUT = Seconds(5);

/** The `server_info` message matterjs-server sends on connect; field names are the wire names. */
export interface MatterServerInfo {
    fabric_id: number | bigint;
    compressed_fabric_id: number | bigint;
    schema_version: number;
    min_supported_schema_version: number;
    sdk_version: string;
    wifi_credentials_set: boolean;
    thread_credentials_set: boolean;
    bluetooth_enabled: boolean;
}

/** Thrown when matterjs-server answers a command with an error reply. */
export class MatterServerCommandError extends MatterError {
    constructor(
        readonly command: string,
        readonly errorCode: number,
        readonly details: unknown,
        readonly failure: MatterServerFailure = {},
    ) {
        super(`matterjs-server command "${command}" failed with error ${errorCode}: ${formatDetails(details)}`);
    }
}

/** Why a command failed, where the error reply says so. */
export interface MatterServerFailure {
    /** The Matter status the device answered with; absent for a failure the device did not report. */
    status?: number;

    /** The cluster-specific status the device sent with {@link status}. */
    clusterStatus?: number;

    /** Why commissioning failed (`not-discovered`, `passcode-mismatch`, `invalid-payload`, …). */
    reason?: string;
}

/** The optional failure fields of an error reply; a field of the wrong type makes the reply malformed. */
function failureOf(frame: Record<string, unknown>): MatterServerFailure {
    const { status, cluster_status: clusterStatus, reason } = frame;
    if (
        (status !== undefined && typeof status !== "number") ||
        (clusterStatus !== undefined && typeof clusterStatus !== "number") ||
        (reason !== undefined && typeof reason !== "string")
    ) {
        throw new UnexpectedDataError(`Error reply with a malformed cause: ${Diagnostic.json(frame)}`);
    }
    return { status, clusterStatus, reason };
}

function formatDetails(details: unknown) {
    return typeof details === "string" ? details : toBigIntAwareJson(details);
}

/**
 * Serialize to JSON, writing every bigint as plain digits so a peer that reads integers at full width gets the
 * exact value.
 */
export function toBigIntAwareJson(value: unknown): string {
    const marker = uniqueMarker();
    const json: string | undefined = JSON.stringify(value, (_key, val: unknown) =>
        typeof val === "bigint" ? `${marker}${val}` : val,
    );
    if (json === undefined) {
        throw new UnexpectedDataError(`Cannot serialize a top-level ${typeof value} to JSON`);
    }
    return json.replace(new RegExp(`"${marker}(-?\\d+)"`, "g"), "$1");
}

/** Parse JSON, reading integers outside the safe integer range as bigint. Numbers inside strings stay untouched. */
export function parseBigIntAwareJson(json: string): unknown {
    const marker = uniqueMarker();

    // Strings come first in the alternation, so a number-like run inside a string is consumed with the string
    const protectedJson = json.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token =>
        /^-?\d{16,}$/.test(token) && !Number.isSafeInteger(Number(token)) ? `"${marker}${token}"` : token,
    );

    return JSON.parse(protectedJson, (_key, value: unknown) =>
        typeof value === "string" && value.startsWith(marker) ? BigInt(value.slice(marker.length)) : value,
    );
}

/** A fresh random marker per call, so text a peer sends cannot collide with it. */
function uniqueMarker() {
    const random = crypto.getRandomValues(new Uint32Array(2));
    return `${random[0].toString(16)}${random[1].toString(16)}:`;
}

/** Options of {@link MatterServerClient.command}. */
export interface MatterServerCommandOptions {
    /** How long to wait for the reply. Defaults to 60 s. */
    timeout?: Duration;
}

/** Options of {@link MatterServerClient.command} that decode the reply. */
export interface MatterServerDecodingCommandOptions<T> extends MatterServerCommandOptions {
    /**
     * Turns the reply's `result` into what the command resolves with. It runs while the reply is read, before the
     * next frame is, so state it sets up is in place for the events that follow the reply. A throw rejects the
     * command.
     */
    accept: (result: unknown) => T;
}

interface PendingCommand {
    command: string;
    accept: (result: unknown) => unknown;
    resolve(result: unknown): void;
    reject(cause: Error): void;
    timer: Timer;
}

type FrameReader = ReadableStreamDefaultReader<HttpEndpoint.WsMessage>;
type FrameWriter = WritableStreamDefaultWriter<HttpEndpoint.WsMessage>;

/**
 * Minimal client for matterjs-server's WebSocket API.
 *
 * Sends requests, correlates replies by `message_id` and surfaces events; it knows no command by name. One reader
 * handles the frames in the order the server sent them: a reply settles its command, and an event reaches
 * {@link events}, before the next frame is read.
 *
 * @see {@link https://github.com/matter-js/matterjs-server/blob/main/docs/websockets_api.md}
 */
export class MatterServerClient {
    /** Events the server pushes, in frame order. */
    readonly events = Observable<[event: string, data: unknown]>();

    /** Emitted once when the connection is gone, with the error pending commands were rejected with. */
    readonly disconnected = Observable<[error: ClosedError]>();

    readonly #reader: FrameReader;
    readonly #writer: FrameWriter;
    readonly #pending = new Map<string, PendingCommand>();
    readonly #closed: Promise<void>;
    #nextId = 1;
    #isClosed = false;
    #closeRequested = false;
    #closeCause?: Error;

    private constructor(
        reader: FrameReader,
        writer: FrameWriter,
        readonly serverInfo: MatterServerInfo,
    ) {
        this.#reader = reader;
        this.#writer = writer;
        this.#closed = this.#read();
    }

    /** Connect and resolve once the server's initial `server_info` message arrived. */
    static async connect(
        url: string,
        signal?: AbortSignal,
        timeout: Duration = DEFAULT_CONNECT_TIMEOUT,
    ): Promise<MatterServerClient> {
        const describe = {
            timeout: () =>
                new TimeoutError(`matterjs-server at ${url} accepted no connection within ${Duration.format(timeout)}`),
            abort: () => new ClosedError(`Connecting to ${url} was aborted`, { cause: signal?.reason }),
        };

        const connecting = new WebSocketClient().connect(url);
        let connection: HttpEndpoint.WsConnection;
        try {
            connection = await within(connecting, timeout, signal, describe);
        } catch (error) {
            // A connection that opens after the wait ended is nobody's, so it is closed once it does
            connecting.then(closeConnection, cause => logger.debug(`Connecting to ${url} failed:`, cause));
            throw error;
        }

        return MatterServerClient.open(connection, url, signal, timeout);
    }

    /**
     * Run a client on an open connection and resolve once the server's initial `server_info` message arrived on it.
     * `peer` names the server in errors.
     */
    static async open(
        connection: HttpEndpoint.WsConnection,
        peer: string,
        signal?: AbortSignal,
        timeout: Duration = DEFAULT_CONNECT_TIMEOUT,
    ): Promise<MatterServerClient> {
        const reader = connection.readable.getReader();
        const writer = connection.writable.getWriter();
        try {
            const first = await within(reader.read(), timeout, signal, {
                timeout: () =>
                    new TimeoutError(
                        `matterjs-server at ${peer} sent no server_info within ${Duration.format(timeout)}`,
                    ),
                abort: () => new ClosedError(`Connecting to ${peer} was aborted`, { cause: signal?.reason }),
            });
            if (first.done) {
                throw new ClosedError(`Connection to ${peer} closed before server_info arrived`);
            }
            return new MatterServerClient(reader, writer, parseServerInfo(textOf(first.value)));
        } catch (error) {
            await closeStreams(reader, writer);
            throw error;
        }
    }

    /**
     * Send a command and resolve with its `result`, or with what {@link MatterServerDecodingCommandOptions.accept}
     * makes of it. Rejects with {@link MatterServerCommandError} for an error reply, {@link TimeoutError} when no reply
     * arrives in time and {@link ClosedError} when the connection is gone.
     */
    command(command: string, args?: object, options?: MatterServerCommandOptions): Promise<unknown>;
    command<T>(command: string, args: object | undefined, options: MatterServerDecodingCommandOptions<T>): Promise<T>;
    command(
        command: string,
        args?: object,
        options: MatterServerCommandOptions & { accept?: (result: unknown) => unknown } = {},
    ): Promise<unknown> {
        if (this.#isClosed) {
            return Promise.reject(this.#closedError());
        }

        const { timeout = DEFAULT_COMMAND_TIMEOUT, accept = (result: unknown) => result } = options;
        const messageId = String(this.#nextId++);

        return new Promise<unknown>((resolve, reject) => {
            const timer = Time.getTimer(`matterjs-server ${command}`, timeout, () =>
                this.#settle(messageId)?.reject(
                    new TimeoutError(`matterjs-server did not answer "${command}" within ${Duration.format(timeout)}`),
                ),
            ).start();

            this.#pending.set(messageId, { command, accept, resolve, reject, timer });

            this.#writer.write(toBigIntAwareJson({ message_id: messageId, command, args })).catch(error => {
                this.#settle(messageId)?.reject(
                    new ClosedError(`Sending "${command}" to matterjs-server failed`, { cause: error }),
                );
            });
        });
    }

    /** Close the connection, rejecting commands still pending. */
    async close(): Promise<void> {
        this.#closeRequested = true;
        if (!this.#isClosed) {
            await this.#writer.close().catch(error => logger.debug("Closing the matterjs-server connection:", error));
        }
        // The server answers the close handshake; a server that does not is cut off
        const timer = Time.getTimer("matterjs-server close", CLOSE_TIMEOUT, () => {
            this.#reader.cancel().catch(error => logger.debug("Ending the matterjs-server connection:", error));
        }).start();
        try {
            await this.#closed;
        } finally {
            timer.stop();
        }
    }

    async #read() {
        let cause: Error | undefined;
        try {
            for (;;) {
                const { value, done } = await this.#reader.read();
                if (done) {
                    break;
                }
                this.#onFrame(textOf(value));
            }
        } catch (error) {
            cause = error instanceof Error ? error : new UnexpectedDataError(String(error));
        }
        this.#closeCause ??= cause;
        this.#onClose();
    }

    #settle(messageId: string) {
        const pending = this.#pending.get(messageId);
        if (pending !== undefined) {
            pending.timer.stop();
            this.#pending.delete(messageId);
        }
        return pending;
    }

    #onFrame(text: string) {
        try {
            this.#dispatch(parseBigIntAwareJson(text));
        } catch (cause) {
            this.#closeCause ??= new UnexpectedDataError(`Unusable frame from matterjs-server: ${text}`, { cause });
            this.#reader.cancel().catch(error => logger.debug("Ending the matterjs-server connection:", error));
        }
    }

    #emitEvent(event: string, data: unknown) {
        try {
            this.events.emit(event, data);
        } catch (error) {
            logger.warn(`Listener for matterjs-server event "${event}" failed:`, error);
        }
    }

    #dispatch(frame: unknown) {
        if (!isObject(frame)) {
            throw new UnexpectedDataError("Frame is not an object");
        }

        if (typeof frame.event === "string") {
            this.#emitEvent(frame.event, frame.data);
            return;
        }

        if (typeof frame.message_id !== "string") {
            throw new UnexpectedDataError("Frame has neither event nor message_id");
        }

        // No pending entry means the command timed out before its reply arrived
        const pending = this.#settle(frame.message_id);
        if (pending === undefined) {
            logger.debug(`Dropped the reply to matterjs-server message ${frame.message_id}, which timed out`);
            return;
        }

        if (typeof frame.error_code === "number") {
            let failure: MatterServerFailure;
            try {
                failure = failureOf(frame);
            } catch (error) {
                pending.reject(error instanceof Error ? error : new UnexpectedDataError(String(error)));
                return;
            }
            pending.reject(new MatterServerCommandError(pending.command, frame.error_code, frame.details, failure));
            return;
        }

        let result: unknown;
        try {
            result = pending.accept(frame.result);
        } catch (error) {
            pending.reject(error instanceof Error ? error : new UnexpectedDataError(String(error)));
            return;
        }
        pending.resolve(result);
    }

    #onClose() {
        this.#isClosed = true;
        const error = this.#closedError();
        if (!this.#closeRequested) {
            logger.warn(
                `Connection to matterjs-server was lost, so subscription updates stop and pending commands fail${
                    error.cause === undefined ? "" : `: ${error.cause}`
                }`,
            );
        }
        for (const messageId of [...this.#pending.keys()]) {
            this.#settle(messageId)?.reject(error);
        }
        try {
            this.disconnected.emit(error);
        } catch (listenerError) {
            logger.warn("Listener for the matterjs-server disconnect failed:", listenerError);
        }
    }

    #closedError() {
        return new ClosedError("Connection to matterjs-server is closed", { cause: this.#closeCause });
    }
}

/** Waits for `promise`, failing with what `describe` says once `timeout` passes or `signal` aborts. */
async function within<T>(
    promise: Promise<T>,
    timeout: Duration,
    signal: AbortSignal | undefined,
    describe: { timeout(): Error; abort(): Error },
): Promise<T> {
    if (signal?.aborted) {
        throw describe.abort();
    }
    using abort = new Abort({
        abort: signal,
        timeout,
        timeoutHandler() {
            this.abort(describe.timeout());
        },
    });
    const settled = await abort.race(promise.then(value => ({ value })));
    if (settled === undefined) {
        throw signal?.aborted ? describe.abort() : abort.reason;
    }
    return settled.value;
}

function textOf(message: HttpEndpoint.WsMessage): string {
    return typeof message === "string" ? message : Bytes.toString(message);
}

async function closeConnection(connection: HttpEndpoint.WsConnection) {
    await closeStreams(connection.readable.getReader(), connection.writable.getWriter());
}

async function closeStreams(reader: FrameReader, writer: FrameWriter) {
    await Promise.allSettled([reader.cancel(), writer.close()]);
}

function parseServerInfo(text: string): MatterServerInfo {
    const frame = parseBigIntAwareJson(text);
    if (
        !isObject(frame) ||
        typeof frame.schema_version !== "number" ||
        typeof frame.min_supported_schema_version !== "number" ||
        typeof frame.sdk_version !== "string" ||
        typeof frame.wifi_credentials_set !== "boolean" ||
        typeof frame.thread_credentials_set !== "boolean" ||
        typeof frame.bluetooth_enabled !== "boolean" ||
        !isIdentifier(frame.fabric_id) ||
        !isIdentifier(frame.compressed_fabric_id)
    ) {
        throw new UnexpectedDataError(
            `First message from matterjs-server is not a complete server_info: ${Diagnostic.json(frame)}`,
        );
    }

    return {
        fabric_id: frame.fabric_id,
        compressed_fabric_id: frame.compressed_fabric_id,
        schema_version: frame.schema_version,
        min_supported_schema_version: frame.min_supported_schema_version,
        sdk_version: frame.sdk_version,
        wifi_credentials_set: frame.wifi_credentials_set,
        thread_credentials_set: frame.thread_credentials_set,
        bluetooth_enabled: frame.bluetooth_enabled,
    };
}

function isIdentifier(value: unknown): value is number | bigint {
    return typeof value === "number" || typeof value === "bigint";
}
