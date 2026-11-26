/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StateType } from "../state/StateType.js";

const EXPLICIT_DEFAULTS = Symbol("explicitDefaults");

interface HasExplicitDefaults {
    [EXPLICIT_DEFAULTS]?: ReadonlySet<string>;
}

/**
 * The names of the default values the application set on a state type or one of its bases.
 */
export function explicitDefaultsOf(type: StateType & HasExplicitDefaults): ReadonlySet<string> {
    return type[EXPLICIT_DEFAULTS] ?? new Set();
}

/**
 * Record the names of the default values the application set on a state type, including those of its bases.
 */
export function recordExplicitDefaults(type: StateType, names: ReadonlySet<string>) {
    Object.defineProperty(type, EXPLICIT_DEFAULTS, { value: names });
}
