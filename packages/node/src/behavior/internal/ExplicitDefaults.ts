/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDeepEqual } from "@matter/general";
import type { Val } from "@matter/protocol";
import type { StateType } from "../state/StateType.js";

const EXPLICIT_DEFAULTS = Symbol("explicitDefaults");

const NO_EXPLICIT_DEFAULTS: Readonly<Val.Struct> = Object.freeze({});

interface HasExplicitDefaults {
    [EXPLICIT_DEFAULTS]?: Readonly<Val.Struct>;
}

/**
 * The default values the application set on a state type or one of its bases, by property name.
 *
 * A derivation may replace such a value later, so the current default of a property counts as set by the application
 * only while it still equals the value recorded here.
 */
export function explicitDefaultsOf(type: StateType & HasExplicitDefaults): Readonly<Val.Struct> {
    return type[EXPLICIT_DEFAULTS] ?? NO_EXPLICIT_DEFAULTS;
}

/**
 * Whether `value` is the default the application set for property `name` on a state type or one of its bases.
 */
export function hasExplicitDefault(type: StateType, name: string, value: unknown) {
    const explicitDefaults = explicitDefaultsOf(type);
    return Object.prototype.hasOwnProperty.call(explicitDefaults, name) && isDeepEqual(explicitDefaults[name], value);
}

/**
 * Record the default values the application set on a state type, including those of its bases.
 */
export function recordExplicitDefaults(type: StateType, values: Readonly<Val.Struct>) {
    Object.defineProperty(type, EXPLICIT_DEFAULTS, { value: values });
}
