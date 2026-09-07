/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess, spawn } from "node:child_process";
import { constants, lstat, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, platform as hostPlatform } from "node:process";
import type { BackchannelCommand } from "../../device/backchannel.js";
import type { Subject } from "../../device/subject.js";
import type { Container } from "../../docker/container.js";
import { Docker } from "../../docker/docker.js";
import { DockerError, NonZeroExitError } from "../../docker/errors.js";
import { Terminal } from "../../docker/terminal.js";
import { Volume } from "../../docker/volume.js";
import { delay, LineQueue } from "../../util/async.js";
import { asyncLinesOf } from "../../util/text.js";
import { CERT_BINS_PLATFORM, prepareChipBins, resolveChipBinsSource } from "../chip-bins.js";
import { chip } from "../chip.js";
import { HARNESS_DBUS_CONTAINER } from "../config.js";
import type { PicsFile, PicsUnavailableError } from "../pics/file.js";
import type { CertDevice, CertDeviceFactory, DeviceExitInfo, DeviceFlavor } from "./cert-context.js";
import { LogFollower } from "./log-follower.js";

// ChipDockerDevice requires the harness dbus sidecar rather than starting its own dbus/mdns pair:
// two system dbus daemons and mdns responders bound to the same `matter.js-mdns` volume would
// fight over the same `/run/dbus` socket once the app container becomes reachable.
export { HARNESS_DBUS_CONTAINER };

const DEFAULT_DISCRIMINATOR = 3840;
const DEFAULT_PASSCODE = 20202021;
const STOP_TIMEOUT_MS = 5_000;
const DRAIN_TIMEOUT_MS = 5_000;

// A chip app creates its command pipe as it starts, so a pipe still absent by now belongs to an app
// that is not running or was started without one.
const PIPE_TIMEOUT_MS = 5_000;
const PIPE_POLL_MS = 50;

// Killing a container and seeing it gone goes through the Docker daemon, so it is nothing like as
// prompt as a SIGTERM to a local child.
const CONTAINER_STOP_TIMEOUT_MS = 30_000;

// Without these, a chip binary logs only its terse progress categories (EM/IN/SC) — the structured
// `CHIP:DMG: ReadRequestMessage = { AttributePathIB = ... }` decode dumps cert-test log checks match
// against (see TC-IDM-2.1's AGENTS.md section) never appear at all, on any platform build.
const TRACE_ARGS = ["--trace_log", "1", "--trace_decode", "1"];

/**
 * The simulation commands a chip app takes on the named pipe it opens for `--app-pipe`, by the app
 * that answers them. A pipe accepts a write whatever the app makes of it, so a command an app does
 * not implement would become a silent no-op; only what the named app's own command delegate handles
 * is forwarded, and everything else stays unsupported.
 */
const PIPE_COMMANDS: Record<string, ReadonlySet<BackchannelCommand["name"]>> = {
    "all-clusters": new Set(["simulateLatchPosition", "simulateLongPress", "simulateMultiPress", "simulateSwitchIdle"]),
};

/** Where a chip app is told to open its command pipe inside a container. */
const CONTAINER_APP_PIPE = "/tmp/app-pipe";

/** Whether `app` reads simulation commands from a pipe at all, which is what naming one is for. */
function hasCommandPipe(app: string) {
    return PIPE_COMMANDS[app] !== undefined;
}

/**
 * The simulation commands a chip app takes on its standard input, by the app that answers them.
 *
 * chip's `bridge-app` polls stdin one character at a time (`bridge_polling_thread` in
 * `examples/bridge-app/linux/main.cpp`), and its named pipe answers only one unrelated command —
 * writing any other name there aborts the app through `VerifyOrDie`. The characters are therefore
 * the only way to operate it, and, exactly as for the pipe, they are gated per app: a character an
 * app does not read looks no different from one it does.
 */
const STDIN_COMMANDS: Record<string, ReadonlyMap<BackchannelCommand["name"], string>> = {
    bridge: new Map<BackchannelCommand["name"], string>([
        ["toggleBridgedLights", "c"],
        ["warmBridgedTemperatureSensors", "t"],
        ["renameBridgedLights", "b"],
        ["addBridgedLight", "2"],
        ["removeBridgedLight", "4"],
    ]),
};

/**
 * How long a command character waits before the next one is written.
 *
 * chip's bridge app polls standard input with `kbhit`, which asks the kernel how many bytes are
 * pending (`ioctl(FIONREAD)`), and then reads one with `getchar`, which fills stdio's own buffer from
 * the descriptor. Characters written together therefore leave the kernel on the first `getchar` and
 * sit in a buffer the poll cannot see, so the app acts on one and only reaches the rest when later
 * input makes the poll true again — by then it is running behind by whatever it buffered.
 *
 * Delivering one character per poll interval is what the loop consumes, and this is comfortably
 * longer than the 100ms it sleeps for between polls.
 */
const STDIN_COMMAND_GAP_MS = 250;

/** Whether `app` reads simulation commands from its standard input, which is what attaching one is for. */
function hasStdinCommands(app: string) {
    return STDIN_COMMANDS[app] !== undefined;
}

