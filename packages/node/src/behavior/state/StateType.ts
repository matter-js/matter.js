/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneratedClass } from "@matter/general";
import { Val } from "@matter/protocol";
import { explicitDefaultsOf, recordExplicitDefaults } from "../internal/ExplicitDefaults.js";

/**
 * State is a plain JS object.
 *
 * Any constructor invokable with no arguments may define a state structure.
 */
export interface StateType {
    new (): {};
}

/**
 * This is used as state in base classes.
 */
export const EmptyState = function () {
    return {};
} as unknown as new () => {};

/**
 * DerivedState is a programmatic extension of state.
 */
export interface DerivedState<Base extends StateType = StateType, Extension extends {} = {}> {
    new (): InstanceType<Base> & Extension;
}

/**
 * Extend state with additional values.
 *
 * A value identical to the base's default is not recorded.  If no value differs, the result is `base` itself, or
 * {@link EmptyState} without a base.  With `explicit` the `values` are recorded as set by the application, also where
 * a value equals the base's default; a value the base has not recorded yet results in a new type.
 */
export function DerivedState<const Base extends StateType, const Extension extends Val.Struct>({
    base,
    values,
    name,
    explicit,
}: DerivedState.Options<Base, Extension>) {
    if (base === EmptyState) {
        base = undefined;
    }
    const oldDefaults = (base ? new base() : {}) as Val.Struct;

    let newDefaults: undefined | Val.Struct;
    for (const key in values) {
        const value = (values as Val.Struct)[key];
        if (!Object.prototype.hasOwnProperty.call(oldDefaults, key) || oldDefaults[key] !== value) {
            if (!newDefaults) {
                newDefaults = {};
            }
            newDefaults[key] = value;
        }
    }

    let explicitDefaults: undefined | Val.Struct;
    if (explicit) {
        const baseExplicitDefaults = base ? explicitDefaultsOf(base) : {};
        for (const key in values) {
            const value = (values as Val.Struct)[key];
            if (
                !Object.prototype.hasOwnProperty.call(baseExplicitDefaults, key) ||
                baseExplicitDefaults[key] !== value
            ) {
                explicitDefaults ??= { ...baseExplicitDefaults };
                explicitDefaults[key] = value;
            }
        }
    }

    if (!newDefaults && !explicitDefaults) {
        return (base ?? EmptyState) as DerivedState<Base, Extension>;
    }

    const type = GeneratedClass({
        name: name ?? base?.name ?? "State",
        base: base,
        instanceProperties: newDefaults ?? {},
    }) as DerivedState<Base, Extension>;

    if (explicitDefaults) {
        recordExplicitDefaults(type, explicitDefaults);
    }

    return type;
}

export namespace DerivedState {
    export interface Options<Base extends StateType, Values extends Val.Struct> {
        values: Values;
        base?: Base;
        name?: string;

        /**
         * Record `values` as set by the application, so a derived cluster behavior keeps them.
         *
         * @internal
         */
        explicit?: boolean;
    }
}
