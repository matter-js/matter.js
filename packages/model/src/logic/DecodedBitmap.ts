/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ValueModel } from "#models/ValueModel.js";
import { BitmapMembers } from "./BitmapMembers.js";
import type { Scope } from "./Scope.js";

/**
 * A bitmap as an object: `true` for a set flag, the value of a multi-bit member, as a bigint where a number cannot
 * hold it exactly.
 */
export type DecodedBitmap = Record<string, boolean | number | bigint>;

/**
 * Decode a bitmap value into an object.
 *
 * Pass the {@link scope} of the cluster the bitmap belongs to where its datatype may come from a base cluster.
 */
export function DecodedBitmap(
    model: ValueModel,
    value: number | bigint | DecodedBitmap,
    scope?: Scope,
    options?: DecodedBitmap.Options,
): DecodedBitmap {
    if (typeof value === "object") {
        return value;
    }

    const bitmap = BigInt(value);
    const decoded: DecodedBitmap = {};
    if (bitmap === 0n && !options?.complete) {
        return decoded;
    }

    for (const member of BitmapMembers.of(model, scope, options)) {
        const range = BitmapMembers.rangeIn(member, bitmap);
        if (range === undefined) {
            continue;
        }

        const memberValue = BitmapMembers.read(bitmap, range);
        if (memberValue === 0n && !options?.complete) {
            continue;
        }

        decoded[BitmapMembers.keyOf(model, member)] = range.isFlag
            ? memberValue !== 0n
            : BitmapMembers.toNumeric(memberValue);
    }

    return decoded;
}

export namespace DecodedBitmap {
    export interface Options extends Scope.MemberOptions {
        /**
         * Include clear members, as `false` or 0, so the object names every member.
         */
        complete?: boolean;
    }
}
