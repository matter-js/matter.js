/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ClosedError,
    Duration,
    ImplementationError,
    InternalError,
    isObject,
    MatterError,
    Millis,
    Seconds,
    TimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import { CERT_BINS_PLATFORM, prepareChipBins, resolveChipBinsSource } from "@matter/testing";
import { ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { arch as hostArch, env, platform as hostPlatform } from "node:process";
import type { Readable } from "node:stream";
import { WebSocket } from "ws";
import { parseChipJson } from "./json-codec.js";

/** Line chip-tool's interactive server prints on stdout once its WebSocket accepts connections. */
export const CHIP_TOOL_READY_MESSAGE = "== WebSocket Server Ready";

/** Commissioner names chip-tool maps to fabric ids 1, 2 and 3. */
export type ChipToolCommissionerName = "alpha" | "beta" | "gamma";

const DEFAULT_STARTUP_TIMEOUT = Seconds(60);
const DEFAULT_COMMAND_TIMEOUT = Seconds(180);
const CONNECT_ATTEMPTS = 5;
const CONNECT_RETRY_INTERVAL = Seconds(1);
const DEFAULT_CONNECT_TIMEOUT = Seconds(5);
const STOP_TIMEOUT = Seconds(5);
const RECENT_OUTPUT_LINES = 20;

/** Thrown when chip-tool never becomes usable: no readiness line, or no reachable WebSocket. */
export class ChipToolStartupError extends MatterError {}

/** Thrown for every command outstanding or attempted after chip-tool exits on its own. */
export class ChipToolExitError extends MatterError {}

/** One reply frame from chip-tool's interactive server. */
export interface ChipToolResult {
    /** Parsed `results` entries, in arrival order. */
    results: unknown[];

    /**
     * Decoded log lines from this reply's `logs` array — a subset of what the child also wrote to
     * stdout, since chip-tool's log redirect feeds both. Use these to parse a value out of one
     * command's own output (a pairing code, say); {@link ChipToolClientOptions.onLog} carries the
     * complete stream.
     */
    logs: string[];
}

export interface ChipToolClientOptions {
    binaryPath: string;
    storageDirectory: string;
    commissionerName: ChipToolCommissionerName;

    /** Interactive-server port. Defaults to a free port probed at {@link ChipToolClient.start}. */
    port?: number;

    /** How long {@link ChipToolClient.start} waits for {@link CHIP_TOOL_READY_MESSAGE}. */
    startupTimeout?: Duration;

    /** How long one WebSocket handshake attempt may take before it counts as a failed attempt. */
    connectTimeout?: Duration;

    /**
     * Receives the child's stdout/stderr lines and this client's own diagnostics.
     *
     * A reply's `logs` array is deliberately not forwarded here: chip-tool's
     * `InteractiveServerLoggingCallback` writes each recorded line to `Platform::LogV` as well, so
     * forwarding both would double every line logged while its result slot was armed — and log
     * checks count occurrences.
     */
    onLog: (line: string) => void;

    /** Receives result entries that arrive outside any command reply. */
    onAsyncResult: (entry: unknown) => void;
}

interface PendingCommand {
    command: string;
    timeout: Duration;
    timer?: NodeJS.Timeout;
    resolve: (result: ChipToolResult) => void;
    reject: (cause: unknown) => void;
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => (resolve = r));
    return { promise, resolve };
}

interface ExitInfo {
    code: number | null;
    signal: NodeJS.Signals | null;
}

function describeExit({ code, signal }: ExitInfo) {
    if (code !== null) {
        return `exited with code ${code}`;
    }
    if (signal !== null) {
        return `exited on signal ${signal}`;
    }
    return "exited without a status";
}

/**
 * chip-tool binaries from `chip-cert-bins` are Linux ELF executables spawned directly on the host —
 * and that image publishes {@link CERT_BINS_PLATFORM} only, so a host of any other architecture needs
 * its own build via `MATTER_CERT_APP_DIR`. An unsupported host must say so rather than surfacing as an
 * exec-format spawn failure. Mirrors `resolveChipLocalAppDir`'s guard for the chip-app binaries beside
 * them.
 */
