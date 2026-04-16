/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneratedClass } from "@matter/general";
import { DefaultValue, Metatype, Schema, Scope, ValueModel } from "@matter/model";

type ValueClass = new (values?: Record<string, unknown>) => Record<string, unknown>;

const cache = new WeakMap<ValueModel, ValueClass>();

/**
 * Create a runtime class for a struct or bitmap value model.
 *
 * The returned class is constructible with `new Klass(values?)` where `values` is a partial object of named fields.
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
        throw new Error(`ClassForValueModel only supports struct and bitmap metatypes, got ${metatype}`);
    }

    const scope = Scope(model);
    const defaults = DefaultValue(scope, model) as Record<string, unknown> | undefined;

    klass = GeneratedClass({
        name: model.name,

        initialize(values?: Record<string, unknown> | number) {
            // Apply defaults
            if (defaults) {
                for (const key in defaults) {
                    (this as Record<string, unknown>)[key] = defaults[key];
                }
            }

            // Overlay caller-provided values
            if (values !== undefined) {
                if (typeof values === "number" && metatype === Metatype.bitmap) {
                    // Numeric bitmap constructor — decompose into named bit fields
                    const members = scope.membersOf(model, { conformance: "conformant" });
                    for (const member of members) {
                        const constraint = member.effectiveConstraint;
                        if (typeof constraint.value === "number") {
                            // Single bit flag
                            (this as Record<string, unknown>)[member.propertyName] = !!(
                                values &
                                (1 << constraint.value)
                            );
                        } else if (typeof constraint.min === "number" && typeof constraint.max === "number") {
                            // Bit range
                            const width = constraint.max - constraint.min;
                            const mask = (1 << width) - 1;
                            (this as Record<string, unknown>)[member.propertyName] = (values >> constraint.min) & mask;
                        }
                    }
                } else if (typeof values === "object") {
                    for (const key in values) {
                        (this as Record<string, unknown>)[key] = values[key];
                    }
                }
            }
        },
    }) as ValueClass;

    Schema.set(klass, model);
    Object.freeze(klass);

    cache.set(model, klass);

    return klass;
}
