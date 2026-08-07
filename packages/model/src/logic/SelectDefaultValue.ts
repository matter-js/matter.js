/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "../aspects/Conformance.js";
import { FieldValue, Metatype } from "../common/index.js";
import type { ValueModel } from "../models/ValueModel.js";
import { DecodedBitmap } from "./DecodedBitmap.js";
import { DefaultValue } from "./DefaultValue.js";
import type { Scope } from "./Scope.js";

/**
 * Select the default value a member should assume absent an explicit value, gated by operational support (mandatory
 * given active features, or explicitly implemented).
 *
 * Returns undefined for a supported member whose metatype has no datatype-level default (e.g. enum, string, bytes,
 * date, duration) - such a member reads undefined even where typings make it required.
 */
export function SelectDefaultValue(scope: Scope, member: ValueModel): unknown {
    // No default unless mandatory or explicitly marked as implemented
    if (!scope.hasOperationalSupport(member)) {
        return;
    }

    return defaultValueForMetatype(scope, member);
}

/**
 * Is {@link member} mandatory given the features {@link scope} has active?
 *
 * Evaluated purely from the schema's declared conformance against the scope's supported features. Deliberately
 * blind to runtime element-support data such as a peer's AttributeList: {@link Scope#hasOperationalSupport} folds
 * that in, this does not.
 */
export function IsMandatory(scope: Scope, member: ValueModel): boolean {
    member = scope.modelFor(member);
    return member.effectiveConformance.applicabilityFor(scope) === Conformance.Applicability.Mandatory;
}

/**
 * Recursively compute the default a mandatory member assumes absent an explicit value.
 *
 * Diverges from {@link SelectDefaultValue} for object/bitmap metatypes: it consults only a default the schema
 * states explicitly - {@link DefaultValue}'s constructed partial objects ignore conformance and bypass the
 * nullable rule - and builds struct defaults by recursing over conformant members instead of returning an empty
 * `{}`. A member with no synthesizable default is omitted, so the result may not satisfy the member's own
 * conformance. The return may be model-owned shared state (an explicit default), so callers copy it before
 * mutation or hand-out.
 */
export function MandatoryDefaultValue(scope: Scope, member: ValueModel, visiting?: Set<ValueModel>): unknown {
    if (!IsMandatory(scope, member)) {
        return undefined;
    }

    const metatype = member.effectiveMetatype;
    if (metatype !== Metatype.object && metatype !== Metatype.bitmap) {
        return defaultValueForMetatype(scope, member);
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
            // This is not a very good default but it is better than undefined
            return {};

        case Metatype.array:
            // Same
            return [];
    }
}
