/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClosedError, Duration, InternalError, Millis, Seconds, Time } from "@matter/general";
import { CertConfigError, LineQueue, LogFollower } from "@matter/testing";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { probeFreePort } from "../chip-tool/chip-tool-client.js";
import { MatterServerClient } from "./matter-server-client.js";

/** Makes the server leave attribute subscriptions to the cert test instead of subscribing on its own. */
export const DISABLE_AUTO_SUBSCRIPTION_FLAG = "--disable-auto-subscription";

const DEFAULT_READINESS_TIMEOUT = Seconds(30);
const CONNECT_ATTEMPT_TIMEOUT = Seconds(2);
const RETRY_INTERVAL = Millis(200);
const EXIT_GRACE = Seconds(5);
const FAILURE_LOG_LINES = 50;

export interface MatterServerProcessOptions {
    /**
     * `MATTER_CERT_SERVER_ENTRY`: a `.js`/`.mjs`/`.cjs` file run with the current Node, or a command line split on whitespace
     * (so a path containing a space is not accepted).
     * A command line must exec the server directly: a wrapper such as `npx` may not forward SIGTERM, which leaves the
     * server running after {@link MatterServerProcess.close}.
     */
    entry: string;

    /** Names the log follower. */
    role: string;

    primaryInterface?: string;

    /** Aborts waiting for readiness; the child is stopped then. */
    signal?: AbortSignal;

    /** How long to wait for the server to accept connections. Defaults to 30 s. */
    readinessTimeout?: Duration;

    /** How long the child gets to exit after SIGTERM before it is killed. Defaults to 5 s. */
    exitGrace?: Duration;
}

/**
 * A matterjs-server child process with a connected {@link MatterServerClient}.
 */
export class MatterServerProcess {
    readonly client: MatterServerClient;
    readonly log: LogFollower;
    readonly entry: string;

    readonly #child: ChildProcess;
    readonly #exited: Promise<void>;
    readonly #storagePath: string;
    readonly #lines: LineQueue;
    readonly #exitGrace: Duration;
    #closing?: Promise<void>;

    private constructor(
        child: ChildProcess,
        exited: Promise<void>,
        client: MatterServerClient,
        lines: LineQueue,
        log: LogFollower,
        storagePath: string,
        entry: string,
        exitGrace: Duration,
    ) {
        this.entry = entry;
        this.#exitGrace = exitGrace;
        this.#child = child;
        this.#exited = exited;
        this.client = client;
        this.#lines = lines;
        this.log = log;
        this.#storagePath = storagePath;
    }

    static async start(options: MatterServerProcessOptions): Promise<MatterServerProcess> {
        const {
            entry,
            role,
            primaryInterface,
            signal,
            readinessTimeout = DEFAULT_READINESS_TIMEOUT,
            exitGrace = EXIT_GRACE,
        } = options;

        const storagePath = await mkdtemp(join(tmpdir(), "matter-cert-server-"));
        const lines = new LineQueue();
        let child: ChildProcess | undefined;
        let exited: Promise<void> | undefined;

        try {
            const port = await probeFreePort();
            const [command, ...entryArgs] = commandFor(entry);
            const args = [
                ...entryArgs,
                DISABLE_AUTO_SUBSCRIPTION_FLAG,
                "--enable-test-net-dcl",
                "--log-level",
                "debug",
                "--storage-path",
                storagePath,
                "--port",
                String(port),
            ];
            if (primaryInterface !== undefined) {
                args.push("--primary-interface", primaryInterface);
            }

            const recent = new Array<string>();
            const onLine = (line: string) => {
                recent.push(line);
                if (recent.length > FAILURE_LOG_LINES) {
                    recent.shift();
                }
                lines.push(line);
            };

            child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
            const spawned = child;

            const exit: ExitState = {};
            exited = new Promise<void>(resolve => {
                // "close" follows "exit" once stdio is drained, so the last lines are in `recent` by then
                spawned.once("close", (code, exitSignal) => {
                    exit.description = `exit code ${code ?? "none"}${exitSignal ? ` (signal ${exitSignal})` : ""}`;
                    resolve();
                });
                // A spawn failure (ENOENT) reports here, and "close" may not follow
                spawned.on("error", cause => {
                    onLine(`Error running ${command}: ${cause}`);
                    exit.description ??= "no exit code (failed to start)";
                    resolve();
                });
            });

            for (const stream of [spawned.stdout, spawned.stderr]) {
                if (stream === null) {
                    throw new InternalError("Spawned matterjs-server has no stdout/stderr streams");
                }
                createInterface({ input: stream }).on("line", onLine);
            }

            const client = await connectWhenReady(
                `ws://127.0.0.1:${port}`,
                exited,
                exit,
                recent,
                readinessTimeout,
                signal,
            );

            const log = new LogFollower(lines.follow(), role);
            return new MatterServerProcess(spawned, exited, client, lines, log, storagePath, entry, exitGrace);
        } catch (error) {
            await stopChild(child, exited, exitGrace);
            lines.close();
            await rm(storagePath, { recursive: true, force: true });
            throw error;
        }
    }

