/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, ClosedError, Duration, Seconds, TimeoutError } from "@matter/general";
import { DclCertificateService } from "@matter/main/protocol";
import { CertConfigError, type ChildExit, LineQueue, LogFollower, ManagedChildProcess } from "@matter/testing";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    CERT_CONTEXT_FILE,
    type CertContextFile,
    type CertContextLoaded,
    certContextLoadedOf,
    certContextRefusalOf,
} from "./matter-server-cert-context.js";
import { MatterServerClient } from "./matter-server-client.js";
import {
    REVOCATION_SET_FILE,
    REVOCATION_SETS_DIR,
    REVOCATION_SETS_DIR_FLAG,
    type RevocationSetsLoaded,
    revocationSetRefusalOf,
    revocationSetsLoadedOf,
} from "./matter-server-revocation.js";

/** Makes the server leave attribute subscriptions to the cert test instead of subscribing on its own. */
export const DISABLE_AUTO_SUBSCRIPTION_FLAG = "--disable-auto-subscription";

/** The only path the server upgrades to its WebSocket API; a request to any other path is never answered. */
export const WEBSOCKET_PATH = "/ws";

/** The only address the server listens on: its WebSocket API is unauthenticated and can commission and remove nodes. */
const LISTEN_ADDRESS = "127.0.0.1";

/**
 * The variables of this process's environment the server inherits, which a Node process and an entry started through
 * `npx` need. The server reads its own options from the environment too, so a variable set for the test runner, such
 * as `LISTEN_ADDRESS`, must not reach it.
 */
const INHERITED_ENVIRONMENT = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "USERPROFILE", "APPDATA"];

const DEFAULT_READINESS_TIMEOUT = Seconds(30);
const CONNECT_TIMEOUT = Seconds(5);

/**
 * The line the server logs once a listener accepts WebSocket connections on `/ws`, with the bound port after the last
 * `:` (an IPv6 host is not bracketed). Its wording is a contract of the server: matterjs-server `docs/cli.md`,
 * "Readiness line".
 */
const READINESS_LINE = /Webserver listening on http:\/\/(\S+)/;

/** Color codes the server may put into its console log, which would end up in the port and in recorded lines. */
// eslint-disable-next-line no-control-regex
const SGR_SEQUENCE = /\x1b\[[0-9;]*m/g;

/** A server log line without color codes. */
export function plainLogLine(line: string) {
    return line.replace(SGR_SEQUENCE, "");
}

/** The port a readiness line names, or `undefined` for any other line. */
export function readinessPortOf(line: string): number | undefined {
    const address = READINESS_LINE.exec(line)?.[1];
    if (address === undefined) {
        return undefined;
    }
    const port = Number(address.slice(address.lastIndexOf(":") + 1));
    return Number.isInteger(port) && port > 0 && port <= 0xffff ? port : undefined;
}
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

    /** Variables the server gets in addition to the few it inherits from this process. */
    env?: Record<string, string>;

    /**
     * Written to {@link CERT_CONTEXT_FILE} in the server's storage before it starts. The start then also waits for the
     * server to log that it loaded the file with as many key sets and groups as it holds, and fails with
     * `CertConfigError` where the server refuses the file or never says it loaded it.
     */
    certContext?: CertContextFile;

    /**
     * A revocation set, as the text of the file the CHIP SDK's `generate_revocation_set.py` writes. Written to
     * {@link REVOCATION_SET_FILE} in a directory of the server's storage that the server is pointed at with
     * {@link REVOCATION_SETS_DIR_FLAG}. The start then also waits for the server to log that it loaded one file with
     * as many entries as the set holds, and fails with `CertConfigError` where the server refuses the file or never
     * says it loaded it. Text that is no revocation set fails with `ImplementationError` before the server starts.
     */
    revocationSet?: string;
}

/**
 * A matterjs-server child process with a connected {@link MatterServerClient}.
 */
export class MatterServerProcess {
    readonly client: MatterServerClient;
    readonly log: LogFollower;
    readonly entry: string;
    readonly httpUrl: string;

    readonly #child: ManagedChildProcess;
    readonly #storagePath: string;
    readonly #lines: LineQueue;
    #closing?: Promise<void>;

    private constructor(
        child: ManagedChildProcess,
        client: MatterServerClient,
        lines: LineQueue,
        log: LogFollower,
        storagePath: string,
        entry: string,
        httpUrl: string,
    ) {
        this.entry = entry;
        this.httpUrl = httpUrl;
        this.#child = child;
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
            env,
            certContext,
            revocationSet,
        } = options;

