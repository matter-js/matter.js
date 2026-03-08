/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import type { FieldModel } from "#models/FieldModel.js";
import { ValueModel } from "#models/ValueModel.js";
import { FeatureMap } from "#standard/elements/feature-map.element.js";
import { camelize } from "@matter/general";
import { DecodedBitmap } from "./DecodedBitmap.js";

export function EncodedBitmap(model: ValueModel, value: number | bigint | DecodedBitmap): number | bigint {
    if (typeof value !== "object") {
        return value;
    }

    let nameGenerator;
    if (model.tag === ElementTag.Attribute && model.id === FeatureMap.id) {
        // Special case for feature map; use the long name as the key rather than the name
        nameGenerator = (model: ValueModel) =>
            (model as FieldModel).title === undefined ? camelize(model.name) : camelize((model as FieldModel).title!);
    } else {
        nameGenerator = (model: ValueModel) => camelize(model.name);
    }

    let bitmap = 0n;

    for (const field of model.children) {
        // Support both single-value constraints (bit flag, e.g. constraint: "0") and range constraints
        // (multi-bit field, e.g. constraint: "2 to 3").  DecodedBitmap mirrors this split.
        const constraintValue = field.constraint.value;
        let min: number;
        let max: number;
        if (typeof constraintValue === "number") {
            min = constraintValue;
            max = constraintValue;
        } else {
            const cm = field.constraint.min;
            const cx = field.constraint.max;
            if (typeof cm !== "number" || typeof cx !== "number") {
                continue;
            }
            min = cm;
            max = cx;
        }

        const name = nameGenerator(field);
        const bitval = value[name];
        if (!bitval) {
            continue;
        }

        if (bitval === true) {
            bitmap |= 1n << BigInt(min);
        } else if (typeof bitval === "number") {
            bitmap |= BigInt(bitval & (2 ** (max - min) - 1)) << BigInt(min);
        } else {
            bitmap |= bitval & ((2n ** BigInt(max - min) - 1n) << BigInt(min));
        }
    }

    if (bitmap < Number.MAX_SAFE_INTEGER) {
        return Number(bitmap);
    }

    return bitmap;
}
