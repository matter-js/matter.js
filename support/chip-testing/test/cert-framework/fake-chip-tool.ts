/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import { writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { CHIP_TOOL_READY_MESSAGE } from "../../src/chip-tool/chip-tool-client.js";

export function delay(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export function toBase64(text: string) {
    return Buffer.from(text, "utf8").toString("base64");
}

export async function waitFor(condition: () => boolean, what: string, timeoutMs = 5_000) {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new InternalError(`Timed out waiting for ${what}`);
        }
        await delay(5);
    }
}

/** What the fake serves for one command frame. */
export interface FakeReply {
    /** Result entries the command records through the slot before its reply goes out. */
    results?: unknown[];

    /** Log messages the command records; the fake base64-encodes them as chip-tool does. */
    logs?: string[];

    /** Non-zero appends `{"error": "FAILURE"}` to the reply, as `AsJsonString` does. */
    status?: number;

    /** How long the command takes, leaving the slot armed meanwhile. */
    delayMs?: number;

    /** Models a command still in progress: the slot stays armed and no reply is ever sent. */
    hang?: boolean;
}

interface FakeLog {
    module: string;
    category: string;
    message: string;
}

/**
 * Stand-in for chip-tool's interactive WebSocket server, modelled on `InteractiveServerResult` and
 * `InteractiveServerCommand::OnWebSocketMessageReceived`:
 *
 * - One global result slot. `Setup()` arms it on frame receipt, `Reset()` disarms it right after the
 *   reply, and `MaybeAddResult` drops anything recorded while it is disarmed.
 * - An empty frame, or a frame of at most five characters that parses as a number, arms *async report*
 *   mode and gets no reply of its own.
 * - A result recorded while async-report mode is armed is sent immediately as its own frame, which
 *   disarms the slot again. A result recorded while a command is in flight lands in that command's
 *   reply instead.
 *
 * Anything a real chip-tool could never observe of its client — a second command frame while one is in
 * flight, an arming frame during a command — is recorded in {@link violations} rather than tolerated.
 */
export class FakeChipTool {
    /** Every frame received, in arrival order. */
    readonly frames = new Array<string>();

    /** Command frames only. */
    readonly commands = new Array<string>();

    /** Async-report arming frames only. */
    readonly armings = new Array<string>();

    /** Client behavior the real server's single result slot cannot survive. */
    readonly violations = new Array<string>();

    /** Errors thrown while serving a frame. */
    readonly failures = new Array<unknown>();

    /** Reports recorded while the slot was disarmed, which the real server discards. */
    droppedReports = 0;

    /** Whether an async-report frame is currently armed and unanswered. */
    parked = false;

    openedSockets = 0;
    closedSockets = 0;

    reply: (command: string) => FakeReply = () => ({});

    #server: WebSocketServer;
    #socket?: WebSocket;
    #enabled = false;
    #async = false;
    #inFlight?: string;
    #results = new Array<unknown>();
    #logs = new Array<FakeLog>();
    #work: Promise<void> = Promise.resolve();