/** The character `app` reads for `command`, or `undefined` for a command it does not take that way. */
function stdinCommandFor(app: string, command: BackchannelCommand): string | undefined {
    return STDIN_COMMANDS[app]?.get(command.name);
}

/** How a chip app takes a simulation command, for the app that answers it. */
type CommandDelivery = { via: "stdin"; char: string } | { via: "pipe"; json: string };

/**
 * The channel `app` takes `command` on, or `undefined` for a command it does not take at all.
 *
 * An app reads its commands one way or the other, never both, so the first channel that answers is
 * the only one offered anything.
 */
function deliveryFor(app: string, command: BackchannelCommand): CommandDelivery | undefined {
    const char = stdinCommandFor(app, command);
    if (char !== undefined) {
        return { via: "stdin", char };
    }

    const json = namedPipeCommandFor(app, command);
    if (json !== undefined) {
        return { via: "pipe", json };
    }

    return undefined;
}

/**
 * A backchannel command as the JSON a chip app's `NamedPipeCommandDelegate` parses, or `undefined` for
 * a command `app` does not take that way. The delegate keys off `Name` and reads each argument by its
 * capitalized name (`examples/all-clusters-app/linux/AllClustersCommandDelegate.cpp`).
 */
function namedPipeCommandFor(app: string, command: BackchannelCommand): string | undefined {
    if (!PIPE_COMMANDS[app]?.has(command.name)) {
        return undefined;
    }

    const fields: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(command)) {
        if (name !== "name") {
            fields[`${name[0].toUpperCase()}${name.slice(1)}`] = value;
        }
    }

    return JSON.stringify({ Name: `${command.name[0].toUpperCase()}${command.name.slice(1)}`, ...fields });
}

/**
 * Serializes standard-input writes and leaves {@link STDIN_COMMAND_GAP_MS} between them.
 *
 * @internal Test seam — not API. Exported so its spacing can be asserted where it is decided; the
 * arrival of a character says nothing about when it was written, because a reader that has not
 * reached its poll yet reads a whole batch at once.
 *
 * The gap belongs to the delivery, not to the caller: a step that operates a device twice in a row
 * must not have to know how the app reads its input.
 */
export class StdinPacer {
    #ready: Promise<void> = Promise.resolve();

    async send(write: () => Promise<void>): Promise<void> {
        const previous = this.#ready;
        let release!: () => void;
        this.#ready = new Promise<void>(resolve => (release = resolve));

        await previous;
        try {
            await write();
        } finally {
            // Left whether or not the write succeeded: a write that failed part-way still may have
            // put a character in front of the app
            await new Promise(resolve => setTimeout(resolve, STDIN_COMMAND_GAP_MS));
            release();
        }
    }
}

function commissioningFor(identity?: Subject.Identity): Subject.CommissioningParameters {
    return {
        kind: "on-network",
        passcode: identity?.passcode ?? DEFAULT_PASSCODE,
        discriminator: identity?.discriminator ?? DEFAULT_DISCRIMINATOR,

        // A real onboarding QR code needs the spec's base38 payload encoder, which lives in
        // matter.js and is out of reach here per the packages/testing dependency invariant.
        // ControllerAdapter.CommissioningTarget treats qrPairingCode as optional and commissions
        // via discriminator/passcode instead.
        qrPairingCode: "",
    };
}

/**
 * `--secured-device-port` for a subject that was given one. Without it every chip app binds 5540, so
 * a second one in the same run fails to start — the failure surfaces as the device exiting while a
 * step runs, which reads as a crash rather than as a port collision.
 */
function portArgs(identity?: Subject.Identity): string[] {
    return identity?.port === undefined ? [] : ["--secured-device-port", String(identity.port)];
}

/**
 * CHIP builds a variant of an app as its own binary beside the plain one — `nlfaultinject` adds the
 * fault-injection hooks TC-IDM-1.3 arms — so a variant selects a filename, not a different app.
 */
export function appBinaryName(app: string, appVariant?: string) {
    return `chip-${app}-app${appVariant === undefined ? "" : `-${appVariant}`}`;
}

function throwUnsupported(flavor: DeviceFlavor, capability: string): never {
    throw new Error(`${flavor} subjects do not support ${capability}; commission fresh per test instead`);
}

interface ExitDeferred {
    promise: Promise<DeviceExitInfo>;
    resolve: (info: DeviceExitInfo) => void;
}

/**
 * One run of a device's backing process or container. A cert step can restart a device, so every
 * latch and every output pump belongs to the generation that created it: a handler still attached to
 * a process that has gone must not be able to settle its successor's.
 */
interface Generation {
    /** Settles when this generation ends, however it ended; `stop()` awaits this. */
    terminated: ExitDeferred;
    pumps: Promise<void>[];
    /** Set once this generation has ended, so `start()` knows to replace it. */
    exited: boolean;
    /** Set while the harness is terminating this generation, which is not the crash `exit` reports. */
    stopping: boolean;
}

interface LocalGeneration extends Generation {
    child: ChildProcess;

    /**
     * What went wrong on this generation's standard input, kept so the next command reports it
     * rather than the process dying: an unhandled `error` on a stream terminates the test run, and a
     * write racing the app's exit produces one asynchronously, outside any write callback.
     */
    stdinError?: Error;
}

