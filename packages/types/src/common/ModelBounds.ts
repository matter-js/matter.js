/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
} from "@matter/general";
import { Constraint, EncodedValue, FieldValue, ValueModel } from "@matter/model";

/**
 * Helpers for generation of TLV schema from models.
 *
 * We must export these so long as we codegen TLV directly in TlvGenerator.ts.
 */
export namespace ModelBounds {
    export function createLengthBounds(model: ValueModel) {
        const constraint = extractApplicableConstraint(model);

        // A length counts bytes or entries, which the size of a message bounds, so it is a number even where a value
        // of the same type would need more
        const value = EncodedValue(model, constraint.value);
        if (value !== undefined) {
            return { length: Number(value) };
        }

        const bounds = createRangeBounds(model, constraint);
        if (bounds === undefined) {
            return;
        }

        return {
            ...(bounds.min === undefined ? undefined : { minLength: Number(bounds.min) }),
            ...(bounds.max === undefined ? undefined : { maxLength: Number(bounds.max) }),
        };
    }

    export function createNumberBounds(model: ValueModel) {
        const constraint = model.effectiveConstraint;

        const value = EncodedValue(model, constraint.value);
        if (value !== undefined) {
            return { min: value, max: value };
        }

        return createRangeBounds(model, constraint, model.effectiveType);
    }

    /**
     * Bounds for numeric types.
     */
    export type NumericRanges = typeof NumericRanges;

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

function createRangeBounds(model: ValueModel, constraint: Constraint, type?: string) {
    let min = EncodedValue(model, constraint.min);
    let max = EncodedValue(model, constraint.max);

    const range = type === undefined ? undefined : ModelBounds.NumericRanges[type as keyof ModelBounds.NumericRanges];

    // A bound that states what the type already states constrains nothing
    if (range !== undefined && min !== undefined && min === range.min) {
        min = undefined;
    }
    if (range !== undefined && max !== undefined && max === range.max) {
        max = undefined;
    }

    if (min === undefined && max === undefined) {
        return;
    }

    return { min: stated(min), max: stated(max) };
}

/** A magnitude a number states exactly is a number, so only a bound that needs more carries a bigint */
function stated(bound: number | bigint | undefined) {
    if (typeof bound !== "bigint") {
        return bound;
    }

    const asNumber = Number(bound);
    return BigInt(asNumber) === bound ? asNumber : bound;
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
