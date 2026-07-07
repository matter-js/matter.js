/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { acquireDirectoryLock } from "#fs/lock-utils.js";
import { StorageLockError } from "@matter/general";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("DirectoryLock", () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await mkdtemp(join(tmpdir(), "matterjs-lock-test-"));
    });

    afterEach(async () => {
        await rm(rootDir, { recursive: true, force: true });
    });

    it("acquires and releases lock files", async () => {
        const release = await acquireDirectoryLock(rootDir, "test");

        // Lock and PID files should exist
        await expectFileExists(join(rootDir, "matter.lock"));
        await expectFileExists(join(rootDir, "matter.pid"));

        // PID file should contain our PID and a token
        const content = await readFile(join(rootDir, "matter.pid"), "utf-8");
        const parts = content.trim().split(/\s+/);
        expect(parts).length(2);
        expect(parseInt(parts[0], 10)).equal(process.pid);
        expect(parts[1]).match(/^[0-9a-f]{16}$/);

        await release();

        // Both files should be gone
        await expectFileNotExists(join(rootDir, "matter.lock"));
        await expectFileNotExists(join(rootDir, "matter.pid"));
    });

    it("throws on in-process conflict", async () => {
        const release = await acquireDirectoryLock(rootDir, "test");

        try {
            await expect(acquireDirectoryLock(rootDir, "test")).rejectedWith(
                StorageLockError,
                "Storage is already locked by this process",
            );
        } finally {
            await release();
        }
    });

    it("cleans up stale lock from dead process", async () => {
        // Simulate a stale lock left by a process that no longer exists.  PID 2147483647 is the max PID on most
        // systems and is extremely unlikely to be alive.
        await writeFile(join(rootDir, "matter.lock"), "");
        await writeFile(join(rootDir, "matter.pid"), "2147483647 deadbeefdeadbeef");

        const release = await acquireDirectoryLock(rootDir, "test");

        // Should have acquired the lock successfully
        const content = await readFile(join(rootDir, "matter.pid"), "utf-8");
        expect(parseInt(content.trim().split(/\s+/)[0], 10)).equal(process.pid);

        await release();
    });

    it("cleans up stale lock from reused PID", async () => {
        // Simulate the Docker PID-reuse scenario: the PID file has our own PID but a different token
        await writeFile(join(rootDir, "matter.lock"), "");
        await writeFile(join(rootDir, "matter.pid"), `${process.pid} aaaaaaaaaaaaaaaa`);

        const release = await acquireDirectoryLock(rootDir, "test");

        // Should have acquired the lock — the stale lock was cleaned up
        const content = await readFile(join(rootDir, "matter.pid"), "utf-8");
        const parts = content.trim().split(/\s+/);
        expect(parseInt(parts[0], 10)).equal(process.pid);
        expect(parts[1]).not.equal("aaaaaaaaaaaaaaaa");

        await release();
    });

    it("throws on out-of-process conflict", async () => {
        // Spawn a real process that sleeps briefly so we have a live PID to write into the lock file
        const child = spawn(process.argv[0], ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });

        try {
            await writeFile(join(rootDir, "matter.lock"), "");
            await writeFile(join(rootDir, "matter.pid"), `${child.pid} cafecafecafecafe`);

            await expect(acquireDirectoryLock(rootDir, "test")).rejectedWith(
                StorageLockError,
                `Storage is locked by another process (pid ${child.pid})`,
            );
        } finally {
            child.kill();
        }
    });

    it("removes orphaned lock files when the owning process exits without releasing", async () => {
        // Spawn a real process that acquires a lock and exits without releasing it, then assert the exit backstop
        // removed the lock files.  The child uses the built module (it runs outside the test loader) and resolves it
        // from the package entry so the path holds regardless of where the test itself runs from.
        const script = `
            import { createRequire } from "node:module";
            import { dirname, resolve } from "node:path";
            import { pathToFileURL } from "node:url";
            const mod = resolve(dirname(createRequire(import.meta.url).resolve("@matter/nodejs")), "../esm/fs/lock-utils.js");
            const { acquireDirectoryLock } = await import(pathToFileURL(mod).href);
            await acquireDirectoryLock(process.env.LOCK_DIR, "leaktest");
        `;

        const { code, output } = await runNode(script, { ...process.env, LOCK_DIR: rootDir });

        expect(code, `child output:\n${output}`).equal(0);
        await expectFileNotExists(join(rootDir, "matter.lock"));
        await expectFileNotExists(join(rootDir, "matter.pid"));
        expect(output).contains("orphaned lock");
    });

    it("cleans up stale lock with old PID-only format", async () => {
        // Backward compat: old lock files without a token should be treated as stale when the process is dead
        await writeFile(join(rootDir, "matter.lock"), "");
        await writeFile(join(rootDir, "matter.pid"), "2147483647");

        const release = await acquireDirectoryLock(rootDir, "test");
        await release();
    });
});

async function runNode(script: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
    return new Promise((res, rej) => {
        const child = spawn(process.argv[0], ["--input-type=module", "-e", script], { env });
        let output = "";
        child.stdout.on("data", d => (output += d));
        child.stderr.on("data", d => (output += d));
        child.on("error", rej);
        child.on("close", code => res({ code, output }));
    });
}

async function expectFileExists(path: string) {
    try {
        await stat(path);
    } catch {
        expect.fail(`Expected file to exist: ${path}`);
    }
}

async function expectFileNotExists(path: string) {
    try {
        await stat(path);
        expect.fail(`Expected file not to exist: ${path}`);
    } catch (e) {
        expect((e as NodeJS.ErrnoException).code).equal("ENOENT");
    }
}
