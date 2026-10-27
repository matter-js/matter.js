/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ChildProcess, type ChildProcessByStdio, spawn } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

/** How a {@link ManagedChildProcess} ended. `code` and `signal` are both `null` for a process that never ran. */
export interface ChildExit {
    code: number | null;
    signal: NodeJS.Signals | null;

    /**
     * Set when {@link ManagedChildProcess.stop} or {@link ManagedChildProcess.kill} sent a signal before this process
     * saw the exit. False for a process that ended on its own, also when `stop()` came after the exit but before the
     * output drained.
     */
    requested: boolean;

    /** Why the process could not be started (ENOENT, exec format), for one that never ran. */
    error?: Error;
}

/** Options of {@link ManagedChildProcess.spawn}. */
export interface ManagedChildProcessOptions {
    /** `"pipe"` keeps the child's {@link ManagedChildProcess.stdin} open. Defaults to `"ignore"`. */
    stdin?: "pipe" | "ignore";

    /**
     * Receives every line the child writes to stdout or stderr. Without it the caller reads
     * {@link ManagedChildProcess.stdout} and {@link ManagedChildProcess.stderr} itself.
     */
    onLine?: (line: string) => void;

    /**
     * Called once when a process that ran has ended and its output was read. Not called for a process that could not
     * be started, which {@link ManagedChildProcess.started} reports.
     */
    onExit?: (exit: ChildExit) => void;

    /** The child's whole environment. Defaults to this process's environment. */
    env?: NodeJS.ProcessEnv;

    /** How long {@link ManagedChildProcess.stop} waits after SIGTERM before it sends SIGKILL. Defaults to 5 s. */
    stopGraceMs?: number;
}

const DEFAULT_STOP_GRACE_MS = 5_000;

/**
 * How long output may still arrive after the process exited. A process it started can hold the pipes open for as long
 * as it lives.
 */
const OUTPUT_DRAIN_MS = 1_000;

const TERMINATING_SIGNALS = ["SIGINT", "SIGTERM"] as const;

/** Killed when this process exits or is told to terminate: nothing else ends a child with its parent. */
const liveChildren = new Set<ChildProcess>();

function killLiveChildren() {
    for (const child of liveChildren) {
        child.kill("SIGKILL");
    }
}

/**
 * A listener for a terminating signal replaces Node's default of exiting, so where no one else listens for it the
 * signal is raised again once the children are gone.
 */
function onTerminatingSignal(signal: NodeJS.Signals) {
    killLiveChildren();
    if (process.listenerCount(signal) === 1) {
        unwatchParent();
        process.kill(process.pid, signal);
    }
}

function watchParent() {
    process.on("exit", killLiveChildren);
    for (const signal of TERMINATING_SIGNALS) {
        process.on(signal, onTerminatingSignal);
    }
}

function unwatchParent() {
    process.off("exit", killLiveChildren);
    for (const signal of TERMINATING_SIGNALS) {
        process.off(signal, onTerminatingSignal);
    }
}

function track(child: ChildProcess) {
    if (liveChildren.size === 0) {
        watchParent();
    }
    liveChildren.add(child);
}

function untrack(child: ChildProcess) {
    if (liveChildren.delete(child) && liveChildren.size === 0) {
        unwatchParent();
    }
}

/**
 * A child process a test harness starts and owns: it is stopped with SIGTERM and, after a grace period, SIGKILL, and
 * it is killed when the test process exits or receives SIGINT or SIGTERM. A test process killed with SIGKILL cannot
 * take its children along.
 */
export class ManagedChildProcess {
    /** Settles once the process ended and its output was read, or once it failed to start. Never rejects. */
    readonly exited: Promise<ChildExit>;

    readonly #child: ChildProcessByStdio<Writable | null, Readable, Readable>;
    readonly #spawned: Promise<undefined>;
    readonly #stopGraceMs: number;
    #exit?: ChildExit;
    #stopping?: Promise<ChildExit>;
    #requested = false;

