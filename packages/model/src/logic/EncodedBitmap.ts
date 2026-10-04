/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ValueModel } from "#models/ValueModel.js";
import { BitmapMembers } from "./BitmapMembers.js";
import type { DecodedBitmap } from "./DecodedBitmap.js";
import type { Scope } from "./Scope.js";

/**
 * Encode a bitmap object into its value, as a bigint where a number cannot hold it exactly.
 *
 * Pass the {@link scope} of the cluster the bitmap belongs to where its datatype may come from a base cluster.
 */
export function EncodedBitmap(
    model: ValueModel,
    value: number | bigint | DecodedBitmap,
    scope?: Scope,
): number | bigint {
    if (typeof value !== "object") {
        return value;
    }

    let bitmap = 0n;

    for (const member of BitmapMembers.of(model, scope)) {
        const memberValue = value[BitmapMembers.keyOf(model, member)];
        if (!memberValue) {
            continue;
        }

        const range = BitmapMembers.rangeOf(member, typeof memberValue === "boolean" ? undefined : memberValue);
        if (range === undefined) {
            continue;
        }

        bitmap |= BitmapMembers.place(range, memberValue);
    }

    return BitmapMembers.toNumeric(bitmap);
}
