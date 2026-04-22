/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "../log/Logger.js";
import type { File } from "./File.js";

const logger = Logger.get("FileHandleTracker");

interface HandleInfo {
    purpose: string;
    path: string;
}

/**
 * Tracks open {@link File.Handle} instances for leak detection.
 *
 * Uses {@link FinalizationRegistry} to detect handles that are garbage-collected without being closed, and maintains a
 * set of open handles to warn about at process exit.  Both mechanisms are diagnostic-only — no cleanup is attempted.
 */
export namespace FileHandleTracker {
    const openHandles = new Set<WeakRef<File.Handle>>();

    const registry = new FinalizationRegistry<HandleInfo>(info => {
        logger.error(`File handle GC'd without close: "${info.purpose}" for ${info.path}`);
    });

    /**
     * Register an opened file handle for leak tracking.
     */
    export function register(handle: File.Handle) {
        const info: HandleInfo = { purpose: handle.purpose, path: handle.path };

        registry.register(handle, info, handle);

        const ref = new WeakRef(handle);
        openHandles.add(ref);
    }

    /**
     * Unregister a file handle when it is closed.
     */
    export function unregister(handle: File.Handle) {
        registry.unregister(handle);

        for (const ref of openHandles) {
            if (ref.deref() === handle) {
                openHandles.delete(ref);
                break;
            }
        }
    }

    /**
     * Install a callback that runs at process exit to warn about unclosed handles.  Platform packages (e.g.
     * @matter/nodejs) should call this with their exit hook mechanism.
     */
    export function onExit(install: (callback: () => void) => void) {
        install(() => {
            for (const ref of openHandles) {
                const handle = ref.deref();
                if (handle !== undefined) {
                    logger.warn(`File handle still open at exit: "${handle.purpose}" for ${handle.path}`);
                }
            }
        });
    }
}
