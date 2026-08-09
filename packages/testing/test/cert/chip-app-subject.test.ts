/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertDevice } from "../../src/chip/cert/cert-context.js";
import type * as ChipAppSubjectModule from "../../src/chip/cert/chip-app-subject.js";
import type { CompositionHandle, DockerHandle } from "../../src/chip/cert/chip-app-subject.js";
import type { Container } from "../../src/docker/container.js";
import type { Subject } from "../../src/device/subject.js";
import { importModule } from "./dynamic-import.js";

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

// chip-app-subject.ts spawns real processes/containers via node:child_process and dockerode, neither
// of which is browser-bundleable. It's loaded (along with the node:* modules this suite needs
// directly) only via dynamic import inside this guard, so the web run's static import graph never
// reaches those requires.
if (typeof window === "undefined") {
    describe("ChipLocalSubject", () => {
        const app = "test";

        let ChipLocalSubject: typeof ChipAppSubjectModule.ChipLocalSubject;
        let fsp: typeof import("node:fs/promises");
        let osMod: typeof import("node:os");
        let pathMod: typeof import("node:path");

        let appDir: string;
        const originalAppDir = process.env.MATTER_CERT_APP_DIR;

        before(async () => {
            ({ ChipLocalSubject } = await importModule<typeof ChipAppSubjectModule>(
                "../../src/chip/cert/chip-app-subject.js",
            ));
            fsp = await import("node:fs/promises");
            osMod = await import("node:os");
            pathMod = await import("node:path");
        });

        beforeEach(async () => {
            appDir = await fsp.mkdtemp(pathMod.join(osMod.tmpdir(), "matter-cert-local-test-"));
            const scriptPath = pathMod.join(appDir, `chip-${app}-app`);

            // `exec` replaces the shell with `sleep` so SIGTERM lands on the actual sleeping process,
            // not a shell that could leave it orphaned.
            await fsp.writeFile(scriptPath, "#!/bin/sh\necho known-line-one\necho known-line-two\nexec sleep 300\n", {
                mode: 0o755,
            });

            process.env.MATTER_CERT_APP_DIR = appDir;
        });

        afterEach(async () => {
            if (originalAppDir === undefined) {
                delete process.env.MATTER_CERT_APP_DIR;
            } else {
                process.env.MATTER_CERT_APP_DIR = originalAppDir;
            }
            await fsp.rm(appDir, { recursive: true, force: true });
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
            delete process.env.MATTER_CERT_APP_DIR;

            const device = ChipLocalSubject(app)("cert");
            if (!isCertDevice(device)) {
                throw new Error("Expected a CertDevice");
            }

            await expect(device.start()).rejectedWith("MATTER_CERT_APP_DIR");
        });
    });

    describe("ChipDockerSubject", () => {
        let ChipDockerDevice: typeof ChipAppSubjectModule.ChipDockerDevice;
        let HARNESS_DBUS_CONTAINER: string;

        before(async () => {
            ({ ChipDockerDevice, HARNESS_DBUS_CONTAINER } = await importModule<typeof ChipAppSubjectModule>(
                "../../src/chip/cert/chip-app-subject.js",
            ));
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
}
