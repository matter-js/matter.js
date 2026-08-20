/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertDevice, CompositionHandle, Container, DockerHandle, Subject } from "@matter/testing";
import { ChipDockerDevice, ChipDockerSubject, ChipLocalSubject, HARNESS_DBUS_CONTAINER } from "@matter/testing";
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

    it("still reaps the container when attach() fails, so a later close() completes", async function () {
        this.timeout(5_000);

        const container = fakeContainer({
            attach: async () => {
                throw new Error("attach exploded");
            },
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

        expect(closed).equal(1);
    });
});