    private constructor(command: string, args: string[], options: ManagedChildProcessOptions) {
        const { stdin = "ignore", onLine, onExit, env, stopGraceMs = DEFAULT_STOP_GRACE_MS } = options;
        this.#stopGraceMs = stopGraceMs;

        const child =
            stdin === "pipe"
                ? spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env })
                : spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
        this.#child = child;
        track(child);

        this.#spawned = new Promise(resolve => child.once("spawn", () => resolve(undefined)));

        this.exited = new Promise<ChildExit>(resolve => {
            const settle = (exit: ChildExit) => {
                if (this.#exit !== undefined) {
                    return;
                }
                untrack(child);
                this.#exit = exit;
                resolve(exit);
                if (exit.error === undefined) {
                    try {
                        onExit?.(exit);
                    } catch (error) {
                        console.warn(`Exit listener of ${command} failed:`, error);
                    }
                }
            };

            child.once("exit", (code, signal) => {
                untrack(child);
                const exit = { code, signal, requested: this.#requested };
                const drained = setTimeout(() => {
                    child.stdout.destroy();
                    child.stderr.destroy();
                    settle(exit);
                }, OUTPUT_DRAIN_MS);
                child.once("close", () => {
                    clearTimeout(drained);
                    settle(exit);
                });
            });

            child.on("error", error => {
                if (child.pid === undefined) {
                    settle({ code: null, signal: null, requested: false, error });
                } else {
                    console.warn(`Signalling ${command} (pid ${child.pid}) failed:`, error);
                }
            });
        });

        if (onLine !== undefined) {
            for (const stream of [child.stdout, child.stderr]) {
                createInterface({ input: stream, crlfDelay: Infinity }).on("line", onLine);
            }
        }
    }

    /** Starts `command` with `args`. */
    static spawn(command: string, args: string[], options: ManagedChildProcessOptions = {}): ManagedChildProcess {
        return new ManagedChildProcess(command, args, options);
    }

    /** The child's standard input, where it was spawned with `stdin: "pipe"`. */
    get stdin(): Writable | null {
        return this.#child.stdin;
    }

    get stdout(): Readable {
        return this.#child.stdout;
    }

    get stderr(): Readable {
        return this.#child.stderr;
    }

    /** Resolves once the process runs; rejects with the spawn error for one that could not be started. */
    async started(): Promise<void> {
        const exit = await Promise.race([this.#spawned, this.exited]);
        if (exit?.error !== undefined) {
            throw exit.error;
        }
    }

    /** Sends SIGKILL now, without the grace period {@link stop} gives. */
    kill() {
        this.#signal("SIGKILL");
    }

    /**
     * Sends SIGTERM, and SIGKILL once the grace period passed, and resolves once the process ended. Safe to call more
     * than once and after the process ended on its own.
     */
    stop(): Promise<ChildExit> {
        this.#stopping ??= this.#stop();
        return this.#stopping;
    }

    async #stop(): Promise<ChildExit> {
        if (this.#exit !== undefined) {
            return this.#exit;
        }
        this.#signal("SIGTERM");
        const timer = setTimeout(() => this.#signal("SIGKILL"), this.#stopGraceMs);
        try {
            return await this.exited;
        } finally {
            clearTimeout(timer);
        }
    }

    #signal(signal: NodeJS.Signals) {
        const child = this.#child;
        if (child.exitCode === null && child.signalCode === null) {
            if (child.kill(signal)) {
                this.#requested = true;
            }
        }
    }
}

/**
 * A port free at the moment of probing. Nothing holds it until the process that uses it binds, so a caller
 * racing another process for ports should pass an explicit one instead.
 */
export async function probeFreePort(): Promise<number> {
    const server = createServer();
    try {
        return await new Promise<number>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                if (address === null || typeof address === "string") {
                    reject(new Error("Port probe socket reported no address"));
                    return;
                }
                resolve(address.port);
            });
        });
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}
