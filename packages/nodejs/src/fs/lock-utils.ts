/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, StorageLockError } from "@matter/general";
import { open as fsOpen, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const logger = Logger.get("NodeJsDirectoryLock");

const LOCK_FILE = "matter.lock";
const PID_FILE = "matter.pid";

/**
 * Acquire an exclusive lock on a directory using O_EXCL and a PID file for stale-lock detection.
 *
 * Returns a release function that removes the lock and PID files.
 */
export async function acquireDirectoryLock(dirPath: string, dirName: string): Promise<() => Promise<void>> {
    const lockPath = resolve(dirPath, LOCK_FILE);
    const pidPath = resolve(dirPath, PID_FILE);

    // Only lock if the directory already exists — if it doesn't, there's no data to protect and creating it would
    // interfere with storage driver detection (which checks directory existence)
    if (!(await dirExists(dirPath))) {
        return async () => {};
    }

    await acquireLock(lockPath, pidPath);
    await writeFile(pidPath, String(process.pid));

    logger.debug("Acquired storage lock for", dirName, "pid", process.pid);

    return async () => {
        await safeUnlink(pidPath);
        await safeUnlink(lockPath);
        logger.debug("Released storage lock for", dirName);
    };
}

async function acquireLock(lockPath: string, pidPath: string) {
    try {
        const fd = await fsOpen(lockPath, "wx");
        await fd.close();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }

        // Lock file exists — check if the owning process is still alive
        if (await isStale(pidPath)) {
            logger.info("Cleaning stale storage lock");
            await safeUnlink(pidPath);
            await safeUnlink(lockPath);

            // Retry once; if another process grabbed the lock between our cleanup and retry, we fail
            try {
                const fd = await fsOpen(lockPath, "wx");
                await fd.close();
            } catch (retryError) {
                if ((retryError as NodeJS.ErrnoException).code === "EEXIST") {
                    throw new StorageLockError("Storage is locked by another process (lock reclaimed during retry)");
                }
                throw retryError;
            }
        } else {
            const ownerPid = await readPid(pidPath);
            throw new StorageLockError(`Storage is locked by another process (pid ${ownerPid})`);
        }
    }
}

async function isStale(pidPath: string): Promise<boolean> {
    const pid = await readPid(pidPath);
    if (pid === undefined) {
        // No PID file or unreadable — treat as stale (crash between lock and PID write)
        return true;
    }

    try {
        process.kill(pid, 0);
        // Process exists and we have permission to signal it — lock is not stale
        return false;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            // Process does not exist — lock is stale
            return true;
        }
        // EPERM — process exists but we can't signal it — lock is not stale
        return false;
    }
}

async function readPid(pidPath: string): Promise<number | undefined> {
    try {
        const content = await readFile(pidPath, "utf-8");
        const pid = parseInt(content.trim(), 10);
        return Number.isFinite(pid) && pid > 0 ? pid : undefined;
    } catch {
        return undefined;
    }
}

async function dirExists(path: string): Promise<boolean> {
    try {
        const s = await stat(path);
        return s.isDirectory();
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }
        throw e;
    }
}

async function safeUnlink(path: string) {
    try {
        await unlink(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }
}