export function assertChipToolHostSupported(platform: string, arch: string = hostArch) {
    const host = `${platform}/${arch}`;
    if (host !== CERT_BINS_PLATFORM) {
        throw new ImplementationError(
            `MATTER_CHIP_BINS_SOURCE=cert-bins selects ${CERT_BINS_PLATFORM} binaries that a chip-tool ` +
                `controller spawns directly on the host; this host is "${host}", which cannot run them. Use a ` +
                `${CERT_BINS_PLATFORM} host or CI runner for MATTER_CERT_CONTROLLER=chip-tool with cert-bins, or ` +
                "unset MATTER_CHIP_BINS_SOURCE and point MATTER_CERT_APP_DIR at a chip-tool built for this platform.",
        );
    }
}

/**
 * Locate the `chip-tool` binary a controller adapter spawns, from the same sources
 * `resolveChipLocalAppDir` uses for the chip-app binaries extracted beside it.
 */
export async function resolveChipToolBinary(): Promise<string> {
    if (resolveChipBinsSource() === "cert-bins") {
        assertChipToolHostSupported(hostPlatform);
        return join((await prepareChipBins()).dir, "chip-tool");
    }

    const dir = env.MATTER_CERT_APP_DIR;
    if (!dir) {
        throw new ImplementationError(
            "MATTER_CERT_APP_DIR is not set; a chip-tool controller needs it to find the chip-tool binary",
        );
    }
    return join(dir, "chip-tool");
}

/**
 * A port free at the moment of probing. Nothing holds it until chip-tool binds, so a caller racing
 * another process for ports should pass an explicit one instead.
 */
async function probeFreePort(): Promise<number> {
    const server = createServer();
    try {
        const port = await new Promise<number>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                if (address === null || typeof address === "string") {
                    reject(new InternalError("Port probe socket reported no address"));
                    return;
                }
                resolve(address.port);
            });
        });
        return port;
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}

/**
 * Whether chip-tool reads a frame as an async-report arming frame rather than as a command to run.
 *
 * Mirrors `InteractiveServerCommand::OnWebSocketMessageReceived`
 * (`examples/chip-tool/commands/interactive/InteractiveCommands.cpp`): the frame is empty, or its C
 * string is at most five bytes and a `uint16_t` stream extraction of it does not fail. Every rule below
 * was measured by compiling that C++ against libstdc++, which is what CI runs:
 *
 * - the length is `strlen`, so bytes rather than characters: `"1ééé"` is seven bytes and runs
 * - the extraction skips leading whitespace and takes a sign, and stops at the first non-digit without
 *   failing, so `" 5"`, `"+5"` and `"5abc"` all arm reports while `"abc"` and `"+"` do not
 * - a value the type cannot hold fails, so `"65536"` runs as a command even though `"65535"` does not
 * - a negative wraps into the type instead of failing, so `"-1"` arms reports with a timeout of 65535
 *
 * Anything this returns true for is never run as a command, whoever sent it, which is why the test
 * double for chip-tool decides with this same function rather than a copy of it.
 */
export function isAsyncReportFrame(frame: string) {
    const length = Buffer.byteLength(frame, "utf8");
    if (length === 0) {
        return true;
    }
    if (length > 5) {
        return false;
    }

    const parsed = frame.match(/^\s*([-+]?)(\d+)/);
    if (parsed === null) {
        return false;
    }

    const [, sign, digits] = parsed;
    return sign === "-" || Number(digits) <= 0xffff;
}

/**
 * chip-tool's numeric sniff reads a short command starting with a digit as an async-report arming
 * frame, so the command would silently never run.
 */
function assertCommandFrame(command: string) {
    if (isAsyncReportFrame(command)) {
        throw new ImplementationError(
            `chip-tool would read the command ${JSON.stringify(command)} as an async-report arming frame ` +
                "rather than running it (empty, or at most five characters parsing as a number)",
        );
    }
}

function decodeLogs(logs: unknown[]): string[] {
    const lines = new Array<string>();

    for (const log of logs) {
        if (!isObject(log) || typeof log.message !== "string") {
            throw new UnexpectedDataError(
                `chip-tool reply carried a log entry without a base64 "message" string: ${JSON.stringify(log)}`,
            );
        }

        for (const line of Buffer.from(log.message, "base64").toString("utf8").split("\n")) {
            if (line !== "") {
                lines.push(line.replace(/\r$/, ""));
            }
        }
    }

    return lines;
}

