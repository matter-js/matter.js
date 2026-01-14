/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// See https://github.com/tc39/proposal-explicit-resource-management
//
// We downlevel support for "using foo = ..." using esbuild but downleveling does not include a polyfill so we patch in
// standin symbols here

if (typeof Symbol.dispose !== "symbol") {
    (Symbol as { dispose: symbol }).dispose = Symbol("dispose");
    if (typeof Symbol.dispose !== "symbol") {
        throw new Error("Symbol.dispose is undefined and polyfill installation failed");
    }
}

if (typeof Symbol.asyncDispose !== "symbol") {
    (Symbol as { asyncDispose: symbol }).asyncDispose = Symbol("asyncDispose");
    if (typeof Symbol.asyncDispose !== "symbol") {
        throw new Error("Symbol.asyncDispose is undefined and polyfill installation failed");
    }
}
