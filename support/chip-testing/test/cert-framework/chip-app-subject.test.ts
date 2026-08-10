/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertDevice, CompositionHandle, Container, DockerHandle, Subject } from "@matter/testing";
import { ChipDockerDevice, ChipLocalSubject, HARNESS_DBUS_CONTAINER } from "@matter/testing";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
function fakeContainer(): Container {
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
    } as unknown as Container;
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

describe("ChipLocalSubject", () => {
    const app = "test";

    let appDir: string;
    const originalAppDir = env.MATTER_CERT_APP_DIR;

    beforeEach(async () => {
        appDir = await mkdtemp(join(tmpdir(), "matter-cert-local-test-"));
        const scriptPath = join(appDir, `chip-${app}-app`);

        // `exec` replaces the shell with `sleep` so SIGTERM lands on the actual sleeping process,
        // not a shell that could leave it orphaned.
        await writeFile(scriptPath, "#!/bin/sh\necho known-line-one\necho known-line-two\nexec sleep 300\n", {
            mode: 0o755,
        });

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

            await device.stop();

            const exitInfo = await device.exit;
            expect(exitInfo.signal).equal("SIGTERM");
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
        const container = fakeContainer();

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
    });
});