        if (signal?.aborted) {
            throw new ClosedError("Starting matterjs-server was aborted before it began", { cause: signal.reason });
        }

        const storagePath = await mkdtemp(join(tmpdir(), "matter-cert-server-"));
        const lines = new LineQueue();
        let child: ManagedChildProcess | undefined;

        try {
            const observers = new Array<(line: string) => void>();
            const loadedAsWritten = new Array<Promise<void>>();

            if (certContext !== undefined) {
                const path = join(storagePath, CERT_CONTEXT_FILE);
                await writeFile(path, JSON.stringify(certContext, undefined, 4));
                const load = new StartupLoad({
                    path,
                    file: CERT_CONTEXT_FILE,
                    unloaded: `a server build without support for ${CERT_CONTEXT_FILE} ignores it`,
                    loadedOf: certContextLoadedOf,
                    refusalOf: certContextRefusalOf,
                });
                observers.push(line => load.observe(line));
                loadedAsWritten.push(certContextLoadedAsWritten(load.loaded, path, certContext));
            }

            const [command, ...entryArgs] = commandFor(entry);
            const args = [
                ...entryArgs,
                DISABLE_AUTO_SUBSCRIPTION_FLAG,
                "--enable-test-net-dcl",
                "--dcl-offline",
                "--log-level",
                "debug",
                "--storage-path",
                storagePath,
                "--listen-address",
                LISTEN_ADDRESS,
                "--port",
                "0",
            ];
            if (primaryInterface !== undefined) {
                args.push("--primary-interface", primaryInterface);
            }

            if (revocationSet !== undefined) {
                const dir = join(storagePath, REVOCATION_SETS_DIR);
                const entries = DclCertificateService.parseRevocationSet(revocationSet).length;
                await mkdir(dir);
                await writeFile(join(dir, REVOCATION_SET_FILE), revocationSet);
                args.push(REVOCATION_SETS_DIR_FLAG, dir);
                const load = new StartupLoad({
                    path: dir,
                    file: REVOCATION_SET_FILE,
                    unloaded: "its log before the readiness line says why",
                    loadedOf: revocationSetsLoadedOf,
                    refusalOf: revocationSetRefusalOf,
                });
                observers.push(line => load.observe(line));
                loadedAsWritten.push(revocationSetsLoadedAsWritten(load.loaded, dir, entries));
            }

            const recent = new Array<string>();
            let announce = (_port: number) => {};
            const listening = new Promise<number>(resolve => (announce = resolve));
            child = ManagedChildProcess.spawn(command, args, {
                env: { ...inheritedEnvironment(), ...env },
                stopGraceMs: exitGrace,
                onLine: raw => {
                    const line = plainLogLine(raw);
                    recent.push(line);
                    if (recent.length > FAILURE_LOG_LINES) {
                        recent.shift();
                    }
                    lines.push(line);
                    for (const observe of observers) {
                        observe(line);
                    }
                    const port = readinessPortOf(line);
                    if (port !== undefined) {
                        announce(port);
                    }
                },
            });

            const ready = Promise.all([listening, ...loadedAsWritten]).then(([port]) => port);
            const port = await readyPort(ready, child, command, recent, readinessTimeout, signal);
            const client = await MatterServerClient.connect(
                `ws://${LISTEN_ADDRESS}:${port}${WEBSOCKET_PATH}`,
                signal,
                CONNECT_TIMEOUT,
            );

            const log = new LogFollower(lines.follow(), role);
            return new MatterServerProcess(
                child,
                client,
                lines,
                log,
                storagePath,
                entry,
                `http://${LISTEN_ADDRESS}:${port}`,
            );
        } catch (error) {
            await child?.stop();
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
                await this.#child.stop();
            } finally {
                this.#lines.close();
                await rm(this.#storagePath, { recursive: true, force: true });
            }
        }
    }
}

