/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    camelize,
    FLOAT32_MAX,
    FLOAT32_MIN,
    INT16_MAX,
    INT16_MIN,
    INT32_MAX,
    INT32_MIN,
    INT64_MAX,
    INT64_MIN,
    INT8_MAX,
    INT8_MIN,
    UINT16_MAX,
    UINT24_MAX,
    UINT32_MAX,
    UINT64_MAX,
    UINT8_MAX,
} from "#general";
import { Constraint, FieldValue, ValueModel } from "#model";

/**
 * Helpers for generation of TLV schema from models.
 *
 * We must export these so long as we codegen TLV directly in TlvGenerator.ts.
 */
export namespace ModelBounds {
    export function createLengthBounds(model: ValueModel) {
        const constraint = extractApplicableConstraint(model);

        const value = FieldValue.numericValue(constraint.value, model.type);
        if (value !== undefined) {
            return { length: value };
        }

        return createRangeBounds(constraint, "minLength", "maxLength");
    }

    export function createNumberBounds(model: ValueModel) {
        const constraint = model.effectiveConstraint;

        const value = FieldValue.numericValue(constraint.value, model.type);
        if (value !== undefined) {
            return { min: value, max: value };
        }

        return createRangeBounds(constraint, "min", "max", model.type);
    }

    /**
     * Bounds for numeric types.
     */
    export const NumericRanges = {
        uint8: { min: 0, max: UINT8_MAX },
        uint16: { min: 0, max: UINT16_MAX },
        uint24: { min: 0, max: UINT24_MAX },
        uint32: { min: 0, max: UINT32_MAX },
        uint64: { min: 0, max: UINT64_MAX },
        int8: { min: INT8_MIN, max: INT8_MAX },
        int16: { min: INT16_MIN, max: INT16_MAX },
        int32: { min: INT32_MIN, max: INT32_MAX },
        int64: { min: INT64_MIN, max: INT64_MAX },
        float32: { min: FLOAT32_MIN, max: FLOAT32_MAX },
        percent: { min: 0, max: 100 },
        percent100ths: { min: 0, max: 10000 },
    };
}

function createRangeBounds(constraint: Constraint, minKey: string, maxKey: string, type?: string) {
    let min = FieldValue.numericValue(constraint.min, type);
    let max = FieldValue.numericValue(constraint.max, type);

    if (min === (ModelBounds.NumericRanges as any)[type as any]?.min) {
        min = undefined;
    }

    if (max === (ModelBounds.NumericRanges as any)[type as any]?.max) {
        max = undefined;
    }

    if (min === undefined && max === undefined) {
        return;
    }

    const bounds = {} as { [key: string]: number };
    if (min !== undefined) {
        bounds[minKey] = min;
    }
    if (max !== undefined) {
        bounds[maxKey] = max;
    }

    return bounds;
}

export function extractApplicableConstraint(model: ValueModel) {
    let constraint = model.effectiveConstraint;

    // Our TLV parser has no way of representing "in" constraints.  But if the referenced array has a member
    // constraint then we can at least enforce to that level with the TLV parser
    if (constraint.in) {
        const siblingName = FieldValue.referenced(constraint.in);
        if (siblingName) {
            const sibling = model.parent?.member(camelize(siblingName, true)) as ValueModel;
            const siblingConstraint = sibling.effectiveConstraint;
            if (siblingConstraint.entry) {
                constraint = siblingConstraint.entry;
            }
        }
    }

    return constraint;
}
