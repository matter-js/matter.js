/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneratedClass, ImplementationError } from "@matter/general";
import { DecodedBitmap, DefaultValue, EncodedBitmap, Metatype, Schema, Scope, ValueModel } from "@matter/model";

type ValueClass = new (values?: Record<string, unknown> | number | bigint) => Record<string, unknown>;

const cache = new WeakMap<ValueModel, ValueClass>();

const completeBitmap: DecodedBitmap.Options = { conformance: "conformant", complete: true };

/**
 * Create a runtime class for a struct or bitmap value model.
 *
 * The returned class is constructible with `new Klass(values?)` where `values` is a partial object of named fields.
 * A bitmap class also accepts the bitmap's numeric value.  A bitmap instance built from its default or a numeric value
 * names every conformant member, `false` or 0 where clear.
 * Schema is associated via {@link Schema.set} so it can be resolved by `@field` decorators.
 *
 * Results are cached per model instance.
 */
export function ClassForValueModel(model: ValueModel): ValueClass {
    let klass = cache.get(model);
    if (klass !== undefined) {
        return klass;
    }

    const metatype = model.effectiveMetatype;

    if (metatype !== Metatype.object && metatype !== Metatype.bitmap) {
        throw new ImplementationError(
            `ClassForValueModel only supports struct and bitmap metatypes, but ${model.path} is ${metatype}`,
        );
    }

    const scope = Scope(model);
    let defaults = DefaultValue(scope, model);
    if (metatype === Metatype.bitmap && defaults !== undefined) {
        // A bitmap's default is a whole value, so every member takes its part of it
        defaults = DecodedBitmap(model, EncodedBitmap(model, defaults, scope), scope, completeBitmap);
    }

    klass = GeneratedClass({
        name: model.name,

        initialize(values?: Record<string, unknown> | number | bigint) {
            const instance = this as Record<string, unknown>;

            if (defaults) {
                Object.assign(instance, defaults);
            }

            if (typeof values === "number" || typeof values === "bigint") {
                if (metatype === Metatype.bitmap) {
                    Object.assign(instance, DecodedBitmap(model, values, scope, completeBitmap));
                }
            } else if (typeof values === "object") {
                Object.assign(instance, values);
            }
        },
    }) as ValueClass;

    Schema.set(klass, model);
    Object.freeze(klass);

    cache.set(model, klass);

    return klass;
}
