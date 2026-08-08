/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dynamically imports a same-package module, normalizing CJS/ESM interop.
 *
 * The CJS build's named exports are getter properties added via esbuild's `__export` helper
 * (`Object.defineProperty(target, name, { get: ... })`), which defeats Node's cjs-module-lexer:
 * `import()` on that build surfaces no named properties at all, only `default` (the real
 * `module.exports`). The ESM build has no such wrapping and needs no unwrapping.
 */
export async function importModule<T extends object>(specifier: string): Promise<T> {
    const mod = await import(specifier);
    return mod.default ?? mod;
}