interface DockerGeneration extends Generation {
    composition: CompositionHandle;

    /**
     * The attached terminal for an app driven through its standard input, kept for this generation's
     * whole life: the container's input closes when the last client attached to it detaches.
     */
    stdin?: Terminal<string>;

    /** Absent until the app container has been added, which `start()` may fail before. */
    container?: Container;
    /** Set when this generation never came up, so a later `start()` replaces it rather than joining it. */
    startFailed?: boolean;
}

function newGeneration(pumps: Promise<void>[]): Generation {
    return { terminated: createExitDeferred(), pumps, exited: false, stopping: false };
}

function createExitDeferred(): ExitDeferred {
    let resolve!: (info: DeviceExitInfo) => void;
    const promise = new Promise<DeviceExitInfo>(r => {
        resolve = r;
    });
    return { promise, resolve };
}

/**
 * Resolve the directory `chip-local` subjects spawn `chip-<app>-app` binaries from. When
 * `MATTER_CHIP_BINS_SOURCE=cert-bins`, this extracts (if not already cached — see
 * {@link prepareChipBins}) the official `connectedhomeip/chip-cert-bins` image and returns its own
 * directory, ignoring `MATTER_CERT_APP_DIR` entirely; otherwise it requires `MATTER_CERT_APP_DIR` as
 * before (a directory the user built/populated themselves). `cert-dsl.ts`'s
 * `chipLocalMarkerRevision()` calls this too, so a cert-bins-sourced run's evidence `chipRef` comes
 * from the same directory without separate wiring.
 */
export async function resolveChipLocalAppDir(): Promise<string> {
    if (resolveChipBinsSource() === "cert-bins") {
        // chip-local spawns the binary directly on the host, with no container in between —
        // unlike the classic-test bind-mount (chip/state.ts), there's no container platform to
        // match, but the host OS itself must be able to run the extracted Linux ELF binaries, which
        // macOS cannot (exec format error), regardless of arch.
        if (hostPlatform !== "linux") {
            throw new Error(
                `MATTER_CHIP_BINS_SOURCE=cert-bins selects Linux/${CERT_BINS_PLATFORM} binaries that chip-local ` +
                    `spawns directly on the host; this host is "${hostPlatform}", which cannot run them. Use a ` +
                    "Linux host or CI runner for chip-local with cert-bins, or unset MATTER_CHIP_BINS_SOURCE and " +
                    "point MATTER_CERT_APP_DIR at binaries built for this platform.",
            );
        }
        return (await prepareChipBins()).dir;
    }

    const dir = env.MATTER_CERT_APP_DIR;
    if (!dir) {
        throw new Error("MATTER_CERT_APP_DIR is not set; ChipLocalSubject needs it to find chip-<app>-app binaries");
    }
    return dir;
}

/**
 * A chip-app device spawned as a local process.  Binary path, KVS storage, and process lifecycle
 * are entirely local to this instance; nothing here touches Docker.
 */
class ChipLocalDevice implements CertDevice {
    readonly flavor: DeviceFlavor = "chip-local";
    readonly id: string;
    readonly app: string;
    readonly appVariant?: string;
    readonly commissioning: Subject.CommissioningParameters;
    readonly log: LogFollower;

    #appArgs: string[];
    #hub = new LineQueue();
    #storageDir?: string;
    #stdin = new StdinPacer();
    #generation?: LocalGeneration;
    #starting?: Promise<void>;
    #exit: ExitDeferred = createExitDeferred();

