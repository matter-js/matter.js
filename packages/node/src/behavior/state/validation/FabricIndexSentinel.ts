/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricIndex as FabricIndexElement, FieldModel, ValueModel } from "@matter/model";

const FIELD_ID = FabricIndexElement.id;
const FIELD_NAME = FabricIndexElement.name;

/**
 * True when `schema` is the spec-defined fabric-scoped struct FabricIndex sentinel field — same id/name match
 * `ObjectSchema.encodeEntryToTlv` uses to gate the wire-level strip.  Per spec the id+name combination is reserved
 * for this purpose; no other struct field can re-use it.
 * @see {@link MatterSpecification.v16.Core} § 7.13.6
 */
export function isFabricIndexSentinel(schema: ValueModel): boolean {
    return schema instanceof FieldModel && schema.id === FIELD_ID && schema.name === FIELD_NAME;
}
