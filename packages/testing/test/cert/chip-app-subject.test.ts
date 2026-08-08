/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertDevice } from "../../src/chip/cert/cert-context.js";
import type * as ChipAppSubjectModule from "../../src/chip/cert/chip-app-subject.js";
import type { Subject } from "../../src/device/subject.js";
import { importModule } from "./dynamic-import.js";

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
}
