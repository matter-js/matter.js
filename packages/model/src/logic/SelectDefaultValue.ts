/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Metatype } from "../common/index.js";
import type { ValueModel } from "../models/ValueModel.js";
import { DecodedBitmap } from "./DecodedBitmap.js";
import { DefaultValue } from "./DefaultValue.js";
import type { Scope } from "./Scope.js";

/**
 * Select the default value a member should assume absent an explicit value, gated by operational support (mandatory
 * given active features, or explicitly implemented).
 */
export function SelectDefaultValue(scope: Scope, oldDefault: unknown, member: ValueModel): unknown {
    if (oldDefault !== undefined) {
        return oldDefault;
    }

    // No default unless mandatory or explicitly marked as implemented
    if (!scope.hasOperationalSupport(member)) {
        return;
    }

    // If there's an explicit default, use that
    const effectiveDefault = DefaultValue(scope, member);
    if (effectiveDefault !== undefined) {
        if (member.effectiveMetatype === Metatype.bitmap) {
            return DecodedBitmap(member, effectiveDefault);
        }
        return effectiveDefault;
    }

    // Default for nullable is null
    if (member.nullable) {
        return null;
    }

    switch (member.effectiveMetatype) {
        case Metatype.integer:
        case Metatype.float:
            return 0;

        case Metatype.boolean:
            return false;

        case Metatype.bitmap:
        case Metatype.object:
            // This is not a very good default but it is better than undefined
            return {};

        case Metatype.array:
            // Same
            return [];
    }
}
