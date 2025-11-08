/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { camelize } from "#general";
import type { FieldModel } from "#models/FieldModel.js";
import { ValueModel } from "#models/ValueModel.js";
import { FeatureMap } from "#standard/elements/feature-map.element.js";
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
        const min = field.constraint.min;
        const max = field.constraint.max;
        if (typeof min !== "number" || typeof max !== "number") {
            continue;
        }

        const name = nameGenerator(field);
        const bitval = value[name];
        if (!bitval) {
            continue;
        }

        if (bitval === true) {
            bitmap &= 1n << BigInt(min);
        } else if (typeof bitval === "number") {
            bitmap &= BigInt(bitval & (2 ** (max - min) - 1)) << BigInt(min);
        } else {
            bitmap &= bitval & ((2n ** BigInt(max - min - 1)) << BigInt(min));
        }
    }

    if (bitmap < Number.MAX_SAFE_INTEGER) {
        return Number(bitmap);
    }

    return bitmap;
}
