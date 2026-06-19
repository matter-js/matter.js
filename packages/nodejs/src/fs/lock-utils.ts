/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, StorageLockError } from "@matter/general";
import { randomBytes } from "node:crypto";
import { unlinkSync } from "node:fs";
import { open as fsOpen, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const logger = Logger.get("NodeJsDirectoryLock");

const LOCK_FILE = "matter.lock";
const PID_FILE = "matter.pid";

/**
 * A random token unique to this process instance.  Written alongside the PID so we can detect PID reuse (e.g. in
 * Docker where the new container's entrypoint often gets the same PID as the old one).
 */
const PROCESS_TOKEN = randomBytes(8).toString("hex");

interface LockInfo {
    pid: number;
    token?: string;
}

interface ActiveLock {
    lockPath: string;
    pidPath: string;
    name: string;
}

/**
 * Locks held by this process that have not yet been released.  A `process.exit` backstop removes the files for any
 * survivors so a caller that forgets to close storage does not orphan a lock that blocks the next startup.
 */
const activeLocks = new Set<ActiveLock>();
let exitHandlerInstalled = false;

function trackLock(lock: ActiveLock) {
    activeLocks.add(lock);
    if (!exitHandlerInstalled) {
        exitHandlerInstalled = true;
        // 'exit' is synchronous-only, so cleanup is limited to unlinking the lock files; it cannot flush storage.
        process.on("exit", removeOrphanedLocks);
    }
}

function removeOrphanedLocks() {
    for (const { lockPath, pidPath, name } of activeLocks) {
        // Cleanup is the critical action; logging is advisory and must not prevent it if the logger throws
        try {
            logger.warn(
                `Storage "${name}" was not closed before process exit; removing orphaned lock.`,
                "Please close any opened storage during shutdown.",
            );
        } catch {
            // ignore
        }
        unlinkSyncSafe(lockPath);
        unlinkSyncSafe(pidPath);
    }
}

function unlinkSyncSafe(path: string) {
    try {
        unlinkSync(path);
    } catch {
        // Best-effort cleanup during exit
    }
}

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

    await acquireLock(lockPath, pidPath, dirName);
    await writeFile(pidPath, `${process.pid} ${PROCESS_TOKEN}`);

    const tracked: ActiveLock = { lockPath, pidPath, name: dirName };
    trackLock(tracked);

    logger.debug("Acquired storage lock for", dirName, "pid", process.pid);

    return async () => {
        // Remove the lock (the gate) first: if the second unlink fails, a leftover pid file is harmless (the next
        // start reacquires and overwrites it), whereas a leftover lock file would force stale detection
        await safeUnlink(lockPath);
        await safeUnlink(pidPath);
        activeLocks.delete(tracked);
        logger.debug("Released storage lock for", dirName);
    };
}

async function acquireLock(lockPath: string, pidPath: string, dirName: string) {
    try {
        const fd = await fsOpen(lockPath, "wx");
        await fd.close();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }

        // Lock file exists — check if the owning process is still alive
        const info = await readLockInfo(pidPath);
        const reason = staleReason(info);

        if (reason !== undefined) {
            logger.info("Cleaning stale storage lock for", dirName, "-", reason);
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
        } else if (info?.pid === process.pid) {
            throw new StorageLockError("Storage is already locked by this process");
        } else {
            throw new StorageLockError(`Storage is locked by another process (pid ${info?.pid})`);
        }
    }
}

/**
 * Returns why a lock is stale, or `undefined` if it is held by a live owner.  The reason is logged so the cause of a
 * reclaim (and any failure to release) is visible in the storage logs.
 */
function staleReason(info: LockInfo | undefined): string | undefined {
    if (info === undefined) {
        return "no PID file (owner crashed before writing it)";
    }

    if (info.pid === process.pid) {
        // Same PID — check whether it's actually us via the token.  If the token matches, the lock is held by another
        // call site in this process.  If it differs (or is missing from an old-format file), the PID was reused.
        return info.token !== PROCESS_TOKEN ? `PID ${info.pid} reused (token mismatch)` : undefined;
    }

    try {
        process.kill(info.pid, 0);
        // Process exists and we have permission to signal it (or EPERM below) — lock is not stale
        return undefined;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            return `owner process ${info.pid} no longer exists`;
        }
        // EPERM — process exists but we can't signal it — lock is not stale
        return undefined;
    }
}

async function readLockInfo(pidPath: string): Promise<LockInfo | undefined> {
    try {
        const content = await readFile(pidPath, "utf-8");
        const parts = content.trim().split(/\s+/);
        const pid = parseInt(parts[0], 10);
        if (!Number.isFinite(pid) || pid <= 0) {
            return undefined;
        }
        return { pid, token: parts[1] };
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
