/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schema, ValueModel } from "@matter/model";

/**
 * Runtime shape of a TypeScript numeric enum: name→number forward lookup, number→name reverse lookup.
 */
export type EnumLikeObject = { [k: string]: number } & { [k: number]: string };

const cache = new WeakMap<ValueModel, EnumLikeObject>();

/**
 * Create a frozen enum object with the runtime shape of a TypeScript numeric enum (forward and reverse mapping).
 *
 * Schema is associated via {@link Schema.set} so it can be resolved by `@field` decorators.
 *
 * Results are cached per model instance.
 */
export function EnumForValueModel(model: ValueModel): EnumLikeObject {
    let result = cache.get(model);
    if (result !== undefined) {
        return result;
    }

    const values: Record<string | number, string | number> = {};
    for (const child of model.children) {
        if (typeof child.id === "number") {
            values[child.name] = child.id;
            values[child.id] = child.name;
        }
    }

    result = Object.freeze(values) as EnumLikeObject;
    Schema.set(result, model);

    cache.set(model, result);

    return result;
}
