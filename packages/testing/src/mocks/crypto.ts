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
 * Each patched method registers its promise via {@link MockTime.requireMacrotasks}, which keeps MockTime in macrotask
 * mode for the duration of the operation.  Overlapping operations are handled naturally by the ref-counted dependent
 * set.
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
            return MockTime.requireMacrotasks(original.apply(subtle, args));
        };
    }
}

// Node.js's callback-based crypto methods (hkdf, pbkdf2) also resolve on macrotask boundaries via libuv's thread
// pool. Wrap the callbacks so MockTime stays in macrotask mode while they're pending.
const nodeCrypto = (globalThis as any).process?.getBuiltinModule?.("crypto");
if (nodeCrypto) {
    for (const name of ["hkdf", "pbkdf2"]) {
        const original = nodeCrypto[name];
        if (typeof original !== "function") {
            continue;
        }
        nodeCrypto[name] = function (...args: any[]) {
            const callback = args[args.length - 1];
            let resolve: () => void;
            void MockTime.requireMacrotasks(new Promise<void>(r => (resolve = r)));
            args[args.length - 1] = (...cbArgs: any[]) => {
                resolve();
                callback(...cbArgs);
            };
            return original.apply(this, args);
        };
    }
}
