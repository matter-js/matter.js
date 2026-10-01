/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { acquireHarnessLock, Docker, HarnessBusyError } from "@matter/testing";
import { spawn } from "node:child_process";

const IMAGE = process.env.MATTER_CHIP_IMAGE || "ghcr.io/matter-js/chip:latest";

/**
 * Takes the lock in a separate process, so the test can end that process the way a crash would. With `keepAlive`
 * false the process has nothing left to do once it holds the lock.
 */
function holdInChild(name: string, keepAlive = true) {
    const script =
        `import { acquireHarnessLock } from "@matter/testing";` +
        `await acquireHarnessLock({ name: ${JSON.stringify(name)}, image: ${JSON.stringify(IMAGE)}, waitMs: 0 });` +
        `console.log("held");${keepAlive ? " setInterval(() => {}, 1 << 30);" : ""}`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
        stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", data => (stderr += String(data)));
    const held = new Promise<void>((resolve, reject) => {
        child.stdout.on("data", data => String(data).includes("held") && resolve());
        child.once("exit", code => reject(new Error(`Lock holder exited with ${code} before taking the lock`)));
    });
    const exited = new Promise<number | null>(resolve => child.once("exit", code => resolve(code)));
    return { child, held, exited, stderr: () => stderr };
}

async function waitForRemoval(docker: Docker, name: string, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if ((await docker.containerStatus(name)) === undefined) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
}

describe("harness lock against the Docker daemon", () => {
    const name = `matter.js-harness-lock-test-${process.pid}`;
    const docker = new Docker();

    it("holds the lock while its process lives, refuses a second taker, and ends when the process is killed", async function () {
        this.timeout(60_000);

        const { child, held } = holdInChild(name);
        try {
            await held;
            expect((await docker.containerStatus(name))?.isRunning).equal(true);

            const refusal = await acquireHarnessLock({ name, image: IMAGE, waitMs: 0 }).then(
                () => undefined,
                (e: unknown) => e,
            );
            expect(refusal).instanceOf(HarnessBusyError);

            child.kill("SIGKILL");
            expect(await waitForRemoval(docker, name, 10_000)).equal(true);

            const release = await acquireHarnessLock({ name, image: IMAGE, waitMs: 0 });
            expect((await docker.containerStatus(name))?.isRunning).equal(true);
            await release();
            expect(await waitForRemoval(docker, name, 10_000)).equal(true);
        } finally {
            child.kill("SIGKILL");
            await docker.erase(name);
        }
    });

    it("does not keep its process alive, and ends when that process exits on its own", async function () {
        this.timeout(60_000);

        const { child, held, exited } = holdInChild(name, false);
        try {
            await held;
            expect(await exited).equal(0);
            expect(await waitForRemoval(docker, name, 10_000)).equal(true);
        } finally {
            child.kill("SIGKILL");
            await docker.erase(name);
        }
    });

    it("warns in the holding process when its lock is removed while it still runs", async function () {
        this.timeout(60_000);

        const { child, held, stderr } = holdInChild(name);
        try {
            await held;
            await docker.erase(name);

            const deadline = Date.now() + 10_000;
            while (!stderr().includes("ended while this run still uses the harness") && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            expect(stderr()).contains("ended while this run still uses the harness");
        } finally {
            child.kill("SIGKILL");
            await docker.erase(name);
        }
    });
});