    constructor(app: string, domain: string, options?: Subject.Options, appVariant?: string) {
        this.app = app;
        this.appVariant = appVariant;
        this.id = domain;
        this.commissioning = commissioningFor(options?.identity);
        this.log = new LogFollower(this.#hub.follow(), domain);
        this.#appArgs = [...portArgs(options?.identity), ...(options?.appArgs ?? [])];
    }

    /**
     * A chip app's PICS is the certification file the harness container carries, the same one the
     * run-level gate evaluates (`cert-dsl.ts`'s `certPicsFile`). Throws {@link PicsUnavailableError}
     * until the container is up, as `chip.defaultPics` does.
     */
    get pics(): PicsFile {
        return chip.defaultPics;
    }

    get exit(): Promise<DeviceExitInfo> {
        return this.#exit.promise;
    }

    async initialize(): Promise<void> {
        await resolveChipLocalAppDir();
        this.#storageDir ??= await mkdtemp(join(tmpdir(), "matter-cert-local-"));
    }

    async start(): Promise<void> {
        // One process per device, even when two callers start it at once
        this.#starting ??= this.#spawn().finally(() => (this.#starting = undefined));
        return this.#starting;
    }

    async #spawn(): Promise<void> {
        const previous = this.#generation;
        if (previous !== undefined) {
            if (!previous.exited) {
                return;
            }
            this.#generation = undefined;
            await this.#drain(previous);
        }

        const dir = await resolveChipLocalAppDir();
        this.#storageDir ??= await mkdtemp(join(tmpdir(), "matter-cert-local-"));

        const binPath = join(dir, appBinaryName(this.app, this.appVariant));
        const kvsPath = join(this.#storageDir, "chip_kvs");

        // A stop leaves the storage directory, and an app killed before it could unlink its own fifo
        // leaves that too. Chip treats a failing `mkfifo` as fatal, so a restart would report a device
        // that will not initialize rather than one whose previous generation ended abruptly.
        if (hasCommandPipe(this.app)) {
            await rm(this.#pipePath(), { force: true });
        }

        const args = [
            "--discriminator",
            String(this.commissioning.discriminator),
            "--passcode",
            String(this.commissioning.passcode),
            "--KVS",
            kvsPath,
            ...(hasCommandPipe(this.app) ? ["--app-pipe", this.#pipePath()] : []),
            ...TRACE_ARGS,
            ...this.#appArgs,
        ];

        const child = spawn(binPath, args, {
            stdio: [hasStdinCommands(this.app) ? "pipe" : "ignore", "pipe", "pipe"],
        });
        const { stdout, stderr } = child;
        if (!stdout || !stderr) {
            throw new Error("Spawned process has no stdout/stderr streams");
        }

        const generation: LocalGeneration = {
            child,
            ...newGeneration([this.#hub.pump(asyncLinesOf(stdout)), this.#hub.pump(asyncLinesOf(stderr))]),
        };
        child.stdin?.on("error", error => (generation.stdinError = error));
        this.#generation = generation;

        let failSpawn: ((error: Error) => void) | undefined;
        const spawned = new Promise<void>((resolve, reject) => {
            failSpawn = reject;
            child.once("spawn", () => {
                failSpawn = undefined;
                resolve();
            });
        });

        child.once("exit", (code, signal) => {
            // A process that never ran has already been reported through start()'s own rejection
            if (failSpawn === undefined) {
                this.#ended(generation, { code, signal });
            }
        });

        child.once("error", error => {
            // spawn() failures (e.g. ENOENT) surface via "error", not "exit". The process never ran,
            // so this is start()'s own failure rather than a device that died on its own.
            if (failSpawn !== undefined) {
                generation.exited = true;
                generation.terminated.resolve({ code: null, signal: null });
                if (this.#generation === generation) {
                    this.#generation = undefined;
                }
                failSpawn(error);
                return;
            }

            console.warn(`Error running ${binPath}:`, error);
            this.#ended(generation, { code: null, signal: null });
        });

        try {
            await spawned;
        } catch (e) {
            await this.#drain(generation);
            throw e;
        }
    }

    /**
     * Settles `generation`'s own latch, and the device's crash latch only for an end nobody asked
     * for. The crash latch spans the device's whole life, so a run that restarts a device keeps the
     * detection it armed before its first step.
     */
    #ended(generation: Generation, info: DeviceExitInfo): void {
        generation.exited = true;
        generation.terminated.resolve(info);

        if (!generation.stopping) {
            this.#exit.resolve(info);
        }
    }

    /**
     * Awaits `generation`'s output pumps, bounded: a stream something else still holds open would
     * otherwise stall a restart with nothing said about why.
     */
    async #drain(generation: Generation): Promise<void> {
        const pumps = generation.pumps;
        generation.pumps = [];
        if (pumps.length === 0) {
            return;
        }

        const timer = delay(DRAIN_TIMEOUT_MS);
        try {
            const outcome = await Promise.race([
                Promise.allSettled(pumps).then((results): "drained" => {
                    for (const result of results) {
                        if (result.status === "rejected") {
                            console.warn("Error reading device output:", result.reason);
                        }
                    }
                    return "drained";
                }),
                timer.promise,
            ]);

            if (outcome === "timeout") {
                console.warn(
                    `Cert device ${this.id}: output pumps did not finish within ${DRAIN_TIMEOUT_MS}ms; ` +
                        "continuing without them",
                );
                for (const pump of pumps) {
                    void pump.catch(e => console.warn("Error reading device output:", e));
                }
            }
        } finally {
            timer.cancel();
        }
    }

    async stop(): Promise<void> {
        const generation = this.#generation;
        if (generation === undefined) {
            return;
        }

        this.#generation = undefined;
        generation.stopping = true;

        try {
            if (generation.exited) {
                return;
            }

            const { child } = generation;
            child.kill("SIGTERM");

            const timer = delay(STOP_TIMEOUT_MS);
            try {
                const outcome = await Promise.race([
                    generation.terminated.promise.then((): "exited" => "exited"),
                    timer.promise,
                ]);
                if (outcome === "timeout") {
                    child.kill("SIGKILL");
                    await generation.terminated.promise;
                }
            } finally {
                timer.cancel();
            }
        } finally {
            await this.#drain(generation);
        }
    }

    async close(): Promise<void> {
        await this.stop();

        this.#hub.close();

        if (this.#storageDir) {
            await rm(this.#storageDir, { recursive: true, force: true });
            this.#storageDir = undefined;
        }
    }

    async snapshot(): Promise<{}> {
        throwUnsupported(this.flavor, "snapshot/restore");
    }

    async restore(): Promise<void> {
        throwUnsupported(this.flavor, "snapshot/restore");
    }

    /** The app's command pipe, which it creates itself once `--app-pipe` names it. */
    #pipePath(): string {
        if (this.#storageDir === undefined) {
            throw new Error(`Cert device ${this.id} has no storage directory, so it has no command pipe`);
        }
        return join(this.#storageDir, "app-pipe");
    }

    /**
     * Hands one command to the running app.
     *
     * Three properties this needs, none of which a plain write to the path has:
     *
     * The open is non-blocking, so a pipe with no reader fails with `ENXIO` here rather than waiting
     * for one. A blocking open of a fifo waits until a reader attaches, and nothing can cancel it —
     * an app that died holding its fifo would hang the step, and the run, with no diagnosis.
     *
     * It carries no `O_CREAT`, and the path is confirmed to be a fifo first: a write to a path the app
     * has not made a fifo would leave a regular file there, which the app's own `mkfifo` then accepts
     * as already existing, so its reader sees one stale command and ends — silently discarding every
     * command for the rest of that app's life.
     *
     * And it waits for the app to create the fifo, which it does as it starts: a command sent just
     * after `start()` would otherwise be refused for a pipe that is merely not there yet. Only a
     * running app is waited for; there is nothing to wait for otherwise.
     */
    async #sendToPipe(json: string): Promise<void> {
        const generation = this.#requireRunning();

        const path = this.#pipePath();
        await this.#awaitPipe(path);

        // The wait can span a restart, and the successor generation creates its fifo at the same path,
        // so a command that set out for one app must not be delivered to the next.
        if (this.#requireRunning() !== generation) {
            throw new Error(
                `Cert device ${this.id} restarted while its command was waiting for the app's pipe, so the ` +
                    "command was not sent",
            );
        }

        const pipe = await open(path, constants.O_WRONLY | constants.O_NONBLOCK).catch(cause => {
            throw new Error(
                `Cert device ${this.id} could not open its command pipe at ${path}, so the app cannot be ` +
                    `operated; it is running but has stopped reading the pipe (${cause})`,
            );
        });
        try {
            await pipe.write(`${json}\n`);
        } finally {
            await pipe.close();
        }
    }

    /**
     * Delivers one command character to the running app's standard input.
     *
     * The app the command is for is the one running when it was accepted, and it waits its turn behind
     * whatever the pacer holds, so the generation is taken before queueing and checked on both sides of
     * the write. A restart anywhere in between would otherwise credit the command to an app that never
     * saw it, or send it to a successor it was never meant for.
     */
    async #sendToStdin(char: string): Promise<void> {
        const generation = this.#requireRunning();
        return this.#stdin.send(() => this.#writeToStdin(char, generation));
    }

    async #writeToStdin(char: string, generation: LocalGeneration): Promise<void> {
        if (this.#generation !== generation || generation.exited) {
            throw new Error(
                `Cert device ${this.id} restarted while a command waited its turn, so the command was not sent ` +
                    "to the app it was meant for",
            );
        }

        const stdin = generation.child.stdin;
        if (stdin === null) {
            throw new Error(
                `Cert device ${this.id} was started without a writable standard input, so the app cannot be ` +
                    "operated that way",
            );
        }

        await new Promise<void>((resolve, reject) => stdin.write(char, error => (error ? reject(error) : resolve())));

        if (generation.stdinError !== undefined) {
            throw generation.stdinError;
        }
        if (this.#generation !== generation) {
            throw new Error(
                `Cert device ${this.id} restarted while a command was being delivered, so the command reached ` +
                    "an app that is no longer the one under test",
            );
        }
    }

    /** The generation currently running, or a failure naming that there is none. */
    #requireRunning(): LocalGeneration {
        const generation = this.#generation;
        if (generation === undefined || generation.exited) {
            throw new Error(
                `Cert device ${this.id} cannot be operated while it is not running, so there is no app to ` +
                    "send the command to",
            );
        }
        return generation;
    }

    /** Waits for the app to create its fifo, refusing a path that is there but is not one. */
    async #awaitPipe(path: string): Promise<void> {
        const deadline = performance.now() + PIPE_TIMEOUT_MS;
        for (;;) {
            const target = await lstat(path).catch(() => undefined);
            if (target?.isFIFO()) {
                return;
            }

            if (target !== undefined) {
                throw new Error(
                    `Cert device ${this.id} has a file at ${path} that the app did not create as its command ` +
                        "pipe, so the app cannot be operated",
                );
            }

            if (performance.now() >= deadline) {
                throw new Error(
                    `Cert device ${this.id} has no command pipe at ${path} after ` +
                        `${PIPE_TIMEOUT_MS}ms, so the app cannot be operated; it is not running, or was ` +
                        "started without one",
                );
            }

            await new Promise(resolve => setTimeout(resolve, PIPE_POLL_MS));
        }
    }

