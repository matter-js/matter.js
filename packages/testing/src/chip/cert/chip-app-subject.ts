/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import type { Subject } from "../../device/subject.js";
import type { Composition } from "../../docker/composition.js";
import type { Container } from "../../docker/container.js";
import { Docker } from "../../docker/docker.js";
import { NonZeroExitError } from "../../docker/errors.js";
import { Terminal } from "../../docker/terminal.js";
import { Volume } from "../../docker/volume.js";
import { asyncLinesOf } from "../../util/text.js";
import type { PicsFile } from "../pics/file.js";
import type { CertDevice, CertDeviceFactory, DeviceExitInfo, DeviceFlavor, LogSource } from "./cert-context.js";
import { LogFollower } from "./log-follower.js";

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

function delay(ms: number): { promise: Promise<"timeout">; cancel: () => void } {
    let timer: NodeJS.Timeout;
    const promise = new Promise<"timeout">(resolve => {
        timer = setTimeout(() => resolve("timeout"), ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
}

/**
 * Multicasts process/container output lines to any number of independent {@link LogSource.follow}
 * consumers, replaying everything seen so far before tailing live.
 */
class LineHub implements LogSource {
    #lines = new Array<string>();
    #closed = false;
    #waiters = new Array<() => void>();

    push(line: string): void {
        this.#lines.push(line);
        this.#wake();
    }

    close(): void {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#wake();
    }

    follow(): AsyncIterable<string> {
        return this.#iterate();
    }

    async pump(source: AsyncIterable<string>): Promise<void> {
        for await (const line of source) {
            this.push(line);
        }
    }

    #wake(): void {
        const waiters = this.#waiters;
        this.#waiters = new Array();
        for (const waiter of waiters) {
            waiter();
        }
    }

    async *#iterate(): AsyncGenerator<string> {
        let index = 0;
        for (;;) {
            while (index < this.#lines.length) {
                yield this.#lines[index++];
            }
            if (this.#closed) {
                return;
            }
            await new Promise<void>(resolve => this.#waiters.push(resolve));
        }
    }
}

function appDir(): string {
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
    readonly commissioning: Subject.CommissioningParameters;
    readonly log: LogFollower;

    #appArgs: string[];
    #hub = new LineHub();
    #storageDir?: string;
    #child?: ChildProcess;
    #exit: ExitDeferred = createExitDeferred();
    #pumps = new Array<Promise<void>>();

    constructor(app: string, domain: string, options?: Subject.Options) {
        this.app = app;
        this.id = domain;
        this.commissioning = defaultCommissioning();
        this.log = new LogFollower(this.#hub.follow(), domain);
        this.#appArgs = options?.appArgs ?? [];
    }

    get pics(): PicsFile {
        throw new Error("No active PICS file for this device");
    }

    get exit(): Promise<DeviceExitInfo> {
        return this.#exit.promise;
    }

    async initialize(): Promise<void> {
        appDir();
        this.#storageDir ??= await mkdtemp(join(tmpdir(), "matter-cert-local-"));
    }

    async start(): Promise<void> {
        if (this.#child) {
            return;
        }

        const dir = appDir();
        this.#storageDir ??= await mkdtemp(join(tmpdir(), "matter-cert-local-"));

        const binPath = join(dir, `chip-${this.app}-app`);
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
 * A chip-app device run in Docker.  Mirrors the dbus/mdns/app container trio from
 * `chip/state.ts`'s harness composition, but the third part runs the app-specific
 * `ghcr.io/matter-js/chip-<app>` image (its own `ENTRYPOINT` already runs the right binary) instead
 * of the shared `chip` image used for python/yaml tests.
 */
class ChipDockerDevice implements CertDevice {
    readonly flavor: DeviceFlavor = "chip-docker";
    readonly id: string;
    readonly app: string;
    readonly commissioning: Subject.CommissioningParameters;
    readonly log: LogFollower;

    #appArgs: string[];
    #hub = new LineHub();
    #docker = new Docker();
    #composition?: Composition;
    #container?: Container;
    #sidecars = new Array<Container>();
    #exit: ExitDeferred = createExitDeferred();
    #pump?: Promise<void>;

    constructor(app: string, domain: string, options?: Subject.Options) {
        this.app = app;
        this.id = domain;
        this.commissioning = defaultCommissioning();
        this.log = new LogFollower(this.#hub.follow(), domain);
        this.#appArgs = options?.appArgs ?? [];
    }

    get pics(): PicsFile {
        throw new Error("No active PICS file for this device");
    }

    get exit(): Promise<DeviceExitInfo> {
        return this.#exit.promise;
    }

    async initialize(): Promise<void> {}

    async start(): Promise<void> {
        if (this.#container) {
            return;
        }

        const platform = env.MATTER_CHIP_PLATFORM || "linux/amd64";
        const baseImage = `${chipImageBase()}:latest`;
        const appImage = `${chipImageBase()}-${this.app}:latest`;

        const volume = Volume(this.#docker, mdnsVolumeName());
        await volume.open();

        const composition = this.#docker.compose(`cert-${this.app}-${this.id}`, {
            platform,
            binds: { [volume.name]: "/run/dbus" },
            network: "host",
            autoRemove: true,
        });

        const dbus = await composition.add({
            name: "dbus",
            image: baseImage,
            command: ["/usr/bin/dbus-daemon", "--nopidfile", "--system", "--nofork"],
        });
        const mdns = await composition.add({ name: "mdns", image: baseImage, command: ["/bin/mdns-run"] });

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
            binds: { [volume.name]: "/run/dbus" },
            command: args,
        });

        this.#composition = composition;
        this.#container = container;
        this.#sidecars = [dbus, mdns];
        this.#exit = createExitDeferred();

        // Attaching immediately after the container starts still risks losing whatever it printed
        // in that gap — Docker doesn't let us attach before start. Acceptable for now; Task 6 smoke-
        // tests this flavor end to end.
        const terminal = await container.attach(Terminal.Line);
        this.#pump = this.#hub.pump(terminal);

        // Deliberately not awaited — it runs for the container's whole lifetime and only settles
        // #exit, which stop()/close() await separately. Its own try/catch means nothing is swallowed.
        void this.#trackExit(container);
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

        for (const ct of [container, ...this.#sidecars]) {
            try {
                await ct.kill();
            } catch {
                // Already stopped/removed (e.g. crashed) — nothing left to stop.
            }
        }
        await this.#exit.promise;

        await this.#composition?.close();
        this.#composition = undefined;
        this.#container = undefined;
        this.#sidecars = [];
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
export function ChipLocalSubject(app: string): CertDeviceFactory {
    return (domain: string, options?: Subject.Options) => new ChipLocalDevice(app, domain, options);
}

/**
 * Runs a chip-<app> device in a Docker container, mirroring the CHIP harness's dbus/mdns
 * preconditions.
 */
export function ChipDockerSubject(app: string): CertDeviceFactory {
    return (domain: string, options?: Subject.Options) => new ChipDockerDevice(app, domain, options);
}
