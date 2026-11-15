/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** A `--name value`, `--name=value` or single-dash argument in `args`; `undefined` where it is absent or has no value. */
export function argValue(args: string[], name: string): string | undefined {
    const flags = [`-${name}`, `--${name}`];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (flags.includes(arg)) {
            return i + 1 < args.length ? args[i + 1] : undefined;
        }
        const eq = flags.map(f => `${f}=`).find(prefix => arg.startsWith(prefix));
        if (eq !== undefined) {
            return arg.slice(eq.length);
        }
    }
    return undefined;
}