function parseFrame(frame: string): ChipToolResult {
    let parsed;
    try {
        // A reply can carry a uint64 attribute value or data version, which `JSON.parse` rounds
        parsed = parseChipJson(frame);
    } catch (cause) {
        throw new UnexpectedDataError(`chip-tool reply is not valid JSON: ${frame.slice(0, 200)}`, { cause });
    }

    if (!isObject(parsed) || !Array.isArray(parsed.results) || !Array.isArray(parsed.logs)) {
        throw new UnexpectedDataError(
            `chip-tool reply was not a { results: [], logs: [] } frame: ${frame.slice(0, 200)}`,
        );
    }

    return { results: parsed.results, logs: decodeLogs(parsed.logs) };
}

/**
 * Drives one `chip-tool interactive server` child process over its WebSocket.
 *
 * chip-tool records command results into a single global slot (`InteractiveServerResult`), armed when
 * a frame arrives and disarmed immediately after the reply that frame produces. Three consequences
 * shape this class:
 *
 * - Commands are serialized. Two frames outstanding at once would interleave their results into one
 *   reply, so {@link execute} queues.
 * - Nothing is recorded while the slot is disarmed. To receive subscription reports the client parks
 *   an *async-report* frame ({@link armReports}); chip-tool answers it with the first report and
 *   disarms again, so the client re-arms after every report and after the command queue drains.
 * - A report arriving while a command is in flight lands in that command's `results`. Reports are
 *   therefore forwarded to the caller alongside the command's own entries and demultiplexed by path
 *   one layer up, never dropped here.
 *
 * Two windows are inherent to that protocol and cannot be closed from this side: a report recorded
 * between chip-tool's reply and the client's re-arm is discarded by chip-tool, and a report sent in
 * the instant between a command frame leaving the client and chip-tool reading it arrives as a frame
 * this client attributes to the command. Neither is safe for a test that counts reports exactly.
 */
export class ChipToolClient {
    #options: ChipToolClientOptions;
    #child?: ChildProcess;
    #socket?: WebSocket;
    #exit = deferred<ExitInfo>();
    #exited?: ExitInfo;
    #readiness = deferred<void>();
    #recentOutput = new Array<string>();
    #failure?: Error;
    #starting = false;
    #closing = false;

    #queue = new Array<PendingCommand>();
    #current?: PendingCommand;

    // A command abandoned at its timeout still owns chip-tool's result slot until its reply arrives.
    // Dispatching the next command before then would attribute the abandoned reply to it.
    #abandonedReplies = 0;

    #reportsRequested = false;
    #reportTimeout?: Duration;
    #parked = false;

    constructor(options: ChipToolClientOptions) {
        this.#options = options;
    }

