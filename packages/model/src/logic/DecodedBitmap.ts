/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import type { FieldModel } from "#models/FieldModel.js";
import type { ValueModel } from "#models/ValueModel.js";
import { FeatureMap } from "#standard/elements/feature-map.element.js";
import { camelize } from "@matter/general";

export type DecodedBitmap = Record<string, boolean | number>;

/**
 * Decode a bitmap value into an object.
 */
export function DecodedBitmap(model: ValueModel, value: number | bigint | DecodedBitmap): DecodedBitmap {
    if (typeof value === "object") {
        return value;
    }

    const fields = new Map<ValueModel, number | boolean>();

    // Value is 0, so no bit set
    if (value === 0) {
        return {};
    }

    // Test each bit.  If set, install appropriate value into object
    for (let bit = 0; Math.pow(2, bit) <= value; bit++) {
        if (typeof value === "bigint") {
            if (!(value & (1n << BigInt(bit)))) {
                continue;
            }
        } else if (!(value & (1 << bit))) {
            continue;
        }

        const definition = model.bitDefinition(bit);
        if (!definition) {
            continue;
        }

        const constraint = definition.effectiveConstraint;
        if (constraint.value !== undefined) {
            // Bit flag
            fields.set(definition, true);
        } else if (constraint.min !== undefined) {
            // Bit range
            const fieldBit = 1 << (bit - (constraint.min as number));
            fields.set(definition, ((fields.get(definition) as number) ?? 0) | fieldBit);
        }
    }

    let nameGenerator;
    if (model.tag === ElementTag.Attribute && model.id === FeatureMap.id) {
        // Special case for feature map; use the long name as the key rather than the name
        nameGenerator = (model: ValueModel) =>
            (model as FieldModel).title === undefined ? camelize(model.name) : camelize((model as FieldModel).title!);
    } else {
        nameGenerator = (model: ValueModel) => camelize(model.name);
    }

    return Object.fromEntries([...fields.entries()].map(([k, v]) => [nameGenerator(k), v]));
}
