/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, platform as hostPlatform } from "node:process";
import type { Subject } from "../../device/subject.js";
import type { Container } from "../../docker/container.js";
import { Docker } from "../../docker/docker.js";
import { NonZeroExitError } from "../../docker/errors.js";
import { Terminal } from "../../docker/terminal.js";
import { Volume } from "../../docker/volume.js";
import { delay, LineQueue } from "../../util/async.js";
import { asyncLinesOf } from "../../util/text.js";
import { CERT_BINS_PLATFORM, prepareChipBins, resolveChipBinsSource } from "../chip-bins.js";
import { HARNESS_DBUS_CONTAINER } from "../config.js";
import { PicsUnavailableError, type PicsFile } from "../pics/file.js";
import type { CertDevice, CertDeviceFactory, DeviceExitInfo, DeviceFlavor } from "./cert-context.js";
import { LogFollower } from "./log-follower.js";

// ChipDockerDevice requires the harness dbus sidecar rather than starting its own dbus/mdns pair:
// two system dbus daemons and mdns responders bound to the same `matter.js-mdns` volume would
// fight over the same `/run/dbus` socket once the app container becomes reachable.
export { HARNESS_DBUS_CONTAINER };

const DEFAULT_DISCRIMINATOR = 3840;
const DEFAULT_PASSCODE = 20202021;
const STOP_TIMEOUT_MS = 5_000;

// Without these, a chip binary logs only its terse progress categories (EM/IN/SC) — the structured
// `CHIP:DMG: ReadRequestMessage = { AttributePathIB = ... }` decode dumps cert-test log checks match
// against (see TC-IDM-2.1's AGENTS.md section) never appear at all, on any platform build.
const TRACE_ARGS = ["--trace_log", "1", "--trace_decode", "1"];

