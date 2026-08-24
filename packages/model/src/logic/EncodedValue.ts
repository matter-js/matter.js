/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "../common/FieldValue.js";
import { ElementTag, Metatype } from "../common/index.js";
import type { ValueModel } from "../models/ValueModel.js";
import { ModelTraversal } from "./ModelTraversal.js";

/**
 * The numeric form of a value in the units of the model that carries it.
 *
 * The specification states a temperature or a percentage with its unit, such as the "25.5°C" default of an
 * `UnsignedTemperature` or the "100.00%" bound of a `percent100ths`.  Values are encoded in the units of their type,
 * so anything comparing against such a value must convert it first, and everything must convert it the same way.
 *
 * Returns undefined for a value that has no numeric form, such as a reference to another field.
 */
export function EncodedValue(model: ValueModel, value: FieldValue.Open | undefined) {
    const encoded = scaled(model, value);

    // Scaling a fraction to its encoding units is a binary multiplication, so it lands next to the integer the units
    // count rather than on it; 0.07% of a percent100ths is 7.000000000000001.  Only an integer encoding counts units:
    // on a floating point type the fraction is the value, and rounding it away would be a different value
    if (
        model.effectiveMetatype === Metatype.integer &&
        typeof encoded === "number" &&
        Number.isFinite(encoded) &&
        !Number.isInteger(encoded)
    ) {
        const rounded = Math.round(encoded);
        if (Math.abs(encoded - rounded) < Math.max(1, Math.abs(rounded)) * Number.EPSILON * 8) {
            return rounded;
        }
    }

    return encoded;
}

/**
 * The scale of a unit comes from the name of the type stating it, and the same type states the same scale under more
 * than one name: a datatype of another cluster is referenced by a qualified name, and case varies.  So where the name
 * the value states does not answer, the definitions it derives from do.
 */
function scaled(model: ValueModel, value: FieldValue.Open | undefined) {
    let numeric = FieldValue.numericValue(value, model.effectiveType);
    if (numeric !== undefined) {
        return numeric;
    }

    new ModelTraversal().visitInheritance(model, definition => {
        // A datatype is itself a type, so its name states a scale; the name of a value that happens to carry the type
        // does not
        if (definition.tag !== ElementTag.Datatype) {
            return;
        }

        numeric = FieldValue.numericValue(value, definition.name);
        return numeric === undefined;
    });

    return numeric;
}
