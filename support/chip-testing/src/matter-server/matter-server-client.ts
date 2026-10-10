/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ClosedError,
    Duration,
    InternalError,
    Logger,
    isObject,
    MatterError,
    Observable,
    Seconds,
    TimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import { WebSocket } from "ws";

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
    ) {
        super(`matterjs-server command "${command}" failed with error ${errorCode}: ${formatDetails(details)}`);
    }
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
    return `${random[0].toString(16)}${random[1].toString(16)}:`;
}

interface PendingCommand {
    command: string;
    resolve(result: unknown): void;
    reject(cause: Error): void;
    timer: NodeJS.Timeout;
}

/**
 * Minimal client for matterjs-server's WebSocket API.
 *
 * Sends requests, correlates replies by `message_id` and surfaces events; it knows no command by name.
 *
 * @see {@link https://github.com/matter-js/matterjs-server/blob/main/docs/websockets_api.md}
 */
export class MatterServerClient {
    /** Events the server pushes after `start_listening`. */
    readonly events = Observable<[event: string, data: unknown]>();

    readonly #socket: WebSocket;
    readonly #pending = new Map<string, PendingCommand>();
    readonly #closed: Promise<void>;
    #nextId = 1;
    #isClosed = false;
    #closeCause?: Error;

    private constructor(
        socket: WebSocket,
        readonly serverInfo: MatterServerInfo,
    ) {
        this.#socket = socket;
        this.#closed = new Promise<void>(resolve => socket.once("close", () => resolve()));

        socket.on("message", data => this.#onFrame(data.toString()));
        // A socket error is always followed by "close", which rejects what is pending
        socket.on("error", cause => (this.#closeCause ??= cause));
        socket.once("close", () => this.#onClose());
    }

    /** Connect and resolve once the server's initial `server_info` message arrived. */
    static async connect(
        url: string,
        signal?: AbortSignal,
        timeout: Duration = DEFAULT_CONNECT_TIMEOUT,
    ): Promise<MatterServerClient> {
        const socket = new WebSocket(url);

        return new Promise<MatterServerClient>((resolve, reject) => {
            const finish = (outcome: () => void) => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                socket.off("message", onMessage);
                socket.off("error", onError);
                socket.off("close", onEarlyClose);
                outcome();
            };

            const fail = (cause: Error) =>
                finish(() => {
                    // terminate() can raise an "error" of its own, and an unhandled one is fatal to the process
                    socket.on("error", () => {});
                    socket.terminate();
                    reject(cause);
                });

            const onMessage = (data: unknown) => {
                try {
                    const info = parseServerInfo(String(data));
                    finish(() => resolve(new MatterServerClient(socket, info)));
                } catch (e) {
                    fail(e instanceof Error ? e : new InternalError(String(e)));
                }
            };
            const onError = (cause: Error) => fail(cause);
            const onEarlyClose = () => fail(new ClosedError(`Connection to ${url} closed before server_info arrived`));
            const onAbort = () => fail(new ClosedError(`Connecting to ${url} was aborted`, { cause: signal?.reason }));

            const timer = setTimeout(
                () =>
                    fail(
                        new TimeoutError(
                            `matterjs-server at ${url} sent no server_info within ${Duration.format(timeout)}`,
                        ),
                    ),
                timeout,
            );

            socket.on("message", onMessage);
            socket.on("error", onError);
            socket.once("close", onEarlyClose);
            if (signal?.aborted) {
                onAbort();
            } else {
                signal?.addEventListener("abort", onAbort, { once: true });
            }
        });
    }

    /**
     * Send a command and resolve with its `result`. Rejects with {@link MatterServerCommandError} for an error
     * reply, {@link TimeoutError} when no reply arrives in time and {@link ClosedError} when the connection is
     * gone.
     */
    command(command: string, args?: object, timeout: Duration = DEFAULT_COMMAND_TIMEOUT): Promise<unknown> {
        if (this.#isClosed) {
            return Promise.reject(this.#closedError());
        }

        const messageId = String(this.#nextId++);

        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    this.#settle(messageId)?.reject(
                        new TimeoutError(
                            `matterjs-server did not answer "${command}" within ${Duration.format(timeout)}`,
                        ),
                    ),
                timeout,
            );

            this.#pending.set(messageId, {
                command,
                resolve,
                reject,
                timer,
            });

            this.#socket.send(toBigIntAwareJson({ message_id: messageId, command, args }), error => {
                if (error) {
                    this.#settle(messageId)?.reject(error);
                }
            });
        });
    }

    /** Close the connection, rejecting commands still pending. */
    async close(): Promise<void> {
        if (!this.#isClosed) {
            this.#socket.close();
        }
        const timer = setTimeout(() => this.#socket.terminate(), CLOSE_TIMEOUT);
        try {
            await this.#closed;
        } finally {
            clearTimeout(timer);
        }
    }

    #settle(messageId: string) {
        const pending = this.#pending.get(messageId);
        if (pending !== undefined) {
            clearTimeout(pending.timer);
            this.#pending.delete(messageId);
        }
        return pending;
    }

    #onFrame(text: string) {
        try {
            this.#dispatch(parseBigIntAwareJson(text));
        } catch (cause) {
            this.#closeCause = new UnexpectedDataError(`Unusable frame from matterjs-server: ${text}`, { cause });
            this.#socket.terminate();
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
            return;
        }

        if (typeof frame.error_code === "number") {
            pending.reject(new MatterServerCommandError(pending.command, frame.error_code, frame.details));
        } else {
            pending.resolve(frame.result);
        }
    }

    #onClose() {
        this.#isClosed = true;
        const error = this.#closedError();
        for (const messageId of [...this.#pending.keys()]) {
            this.#settle(messageId)?.reject(error);
        }
    }

    #closedError() {
        return new ClosedError("Connection to matterjs-server is closed", { cause: this.#closeCause });
    }
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
        throw new UnexpectedDataError(`First message from matterjs-server is not a complete server_info: ${text}`);
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
