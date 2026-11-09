/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "@matter/general";
import { FabricIndex as FabricIndexElement, FieldModel, ValueModel } from "@matter/model";
import type { Val } from "@matter/protocol";
import type { FabricIndex } from "@matter/types";
import { memberSlotOf, memberValueOf } from "../managed/MemberKeys.js";

const FIELD_ID = FabricIndexElement.id;
const FIELD_NAME = FabricIndexElement.name;
const FIELD_PROPERTY = camelize(FIELD_NAME);

/**
 * True when `schema` is the spec-defined FabricIndex field of a fabric-scoped struct — same id/name match
 * `ObjectSchema.encodeEntryToTlv` uses to gate the wire-level strip.  Per spec the id+name combination is reserved
 * for this purpose; no other struct field can re-use it.
 * @see {@link MatterSpecification.v161.Core} § 7.13.6
 */
export function isFabricIndexField(schema: ValueModel): boolean {
    return schema instanceof FieldModel && schema.id === FIELD_ID && schema.name === FIELD_NAME;
}

/**
 * The slot under which a name-keyed fabric-scoped struct holds its FabricIndex: the property name, else the TLV tag
 * number, as struct validation reads a field.  Undefined if the struct holds none.
 */
export function fabricIndexSlotOf(struct: Val.Struct) {
    return memberSlotOf(struct, FIELD_PROPERTY, FIELD_ID);
}

/**
 * The FabricIndex a name-keyed fabric-scoped struct holds; see {@link fabricIndexSlotOf}.
 */
export function fabricIndexOf(struct: Val.Struct): Val {
    return memberValueOf(struct, FIELD_PROPERTY, FIELD_ID);
}

/**
 * {@link struct} with {@link fabricIndex} as its FabricIndex, under the slot it already uses for it, else under the
 * property name.  Returns {@link struct} itself if it already holds that index.
 */
export function withFabricIndex(struct: Val.Struct, fabricIndex: FabricIndex): Val.Struct {
    if (fabricIndexOf(struct) === fabricIndex) {
        return struct;
    }
    return { ...struct, [fabricIndexSlotOf(struct) ?? FIELD_PROPERTY]: fabricIndex };
}