function inheritedEnvironment() {
    const inherited: Record<string, string> = {};
    for (const name of INHERITED_ENVIRONMENT) {
        const value = process.env[name];
        if (value !== undefined) {
            inherited[name] = value;
        }
    }
    return inherited;
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

/** A file the server reads and installs before it starts its web server, and how its log reports that. */
interface StartupFile<T> {
    /** The path the server is given and names when it loaded it. */
    path: string;

    /** The file the server names when it refuses it. */
    file: string;

    /** Why a server may become ready without logging that it loaded the file. */
    unloaded: string;

    loadedOf(line: string): T | undefined;
    refusalOf(line: string): string | undefined;
}

/**
 * The server's handling of a {@link StartupFile}, as its log reports it up to the readiness line.
 *
 * The server reads the file and installs it before it starts its web server, so the readiness line settles it: loaded
 * where a loaded line came before it, ignored otherwise. A refusal of the file, or of installing it after it was read,
 * fails the wait when it is logged rather than when the server exits, since the server may go on or shut down slowly.
 */
class StartupLoad<T> {
    readonly loaded: Promise<T>;
    readonly #file: StartupFile<T>;
    #announce = (_loaded: T) => {};
    #refuse = (_error: CertConfigError) => {};
    #read?: T;

    constructor(file: StartupFile<T>) {
        this.#file = file;
        this.loaded = new Promise((resolve, reject) => {
            this.#announce = resolve;
            this.#refuse = reject;
        });
    }

    observe(line: string) {
        const { path, file, unloaded, loadedOf, refusalOf } = this.#file;
        this.#read ??= loadedOf(line);
        const refusal = refusalOf(line);
        if (refusal !== undefined) {
            this.#refuse(new CertConfigError(`matterjs-server refused its ${file}: ${refusal}`));
        } else if (readinessPortOf(line) !== undefined) {
            if (this.#read === undefined) {
                this.#refuse(
                    new CertConfigError(
                        `matterjs-server became ready without logging that it loaded ${path}; ${unloaded}`,
                    ),
                );
            } else {
                this.#announce(this.#read);
            }
        }
    }
}

/**
 * Resolves once the server logged that it loaded the file at `path` with the counts `written` holds; rejects with
 * `CertConfigError` where it loaded other counts or another file.
 */
async function certContextLoadedAsWritten(loaded: Promise<CertContextLoaded>, path: string, written: CertContextFile) {
    const { path: loadedPath, keySets, groups } = await loaded;
    if (loadedPath !== path || keySets !== written.keySets.length || groups !== written.groupKeyMap.length) {
        throw new CertConfigError(
            `matterjs-server loaded ${keySets} key sets and ${groups} groups from ${loadedPath}; the adapter wrote ` +
                `${written.keySets.length} key sets and ${written.groupKeyMap.length} groups to ${path}`,
        );
    }
}

/**
 * Resolves once the server logged that it loaded one file with `entries` entries from `dir`; rejects with
 * `CertConfigError` where it loaded other counts or from another directory.
 */
async function revocationSetsLoadedAsWritten(loaded: Promise<RevocationSetsLoaded>, dir: string, entries: number) {
    const { dir: loadedDir, files, entries: loadedEntries } = await loaded;
    if (loadedDir !== dir || files !== 1 || loadedEntries !== entries) {
        throw new CertConfigError(
            `matterjs-server loaded ${files} revocation set files with ${loadedEntries} entries from ${loadedDir}; ` +
                `the adapter wrote 1 file with ${entries} entries to ${dir}`,
        );
    }
}

/**
 * The port `ready` resolves with once the server logged its readiness line (and, where it was given a
 * {@link StartupFile}, that it loaded it); fails when the server exits, refuses such a file or takes too long.
 */
async function readyPort(
    ready: Promise<number>,
    child: ManagedChildProcess,
    command: string,
    recent: string[],
    timeout: Duration,
    signal: AbortSignal | undefined,
): Promise<number> {
    const lastLines = () => `Last ${FAILURE_LOG_LINES} log lines:\n${recent.join("\n")}`;
    using abort = new Abort({
        abort: signal,
        timeout,
        timeoutHandler() {
            this.abort(new TimeoutError(`matterjs-server did not become ready within ${Duration.format(timeout)}`));
        },
    });
    const outcome = await abort.race<number | ChildExit>(ready, child.exited);
    if (typeof outcome === "number") {
        return outcome;
    }
    if (outcome !== undefined) {
        throw new CertConfigError(
            `matterjs-server exited before it was ready (${describeExit(outcome, command)}). ${lastLines()}`,
        );
    }
    if (signal?.aborted) {
        throw new ClosedError("Waiting for matterjs-server to become ready was aborted", { cause: signal.reason });
    }
    throw new CertConfigError(`${abort.reason.message}. ${lastLines()}`, { cause: abort.reason });
}

function describeExit({ code, signal, error }: ChildExit, command: string) {
    if (error !== undefined) {
        return `${command} could not be started: ${error.message}`;
    }
    return `exit code ${code ?? "none"}${signal ? ` (signal ${signal})` : ""}`;
}