function defaultCommissioning(): Subject.CommissioningParameters {
    return {
        kind: "on-network",
        passcode: DEFAULT_PASSCODE,
        discriminator: DEFAULT_DISCRIMINATOR,

        // A real onboarding QR code needs the spec's base38 payload encoder, which lives in
        // matter.js and is out of reach here per the packages/testing dependency invariant.
        // ControllerAdapter.CommissioningTarget treats qrPairingCode as optional and commissions
        // via discriminator/passcode instead.
        qrPairingCode: "",
    };
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
    #child?: ChildProcess;
    #exit: ExitDeferred = createExitDeferred();
    #pumps = new Array<Promise<void>>();

    constructor(app: string, domain: string, options?: Subject.Options, appVariant?: string) {
        this.app = app;
        this.appVariant = appVariant;
        this.id = domain;
        this.commissioning = defaultCommissioning();
        this.log = new LogFollower(this.#hub.follow(), domain);
        this.#appArgs = options?.appArgs ?? [];
    }

    get pics(): PicsFile {
        throw new PicsUnavailableError("No active PICS file for this device");
    }

    get exit(): Promise<DeviceExitInfo> {
        return this.#exit.promise;
    }

    async initialize(): Promise<void> {
        await resolveChipLocalAppDir();
        this.#storageDir ??= await mkdtemp(join(tmpdir(), "matter-cert-local-"));
    }

    async start(): Promise<void> {
        if (this.#child) {
            return;
        }

        const dir = await resolveChipLocalAppDir();
        this.#storageDir ??= await mkdtemp(join(tmpdir(), "matter-cert-local-"));

        const binPath = join(dir, appBinaryName(this.app, this.appVariant));
        const kvsPath = join(this.#storageDir, "chip_kvs");

        const args = [
            "--discriminator",
            String(this.commissioning.discriminator),
            "--passcode",
            String(this.commissioning.passcode),
            "--KVS",
            kvsPath,
            ...TRACE_ARGS,
            ...this.#appArgs,
        ];

        const child = spawn(binPath, args, { stdio: ["ignore", "pipe", "pipe"] });
        const { stdout, stderr } = child;
        if (!stdout || !stderr) {
            throw new Error("Spawned process has no stdout/stderr streams");
        }

        this.#child = child;
        this.#exit = createExitDeferred();
        this.#pumps = [this.#hub.pump(asyncLinesOf(stdout)), this.#hub.pump(asyncLinesOf(stderr))];

        child.once("exit", (code, signal) => {
            this.#exit.resolve({ code, signal });
        });

        child.once("error", error => {
            // spawn() failures (e.g. ENOENT) surface via "error", not "exit" — the exit promise
            // still needs to settle so a caller awaiting it doesn't hang.
            this.#exit.resolve({ code: null, signal: null });
            console.warn(`Error running ${binPath}:`, error);
        });
    }

    async stop(): Promise<void> {
        const child = this.#child;
        if (!child) {
            return;
        }

        child.kill("SIGTERM");

        const timer = delay(STOP_TIMEOUT_MS);
        try {
            const outcome = await Promise.race([this.#exit.promise.then((): "exited" => "exited"), timer.promise]);
            if (outcome === "timeout") {
                child.kill("SIGKILL");
                await this.#exit.promise;
            }
        } finally {
            timer.cancel();
            this.#child = undefined;
        }
    }

    async close(): Promise<void> {
        await this.stop();

        const results = await Promise.allSettled(this.#pumps);
        for (const result of results) {
            if (result.status === "rejected") {
                console.warn("Error reading device output:", result.reason);
            }
        }
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

    async backchannel(): Promise<void> {
        throwUnsupported(this.flavor, "backchannel simulation");
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
    #composition?: CompositionHandle;
    #container?: Container;
    #exit: ExitDeferred = createExitDeferred();
    #pump?: Promise<void>;

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
        this.commissioning = defaultCommissioning();
        this.log = new LogFollower(this.#hub.follow(), domain);
        this.#appArgs = options?.appArgs ?? [];
        this.#docker = docker;
    }

    get pics(): PicsFile {
        throw new PicsUnavailableError("No active PICS file for this device");
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
        if (this.#container) {
            return;
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

        const composition = this.#docker.compose(`cert-${this.app}-${this.id}`, {
            platform,
            binds: { [volumeName]: "/run/dbus" },
            network: "host",
            autoRemove: true,
        });

        const args = [
            "--discriminator",
            String(this.commissioning.discriminator),
            "--passcode",
            String(this.commissioning.passcode),
            ...TRACE_ARGS,
            ...this.#appArgs,
        ];

        const container = await composition.add({
            name: "app",
            image: appImage,
            recreate: true,
            binds: { [volumeName]: "/run/dbus" },
            command: args,
        });

        this.#composition = composition;
        this.#container = container;
        this.#exit = createExitDeferred();

        // Deliberately not awaited — it runs for the container's whole lifetime and only settles
        // #exit, which stop()/close() await separately. Its own try/catch means nothing is swallowed.
        // Must stay ahead of anything that can throw below: #container/#exit are already installed,
        // so a start() that fails later still leaves stop() an #exit that settles.
        void this.#trackExit(container);

        // Attaching immediately after the container starts still risks losing whatever it printed
        // in that gap — Docker doesn't let us attach before start. Acceptable for now; Task 6 smoke-
        // tests this flavor end to end.
        const terminal = await container.attach(Terminal.Line);
        this.#pump = this.#hub.pump(terminal);
    }

    async #trackExit(container: Container): Promise<void> {
        try {
            await container.wait();
            this.#exit.resolve({ code: 0, signal: null });
        } catch (e) {
            if (e instanceof NonZeroExitError) {
                this.#exit.resolve({ code: e.code, signal: null });
            } else {
                console.warn(`Error waiting for cert device container ${this.id}:`, e);
                this.#exit.resolve({ code: null, signal: null });
            }
        }
    }

    async stop(): Promise<void> {
        const container = this.#container;
        if (!container) {
            return;
        }

        try {
            await container.kill();
        } catch {
            // Already stopped/removed (e.g. crashed) — nothing left to stop.
        }
        await this.#exit.promise;

        await this.#composition?.close();
        this.#composition = undefined;
        this.#container = undefined;
    }

    async close(): Promise<void> {
        await this.stop();

        if (this.#pump) {
            await this.#pump.catch(e => console.warn("Error reading device output:", e));
            this.#pump = undefined;
        }
        this.#hub.close();
    }

    async snapshot(): Promise<{}> {
        throwUnsupported(this.flavor, "snapshot/restore");
    }

    async restore(): Promise<void> {
        throwUnsupported(this.flavor, "snapshot/restore");
    }

    async backchannel(): Promise<void> {
        throwUnsupported(this.flavor, "backchannel simulation");
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
