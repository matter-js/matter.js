/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { FieldValue } from "#common/FieldValue.js";
import type { ValueModel } from "#models/ValueModel.js";
import { FeatureMap } from "#standard/elements/feature-map.element.js";
import { camelize } from "@matter/general";
import { Scope } from "./Scope.js";

/**
 * Where a bitmap's members sit in its value, shared by the bitmap encoder, decoder and default builder.
 *
 * All arithmetic is bigint because number bitwise operators truncate to 32 bits and a bitmap may be 64 bits wide.
 */
export namespace BitmapMembers {
    /**
     * The bits a member occupies, `min` through `max` inclusive, as the TLV schema builds them.
     */
    export interface Range {
        min: number;
        max: number;

        /**
         * A single-bit member declared as a bit ("3") rather than a range; its value is a boolean.
         */
        isFlag: boolean;
    }

    export function of(model: ValueModel, scope?: Scope, options?: Scope.MemberOptions) {
        return (scope ?? Scope(model)).membersOf(model, options);
    }

    /**
     * The bits of {@link member}.  A member with a lower bound only extends as far as {@link value} needs.
     */
    export function rangeOf(member: ValueModel, value?: number | bigint): Range | undefined {
        const constraint = member.effectiveConstraint;

        const bit = FieldValue.countValue(constraint.value);
        if (bit !== undefined) {
            return { min: bit, max: bit, isFlag: true };
        }

        const min = FieldValue.countValue(constraint.min) ?? 0;
        let max = FieldValue.countValue(constraint.max);
        if (max === undefined) {
            if (value === undefined) {
                return;
            }
            max = min + bitLengthOf(BigInt(value)) - 1;
        }
        if (max < min) {
            return;
        }

        return { min, max, isFlag: false };
    }

    /**
     * The bits of {@link member} within {@link bitmap}.  A member with a lower bound only extends to the bitmap's
     * highest set bit.
     */
    export function rangeIn(member: ValueModel, bitmap: bigint): Range | undefined {
        const min = FieldValue.countValue(member.effectiveConstraint.min) ?? 0;
        return rangeOf(member) ?? rangeOf(member, bitmap >> BigInt(min));
    }

    export function maskOf({ min, max }: Range) {
        return ((1n << BigInt(max - min + 1)) - 1n) << BigInt(min);
    }

    /**
     * The member's value placed at its bits, masked to its width.
     */
    export function place(range: Range, value: boolean | number | bigint) {
        return (BigInt(value) << BigInt(range.min)) & maskOf(range);
    }

    /**
     * The member's value read from {@link bitmap}.
     */
    export function read(bitmap: bigint, range: Range) {
        return (bitmap & maskOf(range)) >> BigInt(range.min);
    }

    /**
     * The property name of {@link member} in a decoded bitmap.  A FeatureMap keys its features by their title.
     */
    export function keyOf(bitmap: ValueModel, member: ValueModel & { title?: string }) {
        if (bitmap.tag === ElementTag.Attribute && bitmap.id === FeatureMap.id && member.title !== undefined) {
            return camelize(member.title);
        }
        return member.propertyName;
    }

    /**
     * {@link value} as a number where a number holds it exactly.
     */
    export function toNumeric(value: bigint): number | bigint {
        return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
    }
}

function bitLengthOf(value: bigint) {
    return value > 0n ? value.toString(2).length : 0;
}
