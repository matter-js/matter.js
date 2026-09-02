/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue, Metatype } from "../common/index.js";
import type { ValueModel } from "../models/ValueModel.js";
import { DecodedBitmap } from "./DecodedBitmap.js";
import { DefaultValue } from "./DefaultValue.js";
import type { Scope } from "./Scope.js";

/**
 * Select the default value a member should assume absent an explicit value, gated by operational support (mandatory
 * given active features, or explicitly implemented).
 *
 * Returns undefined for a supported member whose metatype has no datatype-level default (e.g. enum, string, bytes)
 * - such a member reads undefined even where typings make it required.
 */
export function SelectDefaultValue(scope: Scope, member: ValueModel): unknown {
    // No default unless mandatory or explicitly marked as implemented
    if (!scope.hasOperationalSupport(member)) {
        return;
    }

    return defaultValueForMetatype(scope, member);
}

/**
 * Select the value storage holds for a member absent an explicit value.
 *
 * Diverges from {@link SelectDefaultValue} by omitting the datatype-level fallbacks: a mandatory member the writer
 * left out must fail validation naming the member, not read as a silent zero.  What storage omits a read still
 * supplies, because {@link MandatoryDefaultValue} synthesizes the specification's fallback for a mandatory member
 * that holds no value.
 *
 * The return may be model-owned shared state (an explicit default), so callers copy it before mutation or hand-out.
 */
export function StoredDefaultValue(scope: Scope, member: ValueModel): unknown {
    if (!scope.hasOperationalSupport(member)) {
        return undefined;
    }

    if (member.default !== undefined) {
        const value = DefaultValue(scope, member);
        if (value !== undefined) {
            return value;
        }
    }

    // An optional member the implementation opted into keeps the default it states, but we invent no null for it:
    // absence is how an implementation says it holds no value
    if (member.nullable && scope.isMandatory(member)) {
        return null;
    }

    return undefined;
}

/**
 * Recursively compute the default a mandatory member assumes absent an explicit value, following the Data Model
 * specification's "Fallback Column" rules (null when nullable, 0/false for analog and boolean, empty for strings
 * and lists, structs composited recursively; an enumeration's fallback is manufacturer-specific and stays
 * undefined).
 *
 * Diverges from {@link SelectDefaultValue} for object/bitmap metatypes: it consults only a default the schema
 * states explicitly - {@link DefaultValue}'s constructed partial objects ignore conformance and bypass the
 * nullable rule - and builds struct defaults by recursing over conformant members instead of returning an empty
 * `{}`. The return may be model-owned shared state (an explicit default), so callers copy it before mutation or
 * hand-out.
 */
export function MandatoryDefaultValue(scope: Scope, member: ValueModel, visiting?: Set<ValueModel>): unknown {
    if (!scope.isMandatory(member)) {
        return undefined;
    }

    const metatype = member.effectiveMetatype;
    if (metatype !== Metatype.object && metatype !== Metatype.bitmap) {
        const value = defaultValueForMetatype(scope, member);
        if (value !== undefined) {
            return value;
        }

        // Fallback values per the Data Model specification's "Fallback Column" rules; an enumeration's fallback is
        // manufacturer-specific, so it deliberately stays undefined.  Time types derive from analog types and get
        // their zero above
        switch (metatype) {
            case Metatype.string:
                return "";

            case Metatype.bytes:
                return new Uint8Array();
        }
        return undefined;
    }

    // A reference is resolved live by the consumer, not here; without this guard an unresolvable reference would
    // fall through to DefaultValue's constructed partial object
    if (member.default !== undefined && FieldValue.referenced(member.default) === undefined) {
        const explicit = DefaultValue(scope, member);
        if (explicit !== undefined) {
            return metatype === Metatype.bitmap ? DecodedBitmap(member, explicit) : explicit;
        }
    }

    if (member.nullable) {
        return null;
    }

    if (metatype === Metatype.bitmap) {
        return {};
    }

    // A consumer-defined schema may be self-referential
    visiting ??= new Set();
    if (visiting.has(member)) {
        return undefined;
    }
    visiting.add(member);

    const result: Record<string, unknown> = {};
    for (const child of scope.membersOf(member, { conformance: "conformant" })) {
        const value = MandatoryDefaultValue(scope, child, visiting);
        if (value !== undefined) {
            result[child.propertyName] = value;
        }
    }

    visiting.delete(member);
    return result;
}

/**
 * Compute the default value for a member's metatype, assuming the caller has already determined it is supported.
 */
function defaultValueForMetatype(scope: Scope, member: ValueModel): unknown {
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
            // Only reachable via SelectDefaultValue, where a shallow placeholder suffices because the behavior
            // supplies real state; MandatoryDefaultValue builds structs from their members' own defaults instead
            return {};

        case Metatype.array:
            return [];
    }
}
