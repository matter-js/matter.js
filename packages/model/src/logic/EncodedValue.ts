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
    return FieldValue.numericValue(value, model.effectiveType);
}
