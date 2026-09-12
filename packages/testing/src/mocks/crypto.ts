/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monkey-patch crypto.subtle so that MockTime automatically uses macrotask yields while async crypto operations are
 * pending.  Node.js crypto.subtle methods only resolve on macrotask boundaries, so MockTime's default microtask yields
 * will hang if a crypto operation is in flight.
 *
 * Each patched method registers its promise via {@link MockTime.requireHostAsync}, which keeps MockTime in macrotask
 * mode and withholds virtual time for the duration of the operation.  MockTime tracks each registration separately,
 * so overlapping operations are handled naturally.
 */

import { MockTime } from "./time.js";

if (typeof crypto !== "undefined" && crypto.subtle) {
    const subtle = crypto.subtle;

    for (const name of [
        "decrypt",
        "deriveBits",
        "deriveKey",
        "digest",
        "encrypt",
        "exportKey",
        "generateKey",
        "importKey",
        "sign",
        "unwrapKey",
        "verify",
        "wrapKey",
    ] as const) {
        const original = (subtle as any)[name] as (...args: any[]) => Promise<any>;
        if (typeof original !== "function") {
            continue;
        }
        (subtle as any)[name] = function (...args: any[]) {
            return MockTime.requireHostAsync(original.apply(subtle, args));
        };
    }
}

// Node.js's callback-based crypto methods (hkdf, pbkdf2) also settle on host time via libuv's thread pool
const nodeCrypto = (globalThis as any).process?.getBuiltinModule?.("crypto");
if (nodeCrypto) {
    for (const name of ["hkdf", "pbkdf2"]) {
        const original = nodeCrypto[name];
        if (typeof original !== "function") {
            continue;
        }
        nodeCrypto[name] = function (...args: any[]) {
            const callback = args[args.length - 1];
            let resolve!: () => void;
            const settled = new Promise<void>(r => (resolve = r));
            args[args.length - 1] = (...cbArgs: any[]) => {
                resolve();
                callback(...cbArgs);
            };

            // Argument validation throws before the operation is scheduled, so registration follows the call that
            // guarantees the callback runs
            const result = original.apply(this, args);
            void MockTime.requireHostAsync(settled);
            return result;
        };
    }
}