    /** Stop the server and remove its storage. Safe to call more than once. */
    close(): Promise<void> {
        this.#closing ??= this.#close();
        return this.#closing;
    }

    async #close() {
        try {
            await this.client.close();
        } finally {
            try {
                await stopChild(this.#child, this.#exited, this.#exitGrace);
            } finally {
                this.#lines.close();
                await rm(this.#storagePath, { recursive: true, force: true });
            }
        }
    }
}

interface ExitState {
    description?: string;
}

/** A single token ending in a script extension is a file for the current Node; anything with whitespace is a command line. */
function commandFor(entry: string): string[] {
    const parts = entry.split(/\s+/).filter(part => part.length > 0);
    if (parts.length === 0) {
        throw new CertConfigError("MATTER_CERT_SERVER_ENTRY is empty");
    }
    if (parts.length === 1 && /\.[cm]?js$/.test(parts[0])) {
        return [process.execPath, parts[0]];
    }
    return parts;
}

async function connectWhenReady(
    url: string,
    exited: Promise<void>,
    exit: ExitState,
    recent: string[],
    timeout: Duration,
    signal: AbortSignal | undefined,
): Promise<MatterServerClient> {
    const deadline = Time.nowUs + timeout;

    for (;;) {
        if (signal?.aborted) {
            throw new ClosedError(`Waiting for matterjs-server at ${url} was aborted`, { cause: signal.reason });
        }
        if (exit.description !== undefined) {
            throw new CertConfigError(
                `matterjs-server exited before it was ready (${exit.description}). Last ${FAILURE_LOG_LINES} log lines:\n` +
                    recent.join("\n"),
            );
        }

        try {
            return await MatterServerClient.connect(url, signal, CONNECT_ATTEMPT_TIMEOUT);
        } catch (cause) {
            if (Time.nowUs >= deadline) {
                throw new CertConfigError(
                    `matterjs-server did not become ready within ${Duration.format(timeout)} at ${url}. ` +
                        `Last ${FAILURE_LOG_LINES} log lines:\n${recent.join("\n")}`,
                    { cause },
                );
            }
        }

        let retryTimer: NodeJS.Timeout | undefined;
        try {
            await Promise.race([
                exited,
                new Promise<void>(resolve => (retryTimer = setTimeout(resolve, RETRY_INTERVAL))),
            ]);
        } finally {
            clearTimeout(retryTimer);
        }
    }
}

async function stopChild(child: ChildProcess | undefined, exited: Promise<void> | undefined, grace: Duration) {
    if (child === undefined || exited === undefined) {
        return;
    }
    if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
    }
    const timer = setTimeout(() => child.kill("SIGKILL"), grace);
    try {
        await exited;
    } finally {
        clearTimeout(timer);
    }
}
