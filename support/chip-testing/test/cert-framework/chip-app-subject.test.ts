/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertDevice, CompositionHandle, Container, DockerHandle, Subject } from "@matter/testing";
import {
    ChipDockerDevice,
    ChipDockerSubject,
    ChipLocalSubject,
    HARNESS_DBUS_CONTAINER,
    requiredAppArgs,
    StdinPacer,
} from "@matter/testing";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

/**
 * Minimal {@link Container} double satisfying only what `ChipDockerDevice`'s start()/stop() call
 * (attach, wait, kill); any other member throws if invoked, since these tests never reach it. A
 * single cast is unavoidable here: `attach`/`exec` are generic over an unconstrained
 * `Terminal.Factory`, and this double only ever needs to support the one factory (`Terminal.Line`)
 * `ChipDockerDevice` passes.
 */
function fakeContainer(overrides: Partial<Container> = {}): Container {
    const notImplemented = (member: string) => () => {
        throw new Error(`fakeContainer.${member}() is not implemented in this test`);
    };

    const emptyTerminal = {
        async write() {},
        async close() {},
        async consume() {
            return "";
        },
        [Symbol.asyncIterator]() {
            return {
                async next() {
                    return { done: true as const, value: undefined };
                },
            };
        },
    };

    return {
        docker: undefined,
        get image() {
            return Promise.reject(new Error("fakeContainer.image is not implemented in this test"));
        },
        start: notImplemented("start"),
        kill: async () => {},
        remove: notImplemented("remove"),
        attach: async () => emptyTerminal,
        wait: async () => {},
        exec: notImplemented("exec"),
        read: notImplemented("read"),
        follow: notImplemented("follow"),
        execAndRead: notImplemented("execAndRead"),
        write: notImplemented("write"),
        delete: notImplemented("delete"),
        edit: notImplemented("edit"),
        resolveGlob: notImplemented("resolveGlob"),
        createPipe: notImplemented("createPipe"),
        ...overrides,
    } as unknown as Container;
}

/** Resolves to `true` if `promise` is still pending after `ms`, which is what a non-exit looks like. */
async function stillPending(promise: Promise<unknown>, ms: number): Promise<boolean> {
    let timer!: NodeJS.Timeout;
    try {
        return await Promise.race([
            promise.then(() => false),
            new Promise<true>(resolve => {
                timer = setTimeout(() => resolve(true), ms);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function isCertDevice(subject: Subject): subject is CertDevice {
    return "flavor" in subject && "log" in subject && "exit" in subject;
}

async function collectLines(source: AsyncIterable<string>, count: number, timeoutMs: number): Promise<string[]> {
    const lines = new Array<string>();
    const iterator = source[Symbol.asyncIterator]();
    const deadline = Date.now() + timeoutMs;

    while (lines.length < count) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error(`Timed out waiting for ${count} lines; got ${JSON.stringify(lines)}`);
        }

        let timer!: NodeJS.Timeout;
        try {
            const result = await Promise.race([
                iterator.next(),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error("line timeout")), remaining);
                }),
            ]);

            if (result.done) {
                break;
            }
            lines.push(result.value);
        } finally {
            clearTimeout(timer);
        }
    }

    return lines;
}

/** Reads the next `kvs <path> <generations>` line the test app prints for the store it was started with. */
async function nextStore(
    source: AsyncIterable<string>,
    timeoutMs: number,
): Promise<{ path: string; generations: number }> {
    const seen = new Array<string>();
    const iterator = source[Symbol.asyncIterator]();
    const deadline = Date.now() + timeoutMs;

    for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error(`No store line in ${JSON.stringify(seen)}`);
        }

        let timer!: NodeJS.Timeout;
        let result;
        try {
            result = await Promise.race([
                iterator.next(),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`No store line in ${JSON.stringify(seen)}`)), remaining);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }

        if (result.done) {
            throw new Error(`Log ended before a store line; saw ${JSON.stringify(seen)}`);
        }

        seen.push(result.value);
        if (result.value.startsWith("kvs ")) {
            const [, path, generations] = result.value.split(" ");
            return { path, generations: Number(generations) };
        }
    }
}

/** The pids in `pids` that still name a running process. */
function livingOf(pids: number[]) {
    return pids.filter(pid => {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    });
}

/**
 * A lower bound on the pause between two command characters, well under the pause the subject
 * actually leaves: the claim is that the two do not travel together, not what the exact gap is.
 */
const MIN_STDIN_GAP_MS = 150;