    async backchannel(command: BackchannelCommand): Promise<void> {
        switch (command.name) {
            case "factoryReset":
                await this.stop();

                // A chip app is factory-new only once its key-value store is gone. Dropping the
                // whole storage directory keeps this independent of the file layout the app's KVS
                // implementation chooses; start() creates a fresh one.
                if (this.#storageDir !== undefined) {
                    await rm(this.#storageDir, { recursive: true, force: true });
                    this.#storageDir = undefined;
                }
                await this.start();
                break;

            case "reboot":
                await this.stop();
                await this.start();
                break;

            case "stop":
                await this.stop();
                break;

            case "start":
                await this.start();
                break;

            default: {
                const delivery = deliveryFor(this.app, command);
                if (delivery === undefined) {
                    throwUnsupported(this.flavor, `the "${command.name}" backchannel command`);
                }

                if (delivery.via === "stdin") {
                    await this.#sendToStdin(delivery.char);
                } else {
                    await this.#sendToPipe(delivery.json);
                }
                break;
            }
        }
    }
}

export function chipImageBase(): string {
    return env.MATTER_CERT_CHIP_IMAGE_BASE || "ghcr.io/matter-js/chip";
}

function mdnsVolumeName(): string {
    return env.MATTER_MDNS_VOLUME || "matter.js-mdns";
}

/**
 * The subset of `Docker.compose()`'s return value that {@link ChipDockerDevice} needs, extracted so
 * tests can substitute a fake without a running Docker daemon.
 */
export interface CompositionHandle {
    add(
        config: Partial<Container.Configuration> & {
            name: string;
            recreate?: boolean;
        },
    ): Promise<Container>;
    close(): Promise<void>;
}

/**
 * The subset of {@link Docker} (plus volume setup) that {@link ChipDockerDevice} needs, extracted so
 * tests can substitute a fake without a running Docker daemon.
 */
export interface DockerHandle {
    ensureVolume(name: string): Promise<void>;
    compose(name: string, config?: Partial<Container.Configuration>): CompositionHandle;
    containerStatus(name: string): Promise<{ isRunning: boolean } | undefined>;
}

function realDockerHandle(): DockerHandle {
    const docker = new Docker();
    return {
        async ensureVolume(name) {
            await Volume(docker, name).open();
        },
        compose(name, config) {
            return docker.compose(name, config);
        },
        containerStatus(name) {
            return docker.containerStatus(name);
        },
    };
}

/**
 * A chip-app device run in Docker.  Runs the app-specific `ghcr.io/matter-js/chip-<app>` image (its
 * own `ENTRYPOINT` already runs the right binary) as a single container, reusing the CHIP harness's
 * dbus/mdns sidecars (`chip/state.ts`'s `configureContainer`) instead of starting a duplicate pair —
 * see {@link HARNESS_DBUS_CONTAINER}.
 */
export class ChipDockerDevice implements CertDevice {
    readonly flavor: DeviceFlavor = "chip-docker";
    readonly id: string;
    readonly app: string;
    readonly appVariant?: string;
    readonly commissioning: Subject.CommissioningParameters;
    readonly log: LogFollower;

