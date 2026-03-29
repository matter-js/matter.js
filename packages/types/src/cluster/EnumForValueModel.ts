/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schema, ValueModel } from "@matter/model";

const cache = new WeakMap<ValueModel, Record<string, number>>();

/**
 * Create a frozen enum object for an enum value model.
 *
 * The returned object maps enum member names to their numeric IDs.  Schema is associated via {@link Schema.set} so it
 * can be resolved by `@field` decorators.
 *
 * Results are cached per model instance.
 */
export function EnumForValueModel(model: ValueModel): Record<string, number> {
    let result = cache.get(model);
    if (result !== undefined) {
        return result;
    }

    const values: Record<string, number> = {};
    for (const child of model.children) {
        if (typeof child.id === "number") {
            values[child.name] = child.id;
        }
    }

    result = Object.freeze(values);
    Schema.set(result, model);

    cache.set(model, result);

    return result;
}