describe("StdinPacer", () => {
    it("leaves a pause between two commands and applies them in order", async function () {
        this.timeout(5_000);

        const pacer = new StdinPacer();
        const writes = new Array<{ char: string; at: number }>();
        const record = (char: string) => async () => {
            writes.push({ char, at: performance.now() });
        };

        // Together rather than one after the other: awaiting the first hides its own trailing pause,
        // and two callers at once is also what the queue has to serialize
        await Promise.all([pacer.send(record("a")), pacer.send(record("b"))]);

        expect(writes.map(write => write.char)).deep.equal(["a", "b"]);
        expect(writes[1].at - writes[0].at).greaterThan(MIN_STDIN_GAP_MS);
    });

    it("keeps taking commands after one fails", async function () {
        this.timeout(5_000);

        const pacer = new StdinPacer();
        const written = new Array<string>();

        await expect(
            pacer.send(async () => {
                throw new Error("the app went away");
            }),
        ).rejectedWith("the app went away");

        await pacer.send(async () => {
            written.push("after");
        });

        expect(written).deep.equal(["after"]);
    });
});

describe("ChipLocalSubject", () => {
    const app = "test";

    let appDir: string;
    const originalAppDir = env.MATTER_CERT_APP_DIR;

    beforeEach(async () => {
        appDir = await mkdtemp(join(tmpdir(), "matter-cert-local-test-"));
        const scriptPath = join(appDir, `chip-${app}-app`);

        // `exec` replaces the shell with `sleep` so SIGTERM lands on the actual sleeping process,
        // not a shell that could leave it orphaned. The store line stands in for the app's own
        // key-value store: its path and its accumulated generations are what a factory reset and a
        // reboot have to differ on.
        await writeFile(
            scriptPath,
            [
                "#!/bin/sh",
                "echo known-line-one",
                "echo known-line-two",
                'kvs=""',
                "while [ $# -gt 0 ]; do",
                '    if [ "$1" = "--KVS" ]; then kvs="$2"; fi',
                "    shift",
                "done",
                'echo generation >> "$kvs"',
                'echo "kvs $kvs $(wc -l < "$kvs" | tr -d " ")"',
                "exec sleep 300",
                "",
            ].join("\n"),
            { mode: 0o755 },
        );

        env.MATTER_CERT_APP_DIR = appDir;
    });

    afterEach(async () => {
        if (originalAppDir === undefined) {
            delete env.MATTER_CERT_APP_DIR;
        } else {
            env.MATTER_CERT_APP_DIR = originalAppDir;
        }
        await rm(appDir, { recursive: true, force: true });
    });

    it("streams stdout lines to the log follower and terminates the process on stop()", async function () {
        this.timeout(15_000);

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            const lines = await collectLines(device.log.follow(), 2, 5_000);
            expect(lines).deep.equal(["known-line-one", "known-line-two"]);

            // stop() only returns once the process is gone, and a stop the harness asked for is not
            // the crash `exit` reports.
            await device.stop();
            expect(await stillPending(device.exit, 250)).equal(true);
        } finally {
            await device.close();
        }
    });

    it("reports a process that exits on its own as an exit", async function () {
        this.timeout(15_000);

        await writeFile(join(appDir, `chip-${app}-app`), "#!/bin/sh\necho known-line-one\nexit 3\n", {
            mode: 0o755,
        });

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            expect(await device.exit).deep.equal({ code: 3, signal: null });
        } finally {
            await device.close();
        }
    });

    it("reports an exit on its own as an exit although stop() follows before a process it started released the output", async function () {
        this.timeout(15_000);

        await writeFile(join(appDir, `chip-${app}-app`), '#!/bin/sh\nsleep 30 &\necho "holder $!"\nexit 3\n', {
            mode: 0o755,
        });

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        let holder: number | undefined;
        try {
            const [line] = await collectLines(device.log.follow(), 1, 5_000);
            holder = Number(line.split(" ")[1]);
            await new Promise(resolve => setTimeout(resolve, 200));

            await device.stop();
            expect(await stillPending(device.exit, 250)).equal(false);
            expect(await device.exit).deep.equal({ code: 3, signal: null });
        } finally {
            if (holder !== undefined) {
                process.kill(holder, "SIGKILL");
            }
            await device.close();
        }
    });

    it("does not report a restarted device as crashed by the process it replaced", async function () {
        this.timeout(15_000);

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            const follow = device.log.follow();
            await nextStore(follow, 5_000);

            await device.stop();
            await device.start();

            await nextStore(follow, 5_000);
            expect(await stillPending(device.exit, 250)).equal(true);
        } finally {
            await device.close();
        }
    });

    it("starts a fresh process after one that exited on its own", async function () {
        this.timeout(15_000);

        const binary = join(appDir, `chip-${app}-app`);
        const sleeper = await readFile(binary, "utf8");
        await writeFile(binary, "#!/bin/sh\necho known-line-one\nexit 3\n", { mode: 0o755 });

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            expect(await device.exit).deep.equal({ code: 3, signal: null });

            await writeFile(binary, sleeper, { mode: 0o755 });
            await device.start();

            expect((await nextStore(device.log.follow(), 5_000)).generations).equal(1);
        } finally {
            await device.close();
        }
    });

    it("spawns one process for two overlapping start() calls", async function () {
        this.timeout(15_000);

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await Promise.all([device.start(), device.start()]);

        try {
            expect((await nextStore(device.log.follow(), 5_000)).generations).equal(1);
        } finally {
            await device.close();
        }
    });

    it("rejects start() when the binary is missing, rather than reporting a device that never ran as crashed", async function () {
        this.timeout(15_000);

        await rm(join(appDir, `chip-${app}-app`));

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();

        try {
            await expect(device.start()).rejectedWith("ENOENT");
            expect(await stillPending(device.exit, 250)).equal(true);
        } finally {
            await device.close();
        }
    });

    for (const command of ["start", "reboot", "factoryReset"] as const) {
        it(`propagates a real start failure of a ${command} backchannel command`, async function () {
            this.timeout(15_000);

            const device = ChipLocalSubject(app)("cert");
            if (!isCertDevice(device)) {
                throw new Error("Expected a CertDevice");
            }

            await device.initialize();
            await device.start();

            try {
                await device.backchannel({ name: "stop" });
                await rm(join(appDir, `chip-${app}-app`));

                await expect(device.backchannel({ name: command })).rejectedWith("ENOENT");
            } finally {
                await device.close();
            }
        });
    }

    it("starts a stopped device again on a start backchannel command", async function () {
        this.timeout(15_000);

        const pidFile = join(appDir, "pids");
        await writeFile(
            join(appDir, `chip-${app}-app`),
            ["#!/bin/sh", `echo $$ >> "${pidFile}"`, "echo up", "exec sleep 300", ""].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();
        await collectLines(device.log.follow(), 1, 5_000);

        try {
            await device.backchannel({ name: "stop" });
            await device.backchannel({ name: "start" });

            let pids = new Array<number>();
            for (let attempt = 0; pids.length < 2 && attempt < 100; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 50));
                pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number);
            }
            expect(pids).length(2);
            expect(livingOf(pids)).deep.equal([pids[1]]);
        } finally {
            await device.close();
        }
    });

    it("discards the key-value store on a factoryReset backchannel command", async function () {
        this.timeout(15_000);

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            const follow = device.log.follow();
            const first = await nextStore(follow, 5_000);
            expect(first.generations).equal(1);

            await device.backchannel({ name: "factoryReset" });

            const second = await nextStore(follow, 5_000);
            expect(second.generations).equal(1);
            expect(second.path).not.equal(first.path);
            expect(existsSync(first.path)).equal(false);
            expect(await stillPending(device.exit, 250)).equal(true);
        } finally {
            await device.close();
        }
    });

    it("starts no process once closed, although a factoryReset under way when it closed goes on to start", async function () {
        this.timeout(15_000);

        const pidFile = join(appDir, "pids");
        await writeFile(
            join(appDir, `chip-${app}-app`),
            ["#!/bin/sh", `echo $$ >> "${pidFile}"`, "echo up", "exec sleep 300", ""].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();
        await collectLines(device.log.follow(), 1, 5_000);

        // A cleanup the run abandoned keeps running while the run closes the device under it
        const reset = device.backchannel({ name: "factoryReset" });
        await device.close();
        await reset;

        const pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number);
        const alive = livingOf(pids);
        for (const pid of alive) {
            process.kill(pid, "SIGKILL");
        }
        expect(pids).length(1);
        expect(alive).deep.equal([]);
    });

    it("settles a restart command a caller sends after close and never awaits, starting nothing", async function () {
        this.timeout(15_000);

        const pidFile = join(appDir, "pids");
        await writeFile(
            join(appDir, `chip-${app}-app`),
            ["#!/bin/sh", `echo $$ >> "${pidFile}"`, "echo up", "exec sleep 300", ""].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();
        await collectLines(device.log.follow(), 1, 5_000);
        await device.close();

        const unhandled = new Array<unknown>();
        const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
        process.on("unhandledRejection", onUnhandledRejection);
        try {
            // An abandoned finalizer's commands, which nobody awaits any more
            for (const name of ["factoryReset", "reboot", "start"] as const) {
                void device.backchannel({ name });
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        } finally {
            process.off("unhandledRejection", onUnhandledRejection);
        }

        const pids = (await readFile(pidFile, "utf8")).trim().split("\n").map(Number);
        const alive = livingOf(pids);
        for (const pid of alive) {
            process.kill(pid, "SIGKILL");
        }
        expect(unhandled).deep.equal([]);
        expect(pids).length(1);
        expect(alive).deep.equal([]);
    });

    it("stops a process whose start was still under way when the device closed", async function () {
        this.timeout(15_000);

        const pidFile = join(appDir, "pids");
        await writeFile(
            join(appDir, `chip-${app}-app`),
            ["#!/bin/sh", `echo $$ >> "${pidFile}"`, "exec sleep 300", ""].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject(app)("cert");
        await device.initialize();

        const start = device.start();
        await device.close();
        await start;

        // A process close() missed has written its pid by then; one it stopped may have died before writing
        await new Promise(resolve => setTimeout(resolve, 500));
        const pids = existsSync(pidFile) ? (await readFile(pidFile, "utf8")).trim().split("\n").map(Number) : [];
        const alive = livingOf(pids);
        for (const pid of alive) {
            process.kill(pid, "SIGKILL");
        }
        expect(alive).deep.equal([]);
    });

    it("keeps the key-value store on a reboot backchannel command", async function () {
        this.timeout(15_000);

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            const follow = device.log.follow();
            const first = await nextStore(follow, 5_000);

            await device.backchannel({ name: "reboot" });

            const second = await nextStore(follow, 5_000);
            expect(second.path).equal(first.path);
            expect(second.generations).equal(first.generations + 1);
        } finally {
            await device.close();
        }
    });

    it("spawns the variant binary CHIP builds beside the plain one", async function () {
        this.timeout(15_000);

        const variant = "nlfaultinject";
        await writeFile(join(appDir, `chip-${app}-app-${variant}`), "#!/bin/sh\necho variant-line\nexec sleep 300\n", {
            mode: 0o755,
        });

        const device = ChipLocalSubject(app, variant)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            expect(await collectLines(device.log.follow(), 1, 5_000)).deep.equal(["variant-line"]);
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("spawns an app whose CHIP binary does not carry the chip- prefix", async function () {
        this.timeout(15_000);

        await writeFile(join(appDir, "matter-network-manager-app"), "#!/bin/sh\necho nm-line\nexec sleep 300\n", {
            mode: 0o755,
        });

        const device = ChipLocalSubject("network-manager")("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            expect(await collectLines(device.log.follow(), 1, 5_000)).deep.equal(["nm-line"]);
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("hands each command to the app through the pipe it opened", async function () {
        this.timeout(15_000);

        // Stands in for a chip app's own named pipe handling: the app creates the fifo the harness
        // named, holds it open read-write as chip's `NamedPipeCommands` does, and reports what it reads
        // there, which is what the backchannel has to reach.
        await writeFile(
            join(appDir, "chip-all-clusters-app"),
            [
                "#!/bin/sh",
                'pipe=""',
                "while [ $# -gt 0 ]; do",
                '    if [ "$1" = "--app-pipe" ]; then pipe="$2"; fi',
                "    shift",
                "done",
                'mkfifo "$pipe"',
                "echo ready",
                'exec 3<> "$pipe"',
                'while read -r line <&3; do echo "pipe $line"; done',
                "",
            ].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject("all-clusters")("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            const lines = device.log.follow();
            expect(await collectLines(lines, 1, 5_000)).deep.equal(["ready"]);

            await device.backchannel({ name: "simulateSwitchIdle", endpointId: 3 });

            expect(await collectLines(lines, 1, 5_000)).deep.equal([
                'pipe {"Name":"SimulateSwitchIdle","EndpointId":3}',
            ]);

            await device.backchannel({ name: "userIntentCommissioningStart" });

            expect(await collectLines(lines, 1, 5_000)).deep.equal(['pipe {"Name":"UserIntentCommissioningStart"}']);
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("hands a simulation command to the app through its standard input", async function () {
        this.timeout(15_000);

        // Stands in for chip's bridge-app, which polls its standard input one character at a time
        // (`dd` reads exactly one byte, which `read` cannot do)
        await writeFile(
            join(appDir, "chip-bridge-app"),
            [
                "#!/bin/sh",
                "echo ready",
                "while true; do",
                "    char=$(dd bs=1 count=1 2>/dev/null)",
                '    if [ -z "$char" ]; then exit 0; fi',
                '    echo "stdin $char"',
                "done",
                "",
            ].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject("bridge")("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            const lines = device.log.follow();
            expect(await collectLines(lines, 1, 5_000)).deep.equal(["ready"]);

            await device.backchannel({ name: "addBridgedLight" });
            await device.backchannel({ name: "warmBridgedTemperatureSensors" });

            expect(await collectLines(lines, 2, 5_000)).deep.equal(["stdin 2", "stdin t"]);
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("refuses a standard-input command while the app is not running", async function () {
        this.timeout(15_000);

        const device = ChipLocalSubject("bridge")("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();

        try {
            await expect(device.backchannel({ name: "addBridgedLight" })).rejectedWith("not running");
        } finally {
            await device.close();
        }
    });

    it("refuses a bridge command for an app that does not read one, rather than writing a character it ignores", async function () {
        this.timeout(15_000);

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            await expect(device.backchannel({ name: "addBridgedLight" })).rejectedWith("addBridgedLight");
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("refuses a simulation command for an app that reads none, rather than writing where nothing listens", async function () {
        this.timeout(15_000);

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            await expect(device.backchannel({ name: "simulateSwitchIdle", endpointId: 3 })).rejectedWith(
                "simulateSwitchIdle",
            );
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("refuses a simulation command when the pipe path holds a file the app did not create", async function () {
        this.timeout(15_000);

        // Reports the pipe path instead of creating one, so the test can leave a plain file there
        await writeFile(
            join(appDir, "chip-all-clusters-app"),
            [
                "#!/bin/sh",
                'pipe=""',
                "while [ $# -gt 0 ]; do",
                '    if [ "$1" = "--app-pipe" ]; then pipe="$2"; fi',
                "    shift",
                "done",
                'echo "pipe-is $pipe"',
                "exec sleep 300",
                "",
            ].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject("all-clusters")("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            const [reported] = await collectLines(device.log.follow(), 1, 5_000);
            const pipePath = reported.replace("pipe-is ", "");

            // What a write to a path the app has not made a fifo would leave behind, and what the app's
            // own mkfifo would then accept as already existing
            await writeFile(pipePath, "");

            await expect(device.backchannel({ name: "simulateSwitchIdle", endpointId: 3 })).rejectedWith(
                "the app did not create",
            );
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("clears a pipe a killed app left behind, so the next generation can create its own", async function () {
        this.timeout(20_000);

        // Chip treats a failing mkfifo as fatal, so an app that finds one already there does not start
        await writeFile(
            join(appDir, "chip-all-clusters-app"),
            [
                "#!/bin/sh",
                'pipe=""',
                "while [ $# -gt 0 ]; do",
                '    if [ "$1" = "--app-pipe" ]; then pipe="$2"; fi',
                "    shift",
                "done",
                'mkfifo "$pipe" || { echo pipe-already-there; exit 3; }',
                "echo ready",
                "exec sleep 300",
                "",
            ].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject("all-clusters")("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            const lines = device.log.follow();
            expect(await collectLines(lines, 1, 5_000)).deep.equal(["ready"]);

            // A SIGKILL'd app never unlinks its own pipe, and stop() keeps the storage directory
            await device.stop();
            await device.start();

            // The stopped generation's stream can still yield its trailing blank line, so this looks for
            // what the second generation says rather than for the very next line
            const restarted = await collectLines(lines, 2, 5_000);
            expect(restarted).contains("ready");
            expect(restarted).not.contains("pipe-already-there");
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("fails a simulation command the app has stopped reading, rather than waiting for a reader", async function () {
        this.timeout(15_000);

        // Creates the pipe and never reads it, which is what an app that died holding its fifo leaves
        await writeFile(
            join(appDir, "chip-all-clusters-app"),
            [
                "#!/bin/sh",
                'pipe=""',
                "while [ $# -gt 0 ]; do",
                '    if [ "$1" = "--app-pipe" ]; then pipe="$2"; fi',
                "    shift",
                "done",
                'mkfifo "$pipe"',
                "echo ready",
                "exec sleep 300",
                "",
            ].join("\n"),
            { mode: 0o755 },
        );

        const device = ChipLocalSubject("all-clusters")("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();
        await device.start();

        try {
            expect(await collectLines(device.log.follow(), 1, 5_000)).deep.equal(["ready"]);

            await expect(device.backchannel({ name: "simulateSwitchIdle", endpointId: 3 })).rejectedWith(
                "stopped reading the pipe",
            );
        } finally {
            await device.stop();
            await device.close();
        }
    });

    it("refuses a simulation command while the app is not running, rather than leaving a file where its pipe goes", async () => {
        const device = ChipLocalSubject("all-clusters")("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await device.initialize();

        try {
            await expect(device.backchannel({ name: "simulateSwitchIdle", endpointId: 3 })).rejectedWith("not running");
        } finally {
            await device.close();
        }
    });

    it("fails clearly at start() when MATTER_CERT_APP_DIR is unset, rather than spawning an undefined path", async () => {
        delete env.MATTER_CERT_APP_DIR;

        const device = ChipLocalSubject(app)("cert");
        if (!isCertDevice(device)) {
            throw new Error("Expected a CertDevice");
        }

        await expect(device.start()).rejectedWith("MATTER_CERT_APP_DIR");
    });
});

describe("ChipDockerSubject", () => {
    it("refuses an app variant, which its per-app image has no binary for", async () => {
        const device = ChipDockerSubject("all-clusters", "nlfaultinject")("cert");

        await expect(device.initialize()).rejectedWith(/nlfaultinject/);
    });

    it("throws instead of starting its own dbus/mdns sidecars when the harness dbus container isn't running", async () => {
        const composeCalls = new Array<string>();
        const docker: DockerHandle = {
            async ensureVolume() {},
            compose(name) {
                composeCalls.push(name);
                throw new Error("compose() should not be called when the harness dbus container is down");
            },
            async containerStatus() {
                return undefined;
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);
        await expect(device.start()).rejectedWith(HARNESS_DBUS_CONTAINER);
        expect(composeCalls).deep.equal([]);
    });

    it("reuses the harness's dbus/mdns pair and starts only the app container", async () => {
        const statusChecks = new Array<string>();
        const addedParts = new Array<string>();
        let killed = false;
        let ended!: () => void;
        const container = fakeContainer({
            kill: async () => {
                killed = true;
                ended();
            },
            wait: () =>
                new Promise<void>(resolve => {
                    ended = resolve;
                }),
        });

        const composition: CompositionHandle = {
            async add(config) {
                addedParts.push(config.name);
                return container;
            },
            async close() {},
        };

        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus(name) {
                statusChecks.push(name);
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);

        await device.start();
        try {
            expect(statusChecks).deep.equal([HARNESS_DBUS_CONTAINER]);
            expect(addedParts).deep.equal(["app"]);
        } finally {
            await device.close();
        }

        expect(killed).equal(true);
        expect(await stillPending(device.exit, 100)).equal(true);
    });

    it("hands a simulation command to the app container's pipe, with the command as an argument", async function () {
        this.timeout(5_000);

        const execs = new Array<string[]>();
        let ended!: () => void;
        const container = fakeContainer({
            kill: async () => ended(),
            wait: () =>
                new Promise<void>(resolve => {
                    ended = resolve;
                }),
            exec: (async (command: string[]) => {
                execs.push(command);
            }) as Container["exec"],
        });

        const composition: CompositionHandle = {
            async add(config) {
                commands.push(...(config.command ?? []));
                return container;
            },
            async close() {},
        };

        const commands = new Array<string>();
        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("all-clusters", "cert", undefined, docker);

        await device.start();
        try {
            expect(commands).contains("--app-pipe");

            await device.backchannel({ name: "simulateSwitchIdle", endpointId: 3 });

            expect(execs.length).equal(1);
            const [bound, seconds, shell, flag, script, json] = execs[0];
            expect([bound, shell, flag]).deep.equal(["timeout", "sh", "-c"]);
            expect(Number(seconds)).greaterThan(0);
            expect(script).contains("test -p");
            expect(json).equal('{"Name":"SimulateSwitchIdle","EndpointId":3}');

            await device.backchannel({ name: "simulateLatchPosition", endpointId: 1, positionId: 1 });
            expect(execs.length).equal(2);
            expect(execs[1][execs[1].length - 1]).equal(
                '{"Name":"SimulateLatchPosition","EndpointId":1,"PositionId":1}',
            );
        } finally {
            await device.close();
        }
    });

    it("writes a bridge command to the container's attached standard input, kept open past a detach", async function () {
        this.timeout(5_000);

        const written = new Array<string>();
        const writtenAt = new Array<number>();
        let attachedStdin: boolean | undefined;
        let ended!: () => void;
        const container = fakeContainer({
            kill: async () => ended(),
            wait: () =>
                new Promise<void>(resolve => {
                    ended = resolve;
                }),
            attach: (async (_terminal: unknown, stdin?: boolean) => {
                attachedStdin = stdin;
                return {
                    async write(content: string) {
                        written.push(content);
                        writtenAt.push(performance.now());
                    },
                    async close() {},
                    async consume() {
                        return "";
                    },
                    [Symbol.asyncIterator]() {
                        return {
                            async next() {
                                return { done: true as const, value: undefined };
                            },
                        };
                    },
                };
            }) as Container["attach"],
        });

        let stdinOnce: boolean | undefined;
        const composition: CompositionHandle = {
            async add(config) {
                stdinOnce = config.stdinOnce;
                return container;
            },
            async close() {},
        };

        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("bridge", "cert", undefined, docker);

        await device.start();
        try {
            expect(attachedStdin).equal(true);

            // An app written to for as long as it runs must not lose its input to the first detach
            expect(stdinOnce).equal(false);

            await device.backchannel({ name: "renameBridgedLights" });
            await device.backchannel({ name: "removeBridgedLight" });

            expect(written).deep.equal(["b", "4"]);

            // The app reads one character per poll of its standard input and drops the rest of a
            // batch, so two commands must not travel together
            expect(writtenAt[1] - writtenAt[0]).greaterThan(MIN_STDIN_GAP_MS);
        } finally {
            await device.close();
        }
    });

    it("leaves an app that reads no standard-input command with Docker's own input lifetime", async function () {
        this.timeout(5_000);

        let ended!: () => void;
        const container = fakeContainer({
            kill: async () => ended(),
            wait: () =>
                new Promise<void>(resolve => {
                    ended = resolve;
                }),
        });

        let stdinOnce: boolean | undefined;
        const composition: CompositionHandle = {
            async add(config) {
                stdinOnce = config.stdinOnce;
                return container;
            },
            async close() {},
        };

        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("all-clusters", "cert", undefined, docker);

        await device.start();
        try {
            expect(stdinOnce).equal(true);
        } finally {
            await device.close();
        }
    });

    it("refuses a simulation command after the container is gone", async function () {
        this.timeout(5_000);

        let ended!: () => void;
        const container = fakeContainer({
            kill: async () => ended(),
            wait: () =>
                new Promise<void>(resolve => {
                    ended = resolve;
                }),
            exec: (async () => {
                throw new Error("exec should not reach a container that is gone");
            }) as Container["exec"],
        });

        const composition: CompositionHandle = {
            async add() {
                return container;
            },
            async close() {},
        };

        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("all-clusters", "cert", undefined, docker);

        await device.start();
        await device.stop();

        await expect(device.backchannel({ name: "simulateSwitchIdle", endpointId: 3 })).rejectedWith("not running");

        await device.close();
    });

    it("refuses a simulation command while no container is running", async () => {
        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                throw new Error("compose() should not be called");
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("all-clusters", "cert", undefined, docker);

        await expect(device.backchannel({ name: "simulateSwitchIdle", endpointId: 3 })).rejectedWith("not running");
    });

    it("closes the composition when adding the app container fails", async function () {
        this.timeout(5_000);

        let closed = 0;
        const composition: CompositionHandle = {
            async add() {
                throw new Error("add exploded");
            },
            async close() {
                closed++;
            },
        };

        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);

        await expect(device.start()).rejectedWith("add exploded");
        await device.close();

        expect(closed).equal(1);
    });

    it("starts for real after a launch that failed, rather than reporting the failed one as up", async function () {
        this.timeout(5_000);

        let closed = 0;
        const added = new Array<string>();
        const composition: CompositionHandle = {
            async add(config) {
                added.push(config.name);
                if (added.length === 1) {
                    throw new Error("add exploded");
                }
                return fakeContainer();
            },
            async close() {
                closed++;
            },
        };

        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);

        await expect(device.start()).rejectedWith("add exploded");

        // Without replacing the failed generation this resolves having started nothing
        await device.start();
        expect(added).deep.equal(["app", "app"]);

        // The composition of the failed attempt is reaped before the second one runs
        expect(closed).equal(1);

        await device.close();
        expect(closed).equal(2);
    });

    it("launches no container once closed, although a factoryReset under way when it closed goes on to start", async function () {
        this.timeout(5_000);

        let composed = 0;
        let closed = 0;
        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                composed++;
                return {
                    async add() {
                        let ended!: () => void;
                        const exited = new Promise<void>(resolve => (ended = resolve));
                        return fakeContainer({ kill: async () => ended(), wait: () => exited });
                    },
                    async close() {
                        closed++;
                    },
                };
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);
        await device.start();

        // A cleanup the run abandoned keeps running while the run closes the device under it
        const reset = device.backchannel({ name: "factoryReset" });
        await device.close();
        await reset;

        expect(composed).equal(1);
        expect(closed).equal(1);
    });

    it("kills a container whose launch was still under way when the device closed", async function () {
        this.timeout(5_000);

        let killed = false;
        let ended!: () => void;
        const exited = new Promise<void>(resolve => (ended = resolve));
        const container = fakeContainer({
            kill: async () => {
                killed = true;
                ended();
            },
            wait: () => exited,
        });

        let addCalled!: () => void;
        const adding = new Promise<void>(resolve => (addCalled = resolve));
        let releaseAdd!: (container: Container) => void;
        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return {
                    add() {
                        addCalled();
                        return new Promise<Container>(resolve => (releaseAdd = resolve));
                    },
                    async close() {},
                };
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);
        const start = device.start();
        await adding;

        const close = device.close();
        releaseAdd(container);
        await start;
        await close;

        expect(killed).equal(true);
    });

    it("closes without a launch whose container is not added in time, which then removes the container itself", async function () {
        this.timeout(20_000);

        let killed = false;
        let releaseAdd!: (container: Container) => void;
        let addCalled!: () => void;
        const adding = new Promise<void>(resolve => (addCalled = resolve));
        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return {
                    add() {
                        addCalled();
                        return new Promise<Container>(resolve => (releaseAdd = resolve));
                    },
                    async close() {},
                };
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);
        const start = device.start();
        await adding;

        await device.close();
        releaseAdd(
            fakeContainer({
                kill: async () => {
                    killed = true;
                },
            }),
        );

        await expect(start).rejectedWith("was stopped while its container was being added");
        expect(killed).equal(true);
    });

    it("composes nothing for a launch that resumes after the device closed", async function () {
        this.timeout(5_000);

        let composed = 0;
        let releaseStatus!: (status: { isRunning: boolean }) => void;
        let statusAsked!: () => void;
        const asked = new Promise<void>(resolve => (statusAsked = resolve));
        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                composed++;
                return {
                    async add() {
                        return fakeContainer();
                    },
                    async close() {},
                };
            },
            containerStatus() {
                statusAsked();
                return new Promise(resolve => (releaseStatus = resolve));
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);
        const start = device.start();
        await asked;

        const close = device.close();
        releaseStatus({ isRunning: true });
        await expect(start).rejectedWith("closed");
        await close;

        expect(composed).equal(0);
    });

    it("kills a container whose exit the daemon never confirmed", async function () {
        this.timeout(5_000);

        let killed = false;
        let closed = 0;
        const container = fakeContainer({
            kill: async () => {
                killed = true;
            },
            wait: async () => {
                throw new Error("daemon went away");
            },
        });

        const composition: CompositionHandle = {
            async add() {
                return container;
            },
            async close() {
                closed++;
            },
        };

        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);

        await device.start();
        await device.close();

        expect(killed).equal(true);
        expect(closed).equal(1);
    });

    it("still kills and reaps a running container when attach() fails", async function () {
        this.timeout(5_000);

        let killed = false;
        let ended!: () => void;
        const container = fakeContainer({
            attach: async () => {
                throw new Error("attach exploded");
            },
            kill: async () => {
                killed = true;
                ended();
            },
            wait: () =>
                new Promise<void>(resolve => {
                    ended = resolve;
                }),
        });

        let closed = 0;
        const composition: CompositionHandle = {
            async add() {
                return container;
            },
            async close() {
                closed++;
            },
        };

        const docker: DockerHandle = {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };

        const device = new ChipDockerDevice("test", "cert", undefined, docker);

        await expect(device.start()).rejectedWith("attach exploded");

        await device.close();

        expect(killed).equal(true);
        expect(closed).equal(1);
    });
});

describe("ChipDockerDevice backchannel start and output failures", () => {
    function dockerHandle(composition: CompositionHandle): DockerHandle {
        return {
            async ensureVolume() {},
            compose() {
                return composition;
            },
            async containerStatus() {
                return { isRunning: true };
            },
        };
    }

    it("starts a container on a start backchannel command and removes it on stop", async function () {
        this.timeout(5_000);

        let added = 0;
        let closed = 0;
        const device = new ChipDockerDevice(
            "test",
            "cert",
            undefined,
            dockerHandle({
                async add() {
                    added++;
                    let ended!: () => void;
                    const exited = new Promise<void>(resolve => (ended = resolve));
                    return fakeContainer({ kill: async () => ended(), wait: () => exited });
                },
                async close() {
                    closed++;
                },
            }),
        );

        try {
            await device.backchannel({ name: "start" });
            expect(added).equal(1);

            await device.backchannel({ name: "stop" });
            expect(closed).equal(1);

            await device.backchannel({ name: "start" });
            expect(added).equal(2);
        } finally {
            await device.close();
        }
    });

    for (const command of ["start", "factoryReset"] as const) {
        it(`propagates a real launch failure of a ${command} backchannel command`, async function () {
            this.timeout(5_000);

            const device = new ChipDockerDevice(
                "test",
                "cert",
                undefined,
                dockerHandle({
                    async add() {
                        throw new Error("add exploded");
                    },
                    async close() {},
                }),
            );

            try {
                await expect(device.backchannel({ name: command })).rejectedWith("add exploded");
            } finally {
                await device.close();
            }
        });
    }

    /** Stops a device whose output read fails with `error`, and returns what it logged. */
    async function logsFor(error: Error) {
        let ended!: () => void;
        const exited = new Promise<void>(resolve => (ended = resolve));
        const terminal = {
            async write() {},
            async close() {},
            async consume() {
                return "";
            },
            [Symbol.asyncIterator]() {
                return {
                    async next(): Promise<never> {
                        throw error;
                    },
                };
            },
        };
        const container = fakeContainer({
            kill: async () => ended(),
            wait: () => exited,
            attach: (async () => terminal) as unknown as Container["attach"],
        });
        const device = new ChipDockerDevice(
            "test",
            "cert",
            undefined,
            dockerHandle({
                async add() {
                    return container;
                },
                async close() {},
            }),
        );

        const logged = { debug: new Array<unknown[]>(), warn: new Array<unknown[]>() };
        const { debug, warn } = console;
        console.debug = (...args: unknown[]) => void logged.debug.push(args);
        console.warn = (...args: unknown[]) => void logged.warn.push(args);
        try {
            await device.start();
            await device.stop();
        } finally {
            console.debug = debug;
            console.warn = warn;
            await device.close();
        }
        return logged;
    }

    it("logs an output stream closed early at debug, not as a warning", async function () {
        this.timeout(5_000);

        const logged = await logsFor(
            Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
        );

        expect(logged.debug.map(args => args[0])).contains("Device output ended early:");
        expect(logged.warn.map(args => args[0])).not.contains("Error reading device output:");
    });

    it("logs any other output failure as a warning", async function () {
        this.timeout(5_000);

        const logged = await logsFor(Object.assign(new Error("socket reset"), { code: "ECONNRESET" }));

        expect(logged.warn.map(args => args[0])).contains("Error reading device output:");
        expect(logged.debug.map(args => args[0])).not.contains("Device output ended early:");
    });
});

describe("requiredAppArgs", () => {
    const image = "/tmp/cert-app/ota-placeholder.bin";

    // chip's ota-provider-app exits at startup without one of these ("Either an OTA file or image
    // list file must be specified", then chipDie), and -f is checked for readability as it is parsed
    it("gives an OTA provider the image argument it cannot start without", () => {
        expect(requiredAppArgs("ota-provider", [], image)).deep.equal(["-f", image]);
    });

    // A case that serves from the app names the image itself, and two such arguments are refused by
    // the app's own parser
    it("leaves a case's own image argument alone", () => {
        for (const named of ["-f", "--filepath", "-o", "--otaImageList"]) {
            expect(requiredAppArgs("ota-provider", [named, "/images/real.ota"], image)).deep.equal([]);
        }
    });

    it("gives no other app anything", () => {
        expect(requiredAppArgs("ota-requestor", [], image)).deep.equal([]);
        expect(requiredAppArgs("all-clusters", [], image)).deep.equal([]);
    });
});