    #appArgs: string[];
    #hub = new LineQueue();
    #docker: DockerHandle;
    #stdin = new StdinPacer();
    #generation?: DockerGeneration;
    #starting?: Promise<void>;
    #exit: ExitDeferred = createExitDeferred();

    constructor(
        app: string,
        domain: string,
        options?: Subject.Options,
        docker: DockerHandle = realDockerHandle(),
        appVariant?: string,
    ) {
        this.app = app;
        this.appVariant = appVariant;
        this.id = domain;
        this.commissioning = commissioningFor(options?.identity);
        this.log = new LogFollower(this.#hub.follow(), domain);
        this.#appArgs = [...portArgs(options?.identity), ...(options?.appArgs ?? [])];
        this.#docker = docker;
    }

    /**
     * A chip app's PICS is the certification file the harness container carries, the same one the
     * run-level gate evaluates (`cert-dsl.ts`'s `certPicsFile`). Throws {@link PicsUnavailableError}
     * until the container is up, as `chip.defaultPics` does.
     */
    get pics(): PicsFile {
        return chip.defaultPics;
    }

    get exit(): Promise<DeviceExitInfo> {
        return this.#exit.promise;
    }

    /**
     * A per-app image runs its own binary as `ENTRYPOINT`, so there is nothing to point at a variant
     * built beside it. A TC needing one restricts itself to `chip-local`.
     */
    #assertNoVariant() {
        if (this.appVariant !== undefined) {
            throw new Error(
                `chip-docker subjects cannot run the "${this.appVariant}" variant of app "${this.app}": the ` +
                    `${chipImageBase()}-${this.app} image runs its own binary as ENTRYPOINT. Restrict the test to ` +
                    "the chip-local flavor, which spawns the variant binary directly.",
            );
        }
    }

    async initialize(): Promise<void> {
        this.#assertNoVariant();
    }

    async start(): Promise<void> {
        // One container per device, even when two callers start it at once
        this.#starting ??= this.#launch().finally(() => (this.#starting = undefined));
        return this.#starting;
    }

    async #launch(): Promise<void> {
        const previous = this.#generation;
        if (previous !== undefined) {
            // A generation that is up is joined; one that ended, or never came up at all, is replaced —
            // reaping whatever it did manage to create, since a container it left behind is ours
            if (!previous.exited && previous.startFailed !== true) {
                return;
            }
            await this.stop();
        }

        this.#assertNoVariant();

