/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneratedClass } from "#general";
import { Val } from "#protocol";

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
 */
export function DerivedState<const Base extends StateType, const Extension extends Val.Struct>({
    base,
    values,
    name,
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

    if (!newDefaults) {
        return (base ?? EmptyState) as DerivedState<Base, Extension>;
    }

    return GeneratedClass({
        name: name ?? base?.name ?? "State",
        base: base,
        instanceProperties: newDefaults,
    }) as DerivedState<Base, Extension>;
}

export namespace DerivedState {
    export interface Options<Base extends StateType, Values extends Val.Struct> {
        values: Values;
        base?: Base;
        name?: string;
    }
}