    private constructor(server: WebSocketServer) {
        this.#server = server;

        server.on("connection", socket => {
            this.openedSockets++;
            this.#socket = socket;
            socket.on("message", data => this.#receive(data.toString()));
            socket.on("close", () => {
                this.closedSockets++;
                if (this.#socket === socket) {
                    this.#socket = undefined;
                }
            });
        });
    }

    static async start(): Promise<FakeChipTool> {
        const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
        await new Promise<void>((resolve, reject) => {
            server.once("listening", resolve);
            server.once("error", reject);
        });
        return new FakeChipTool(server);
    }

    get port(): number {
        const address = this.#server.address();
        if (address === null || typeof address === "string") {
            throw new InternalError("Fake chip-tool server is not listening on a port");
        }
        return address.port;
    }

    /**
     * Record a result the way a subscription report reaches the slot, and report where it went.
     */
    pushReport(entry: unknown): "sent" | "appended" | "dropped" {
        if (!this.#enabled) {
            this.droppedReports++;
            return "dropped";
        }

        this.#results.push(entry);

        if (this.#async) {
            this.#send();
            this.#reset();
            return "sent";
        }

        return "appended";
    }

    /** Send a frame verbatim, for shapes `JSON.stringify` cannot produce. */
    sendRaw(frame: string) {
        this.#socket?.send(frame);
    }

    async close() {
        await this.#work;
        await new Promise<void>((resolve, reject) => this.#server.close(e => (e ? reject(e) : resolve())));
    }

    #receive(frame: string) {
        if (this.#inFlight !== undefined) {
            this.violations.push(
                `frame ${JSON.stringify(frame)} arrived while ${JSON.stringify(this.#inFlight)} was in flight`,
            );
        }

        this.frames.push(frame);
        this.#work = this.#work.then(() => this.#serve(frame)).catch(e => void this.failures.push(e));
    }

    async #serve(frame: string) {
        const isAsyncReport = frame.length === 0 || (frame.length <= 5 && /^\s*[-+]?\d/.test(frame));

        this.#enabled = true;
        this.#async = isAsyncReport;

        if (isAsyncReport) {
            this.armings.push(frame);
            this.parked = true;
            return;
        }

        // A command frame's Setup() overwrites any armed async-report mode, so the server never
        // answers the superseded frame.
        this.parked = false;
        this.commands.push(frame);

        const reply = this.reply(frame);
        this.#inFlight = frame;

        if (reply.delayMs) {
            await delay(reply.delayMs);
        }

        for (const result of reply.results ?? []) {
            this.#results.push(result);
        }
        for (const message of reply.logs ?? []) {
            this.#logs.push({ module: "TOO", category: "Info", message: toBase64(message) });
        }

        if (reply.hang) {
            return;
        }

        this.#send(reply.status ?? 0);
        this.#reset();
    }

    #send(status = 0) {
        const results = status === 0 ? this.#results : [...this.#results, { error: "FAILURE" }];
        this.#socket?.send(JSON.stringify({ results, logs: this.#logs }));
    }

    #reset() {
        this.#enabled = false;
        this.#async = false;
        this.#inFlight = undefined;
        this.#results = [];
        this.#logs = [];
    }
}

export interface StalledServer {
    port: number;
    close(): Promise<void>;
}

/** A listener that accepts a TCP connection and never answers the WebSocket upgrade on it. */
export async function startStalledServer(): Promise<StalledServer> {
    const accepted = new Array<Socket>();
    const server = createServer(socket => accepted.push(socket));

    const port = await new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (address === null || typeof address === "string") {
                reject(new InternalError("Stalled server is not listening on a port"));
                return;
            }
            resolve(address.port);
        });
    });

    return {
        port,
        async close() {
            // close() does not resolve while an accepted socket is still open
            for (const socket of accepted) {
                socket.destroy();
            }
            await new Promise<void>((resolve, reject) => server.close(e => (e ? reject(e) : resolve())));
        },
    };
}

const ANNOUNCE_READY = `echo "${CHIP_TOOL_READY_MESSAGE}"`;

/** Sleeps under `exec`, so the pid the stand-in recorded stays the pid a signal has to reach. */
export const READY_BODY = `${ANNOUNCE_READY}\nexec sleep 300\n`;
export const SLOW_READY_BODY = `sleep 0.2\n${ANNOUNCE_READY}\nexec sleep 300\n`;
export const NEVER_READY_BODY = `exec sleep 300\n`;
export const DYING_BODY = `${ANNOUNCE_READY}\nsleep 0.3\nexit 7\n`;

/**
 * Writes a `chip-tool` stand-in into `dir` that announces readiness the way the real binary does
 * without serving anything: a {@link FakeChipTool} listens on the port instead.
 */
export async function writeStandInBinary(dir: string, pidFile: string, body = READY_BODY): Promise<string> {
    const binaryPath = join(dir, "chip-tool");
    await writeFile(binaryPath, `#!/bin/sh\necho $$ > "${pidFile}"\n${body}`, { mode: 0o755 });
    return binaryPath;
}
