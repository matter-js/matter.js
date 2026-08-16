/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "../common/FieldValue.js";
import type { ValueModel } from "../models/ValueModel.js";

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
    const encoded = FieldValue.numericValue(value, model.effectiveType);

    // Scaling a fraction to its encoding units is a binary multiplication, so it lands next to the integer the units
    // count rather than on it; 0.07% of a percent100ths is 7.000000000000001
    if (typeof encoded === "number" && Number.isFinite(encoded) && !Number.isInteger(encoded)) {
        const rounded = Math.round(encoded);
        if (Math.abs(encoded - rounded) < Math.max(1, Math.abs(rounded)) * Number.EPSILON * 8) {
            return rounded;
        }
    }

    return encoded;
}