        const dbusStatus = await this.#docker.containerStatus(HARNESS_DBUS_CONTAINER);
        if (!dbusStatus?.isRunning) {
            throw new Error(
                `Cannot start chip-docker cert subject "${this.id}": harness dbus container ` +
                    `"${HARNESS_DBUS_CONTAINER}" is not running. chip-docker subjects reuse the CHIP harness's ` +
                    "dbus/mdns sidecars (chip/state.ts's configureContainer) instead of starting their own; " +
                    "start the harness (e.g. via certTest(), which installs State.initialize() as a beforeRun " +
                    "hook) before starting this subject.",
            );
        }

        const platform = env.MATTER_CHIP_PLATFORM || "linux/amd64";
        const appImage = `${chipImageBase()}-${this.app}:latest`;
        const volumeName = mdnsVolumeName();

        await this.#docker.ensureVolume(volumeName);

        // Installed before the container is added: a failing add() otherwise leaves the composition
        // (and its network) behind with nothing holding a reference to close it.
        const composition = this.#docker.compose(`cert-${this.app}-${this.id}`, {
            platform,
            binds: { [volumeName]: "/run/dbus" },
            network: "host",
            autoRemove: true,
        });
        const generation: DockerGeneration = { composition, ...newGeneration([]) };
        this.#generation = generation;

        const args = [
            "--discriminator",
            String(this.commissioning.discriminator),
            "--passcode",
            String(this.commissioning.passcode),
            ...(hasCommandPipe(this.app) ? ["--app-pipe", CONTAINER_APP_PIPE] : []),
            ...TRACE_ARGS,
            ...this.#appArgs,
        ];

        try {
            const container = await composition.add({
                name: "app",
                image: appImage,
                recreate: true,
                binds: { [volumeName]: "/run/dbus" },
                command: args,

                stdinOnce: !hasStdinCommands(this.app),
            });

            generation.container = container;

            // Deliberately not awaited — it runs for the container's whole lifetime and only settles
            // this generation's latches, which stop() awaits separately. Its own try/catch means
            // nothing is swallowed. Must stay ahead of anything that can throw below, so a start()
            // that fails later still leaves stop() a latch that settles.
            void this.#trackExit(generation, container);

            // Attaching immediately after the container starts still risks losing whatever it printed
            // in that gap — Docker doesn't let us attach before start.
            const terminal = await container.attach(Terminal.Line, hasStdinCommands(this.app));
            generation.pumps.push(this.#hub.pump(terminal));
            if (hasStdinCommands(this.app)) {
                generation.stdin = terminal;
            }
        } catch (e) {
            // Marked rather than dropped: stop() still has to reap what this attempt created, and a
            // later start() must not take this generation for a device that came up.
            generation.startFailed = true;
            throw e;
        }
    }

    async #trackExit(generation: DockerGeneration, container: Container): Promise<void> {
        try {
            await container.wait();
            this.#ended(generation, { code: 0, signal: null });
        } catch (e) {
            if (e instanceof NonZeroExitError) {
                this.#ended(generation, { code: e.code, signal: null });
                return;
            }

            // The daemon did not tell us the container stopped, so we do not know that it did: the
            // run can no longer trust the device, but the container stays a candidate for stop()'s
            // kill, which composition.close() does not perform.
            console.warn(`Error waiting for cert device container ${this.id}:`, e);
            this.#report(generation, { code: null, signal: null });
        }
    }

    /** {@link #report}s an end the daemon confirmed, which stop() then has nothing left to kill for. */
    #ended(generation: DockerGeneration, info: DeviceExitInfo): void {
        generation.exited = true;
        this.#report(generation, info);
    }

    /**
     * Settles `generation`'s own latch, and the device's crash latch only for an end nobody asked
     * for. The crash latch spans the device's whole life, so a run that restarts a device keeps the
     * detection it armed before its first step.
     */
    #report(generation: DockerGeneration, info: DeviceExitInfo): void {
        generation.terminated.resolve(info);

        if (!generation.stopping) {
            this.#exit.resolve(info);
        }
    }

    /**
     * Awaits `generation`'s output pump, bounded: a terminal something else still holds open would
     * otherwise stall a restart with nothing said about why.
     */
    async #drain(generation: DockerGeneration): Promise<void> {
        const pumps = generation.pumps;
        generation.pumps = [];
        if (pumps.length === 0) {
            return;
        }

        const timer = delay(DRAIN_TIMEOUT_MS);
        try {
            const outcome = await Promise.race([
                Promise.allSettled(pumps).then((results): "drained" => {
                    for (const result of results) {
                        if (result.status === "rejected") {
                            console.warn("Error reading device output:", result.reason);
                        }
                    }
                    return "drained";
                }),
                timer.promise,
            ]);

            if (outcome === "timeout") {
                console.warn(
                    `Cert device ${this.id}: output pump did not finish within ${DRAIN_TIMEOUT_MS}ms; ` +
                        "continuing without it",
                );
                for (const pump of pumps) {
                    void pump.catch(e => console.warn("Error reading device output:", e));
                }
            }
        } finally {
            timer.cancel();
        }
    }

    async stop(): Promise<void> {
        const generation = this.#generation;
        if (generation === undefined) {
            return;
        }

        this.#generation = undefined;
        generation.stopping = true;

        try {
            const { container } = generation;
            if (container !== undefined && !generation.exited) {
                try {
                    await container.kill();
                } catch (e) {
                    // A container that has already gone has nothing left to kill; every other cause
                    // leaves it running, which the wait below then reports.
                    DockerError.accept(e, 404, 409);
                }

                const timer = delay(CONTAINER_STOP_TIMEOUT_MS);
                try {
                    const outcome = await Promise.race([
                        generation.terminated.promise.then((): "exited" => "exited"),
                        timer.promise,
                    ]);
                    if (outcome === "timeout") {
                        throw new Error(
                            `Cert device container ${this.id} did not exit within ${CONTAINER_STOP_TIMEOUT_MS}ms`,
                        );
                    }
                } finally {
                    timer.cancel();
                }
            }
        } finally {
            // A container that would not die must still release the composition and its network
            try {
                await generation.composition.close();
            } finally {
                await this.#drain(generation);
            }
        }
    }

    async close(): Promise<void> {
        await this.stop();

        this.#hub.close();
    }

    async snapshot(): Promise<{}> {
        throwUnsupported(this.flavor, "snapshot/restore");
    }

    async restore(): Promise<void> {
        throwUnsupported(this.flavor, "snapshot/restore");
    }

    async backchannel(command: BackchannelCommand): Promise<void> {
        switch (command.name) {
            case "factoryReset":
                // The app's key-value store lives in the container's own filesystem, which the
                // composition discards when it stops, so a fresh container is a factory-new device.
                await this.stop();
                await this.start();
                break;

            case "reboot":
                throwUnsupported(
                    this.flavor,
                    "rebooting with its key-value store intact: the store lives in the container's " +
                        "filesystem, which is discarded when the container stops, so a restart here is a " +
                        "factory reset. Restrict the test to the chip-local flavor",
                );

            case "stop":
                await this.stop();
                break;

            case "start":
                await this.start();
                break;

            default: {
                const delivery = deliveryFor(this.app, command);
                if (delivery === undefined) {
                    throwUnsupported(this.flavor, `the "${command.name}" backchannel command`);
                }

                const generation = this.#generation;
                if (generation === undefined || generation.exited || generation.container === undefined) {
                    throw new Error(
                        `Cert device ${this.id} received the "${command.name}" backchannel command while it was ` +
                            "not running, so there is no app to send it to",
                    );
                }

                if (delivery.via === "stdin") {
                    const stdin = generation.stdin;
                    if (stdin === undefined) {
                        throw new Error(
                            `Cert device ${this.id} has no attached standard input, so the app cannot be operated ` +
                                "that way",
                        );
                    }

                    await this.#stdin.send(async () => {
                        // The command waited its turn behind the pacer, and the stream it holds is the
                        // one this generation was started with
                        if (this.#generation !== generation || generation.exited) {
                            throw new Error(
                                `Cert device ${this.id} restarted while a command waited its turn, so the ` +
                                    "command was not sent to the app it was meant for",
                            );
                        }

                        await stdin.write(delivery.char);

                        // A restart between the write and here would credit the command to an app
                        // that never saw it
                        if (this.#generation !== generation) {
                            throw new Error(
                                `Cert device ${this.id} restarted while a command was being delivered, so the ` +
                                    "command reached an app that is no longer the one under test",
                            );
                        }
                    });
                    break;
                }

                // The command travels as an argument rather than as part of the script, so nothing in
                // it can be read as shell syntax. `test -p` refuses a path the app has not made a fifo,
                // for the reason ChipLocalDevice's own send documents; a shell that exits non-zero
                // fails the step rather than reporting a command nothing received.
                //
                // The app creates its fifo as it starts, so a command sent just after start() waits
                // for it rather than being refused for a pipe that is merely not there yet; a path
                // that is there but is not a fifo is still refused at once.
                //
                // Opening a fifo for writing waits for a reader, so the write is bounded from outside:
                // an app that has stopped reading ends this as a non-zero exit rather than holding the
                // exec for as long as the container lives.
                await generation.container.exec([
                    "timeout",
                    String(PIPE_TIMEOUT_MS / 1000),
                    "sh",
                    "-c",
                    `while [ ! -e ${CONTAINER_APP_PIPE} ]; do sleep 0.1; done; test -p ${CONTAINER_APP_PIPE} && printf '%s\\n' "$0" > ${CONTAINER_APP_PIPE}`,
                    delivery.json,
                ]);
                break;
            }
        }
    }
}

/**
 * Spawns `${MATTER_CERT_APP_DIR}/chip-<app>-app` as a local child process for cert tests.
 */
export function ChipLocalSubject(app: string, appVariant?: string): CertDeviceFactory {
    return (domain: string, options?: Subject.Options) => new ChipLocalDevice(app, domain, options, appVariant);
}

/**
 * Runs a chip-<app> device in a Docker container. Requires the CHIP harness's dbus/mdns sidecars
 * (started by `certTest()` via `State.initialize()`) to already be running — see
 * {@link HARNESS_DBUS_CONTAINER}.
 */
export function ChipDockerSubject(app: string, appVariant?: string): CertDeviceFactory {
    return (domain: string, options?: Subject.Options) =>
        new ChipDockerDevice(app, domain, options, undefined, appVariant);
}