    /** Spawn chip-tool, wait for {@link CHIP_TOOL_READY_MESSAGE}, and connect to its WebSocket. */
    async start(): Promise<void> {
        if (this.#starting || this.#closing) {
            throw new ImplementationError("ChipToolClient.start() may only be called once");
        }
        this.#starting = true;

        const {
            binaryPath,
            storageDirectory,
            commissionerName,
            startupTimeout = DEFAULT_STARTUP_TIMEOUT,
        } = this.#options;
        const port = this.#options.port ?? (await probeFreePort());

        const child = spawn(
            binaryPath,
            [
                "interactive",
                "server",
                "--port",
                String(port),
                "--storage-directory",
                storageDirectory,
                "--commissioner-name",
                commissionerName,
            ],
            { stdio: ["ignore", "pipe", "pipe"] },
        );
        this.#child = child;

        for (const stream of [child.stdout, child.stderr]) {
            if (stream === null) {
                throw new InternalError("Spawned chip-tool has no stdout/stderr streams");
            }
            this.#pumpLines(stream);
        }

        child.once("exit", (code, signal) => this.#onExit({ code, signal }));
        child.once("error", cause => {
            // spawn() failures (ENOENT, exec format) surface here, not via "exit"
            this.#options.onLog(`Error running ${binaryPath}: ${cause}`);
            this.#onExit({ code: null, signal: null });
        });

        await this.#awaitReadiness(startupTimeout);
        this.#socket = await this.#connect(`ws://127.0.0.1:${port}`);
        this.#maybePark();
    }

    /**
     * Send one CLI line and resolve with its reply. Calls are serialized: chip-tool has one result
     * slot, so a second frame in flight would interleave its results into another command's reply.
     *
     * The reply's `results` carry whatever chip-tool recorded while the command ran — including error
     * entries and any subscription report that arrived meanwhile. Interpreting them is the caller's
     * job.
     *
     * `timeout` bounds the whole call, queue wait included.
     */
    async execute(command: string, timeout: Duration = DEFAULT_COMMAND_TIMEOUT): Promise<ChipToolResult> {
        assertCommandFrame(command);

        if (this.#failure) {
            throw this.#failure;
        }
        if (this.#closing) {
            throw new ClosedError(`chip-tool (commissioner "${this.#options.commissionerName}") is closing`);
        }
        if (this.#socket === undefined) {
            throw new ImplementationError("ChipToolClient.execute() requires a successful start()");
        }

        return new Promise<ChipToolResult>((resolve, reject) => {
            const pending: PendingCommand = { command, timeout, resolve, reject };
            // The clock starts on the call, not on dispatch: a command queued behind one chip-tool
            // never answered must still settle rather than wait for a slot that never frees
            pending.timer = setTimeout(() => this.#abandon(pending), timeout);
            this.#queue.push(pending);
            this.#dispatch();
        });
    }

    /**
     * Park an async-report frame so subscription reports reach `onAsyncResult` while no command is in
     * flight. Idempotent, and safe before {@link start}.
     *
     * `timeout` asks chip-tool to answer an unfulfilled park with a timeout error after that long.
     * Omit it unless the answer is wanted: chip-tool only cancels that timer when it answers the park
     * itself, so a park superseded by a command leaves the timer running, and the error entry it
     * eventually produces lands in an unrelated command's results.
     */
    armReports(timeout?: Duration) {
        this.#reportsRequested = true;
        this.#reportTimeout = timeout;
        this.#maybePark();
    }

    /**
     * Stop parking async-report frames. A frame already parked stays armed on chip-tool's side until
     * the next command supersedes it or the socket closes — nothing withdraws it.
     */
    disarmReports() {
        this.#reportsRequested = false;
        this.#reportTimeout = undefined;
    }

    /** Close the socket, terminate chip-tool, and reject anything still queued. */
    async close(): Promise<void> {
        this.#closing = true;
        this.#reportsRequested = false;

        const socket = this.#socket;
        this.#socket = undefined;
        if (socket !== undefined) {
            const closed = new Promise<void>(resolve => socket.once("close", () => resolve()));
            socket.close();
            await Promise.race([closed, this.#delay(STOP_TIMEOUT)]);
            socket.terminate();
        }

        await this.#stopChild();

        this.#fail(new ClosedError(`chip-tool (commissioner "${this.#options.commissionerName}") is closed`));
    }

    async #stopChild() {
        const child = this.#child;
        if (child === undefined || this.#exited !== undefined) {
            return;
        }

        child.kill("SIGTERM");
        const outcome = await Promise.race([
            this.#exit.promise.then(() => "exited" as const),
            this.#delay(STOP_TIMEOUT),
        ]);
        if (outcome !== "exited") {
            child.kill("SIGKILL");
            await this.#exit.promise;
        }
    }

    #delay(duration: Duration): Promise<"timeout"> {
        return new Promise<"timeout">(resolve => {
            const timer = setTimeout(() => resolve("timeout"), duration);
            // Nothing else settles this promise, so the timer must not hold the event loop open past
            // the wait it bounds
            timer.unref();
        });
    }

    /**
     * The child's own last words, for a startup failure's message. A failed `start()` leaves the cert
     * run with no {@link EvidenceRecorder}, so nothing flushes the log this client fed line by line —
     * without this a loader failure surfaces as a bare exit code.
     */
    #outputForDiagnosis() {
        if (this.#recentOutput.length === 0) {
            return " and without writing any output (a 127 exit is typically a missing shared library)";
        }
        return `; its last output was:\n${this.#recentOutput.map(line => `    ${line}`).join("\n")}`;
    }

    async #awaitReadiness(timeout: Duration) {
        const outcome = await Promise.race([
            this.#readiness.promise.then(() => "ready" as const),
            this.#exit.promise.then(() => "exited" as const),
            this.#delay(timeout),
        ]);

        switch (outcome) {
            case "ready":
                return;

            case "exited":
                throw new ChipToolStartupError(
                    `chip-tool ${describeExit(this.#exited ?? { code: null, signal: null })} before printing ` +
                        `"${CHIP_TOOL_READY_MESSAGE}"${this.#outputForDiagnosis()}`,
                );

            default:
                throw new ChipToolStartupError(
                    `chip-tool did not print "${CHIP_TOOL_READY_MESSAGE}" within ` +
                        `${Duration.format(timeout)}${this.#outputForDiagnosis()}`,
                );
        }
    }

    async #connect(url: string): Promise<WebSocket> {
        const { connectTimeout = DEFAULT_CONNECT_TIMEOUT } = this.#options;
        let lastCause: unknown;

        for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
            if (this.#failure) {
                throw this.#failure;
            }

            try {
                return await this.#connectOnce(url, connectTimeout);
            } catch (cause) {
                lastCause = cause;
                this.#options.onLog(
                    `chip-tool connection attempt ${attempt}/${CONNECT_ATTEMPTS} to ${url} failed: ${cause}`,
                );
            }

            await Promise.race([this.#delay(Millis(CONNECT_RETRY_INTERVAL * attempt)), this.#exit.promise]);
        }

        throw new ChipToolStartupError(`Connecting to chip-tool at ${url} failed after ${CONNECT_ATTEMPTS} attempts`, {
            cause: lastCause,
        });
    }

    /**
     * `ws` bounds the handshake by nothing at all, so a port that accepts the connection without
     * completing the upgrade would leave this pending forever, and with it the retry loop above.
     */
    #connectOnce(url: string, timeout: Duration): Promise<WebSocket> {
        return new Promise<WebSocket>((resolve, reject) => {
            const socket = new WebSocket(url);
            let timer: NodeJS.Timeout | undefined;

            const onOpen = () => {
                clearTimeout(timer);
                // The rejecting handler goes and the persistent ones arrive in the same tick: an
                // `error` event with no listener at all is fatal to the process
                socket.off("error", onError);
                resolve(this.#attachSocket(socket));
            };

            const abandon = (cause: Error) => {
                clearTimeout(timer);
                socket.off("open", onOpen);
                socket.off("error", onError);
                // terminate() can raise an `error` of its own, and an `error` event with no listener at
                // all is fatal to the process
                socket.on("error", failure => this.#options.onLog(`chip-tool WebSocket error: ${failure}`));
                socket.terminate();
                reject(cause);
            };

            const onError = (cause: Error) => abandon(cause);

            // Declared before the handlers close over it, so a `ws` that ever managed to emit `error`
            // synchronously would report its own cause rather than a temporal-dead-zone failure
            timer = setTimeout(
                () =>
                    abandon(
                        new ChipToolStartupError(
                            `chip-tool at ${url} did not complete the WebSocket handshake within ` +
                                Duration.format(timeout),
                        ),
                    ),
                timeout,
            );

            socket.once("open", onOpen);
            socket.once("error", onError);
        });
    }

    #attachSocket(socket: WebSocket): WebSocket {
        socket.on("message", data => this.#onFrame(data.toString()));
        socket.on("error", cause => this.#options.onLog(`chip-tool WebSocket error: ${cause}`));
        socket.on("close", () => {
            if (this.#closing || this.#exited !== undefined) {
                return;
            }
            // The exit handler carries the authoritative reason; a live chip-tool that dropped its
            // socket can no longer serve commands either way.
            this.#child?.kill("SIGKILL");
        });
        return socket;
    }

    #pumpLines(stream: Readable) {
        let buffer = "";

        const emit = (line: string) => {
            this.#recentOutput.push(line);
            if (this.#recentOutput.length > RECENT_OUTPUT_LINES) {
                this.#recentOutput.shift();
            }
            this.#options.onLog(line);
            if (line.includes(CHIP_TOOL_READY_MESSAGE)) {
                this.#readiness.resolve();
            }
        };

        stream.setEncoding("utf8");
        stream.on("data", (chunk: string) => {
            buffer += chunk;
            let index = buffer.indexOf("\n");
            while (index !== -1) {
                emit(buffer.slice(0, index).replace(/\r$/, ""));
                buffer = buffer.slice(index + 1);
                index = buffer.indexOf("\n");
            }
        });
        stream.on("end", () => {
            if (buffer !== "") {
                emit(buffer);
                buffer = "";
            }
        });
    }

    #onExit(info: ExitInfo) {
        if (this.#exited !== undefined) {
            return;
        }
        this.#exited = info;
        this.#exit.resolve(info);

        if (!this.#closing) {
            this.#fail(
                new ChipToolExitError(
                    `chip-tool (commissioner "${this.#options.commissionerName}") ${describeExit(info)}`,
                ),
            );
        }
    }

    #fail(cause: Error) {
        if (this.#failure !== undefined) {
            return;
        }
        this.#failure = cause;

        const current = this.#current;
        this.#current = undefined;
        if (current !== undefined) {
            clearTimeout(current.timer);
            current.reject(cause);
        }

        for (const pending of this.#queue.splice(0)) {
            clearTimeout(pending.timer);
            pending.reject(cause);
        }
    }

    #dispatch() {
        if (this.#failure !== undefined || this.#closing || this.#socket === undefined) {
            return;
        }
        if (this.#current !== undefined || this.#abandonedReplies !== 0) {
            return;
        }

        const next = this.#queue.shift();
        if (next === undefined) {
            this.#maybePark();
            return;
        }

        this.#current = next;
        // chip-tool's Setup() on this frame overwrites any armed async-report mode, so the parked
        // frame is superseded rather than answered
        this.#parked = false;
        this.#send(next.command);
    }

    #abandon(pending: PendingCommand) {
        if (this.#current === pending) {
            this.#current = undefined;
            this.#abandonedReplies++;
            if (this.#abandonedReplies === 1) {
                this.#options.onLog(
                    `Abandoned chip-tool command ${JSON.stringify(pending.command)} still owns chip-tool's result ` +
                        "slot: until chip-tool answers it, no further command is sent and no subscription report is " +
                        "received, so every later timeout is this state and not the device",
                );
            }
        } else {
            const queued = this.#queue.indexOf(pending);
            if (queued === -1) {
                return;
            }
            this.#queue.splice(queued, 1);
        }

        pending.reject(
            new TimeoutError(
                `chip-tool command "${pending.command}" produced no reply within ${Duration.format(pending.timeout)}`,
            ),
        );
    }

    #maybePark() {
        if (!this.#reportsRequested || this.#parked || this.#failure !== undefined || this.#socket === undefined) {
            return;
        }
        if (this.#current !== undefined || this.#abandonedReplies !== 0 || this.#queue.length !== 0) {
            return;
        }

        this.#parked = true;
        const seconds = this.#reportTimeout === undefined ? 0 : Math.ceil(Seconds.fractionalOf(this.#reportTimeout));
        this.#send(seconds > 0 ? String(Math.min(seconds, 0xffff)) : "");
    }

    #send(frame: string) {
        // ws reports success as `null` rather than by omitting the argument
        this.#socket?.send(frame, cause => {
            if (cause !== undefined && cause !== null) {
                this.#options.onLog(`chip-tool frame ${JSON.stringify(frame)} failed to send: ${cause}`);
            }
        });
    }

    #onFrame(frame: string) {
        // Whichever frame armed chip-tool's slot owns this reply, and the slot is disarmed again now
        const current = this.#current;
        if (current !== undefined) {
            clearTimeout(current.timer);
            this.#current = undefined;
        } else if (this.#abandonedReplies !== 0) {
            this.#abandonedReplies--;
            if (this.#abandonedReplies === 0) {
                this.#options.onLog(
                    "chip-tool answered the abandoned command that held its result slot; commands and subscription " +
                        "reports resume from here",
                );
            }
        } else {
            this.#parked = false;
        }

        let result;
        try {
            result = parseFrame(frame);
        } catch (cause) {
            if (current === undefined) {
                this.#options.onLog(`Discarding unparseable chip-tool frame: ${cause}`);
            } else {
                current.reject(cause);
            }
            this.#dispatch();
            return;
        }

        if (current === undefined) {
            for (const entry of result.results) {
                this.#options.onAsyncResult(entry);
            }
        } else {
            current.resolve(result);
        }

        this.#dispatch();
    }
}
