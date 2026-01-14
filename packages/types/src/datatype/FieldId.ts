/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#general";
import { ValidationOutOfBoundsError, validatorOf } from "../common/ValidationError.js";
import { TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";
import { Mei } from "./ManufacturerExtensibleIdentifier.js";

/**
 * A "field ID" is an unsigned 32-bit integer that identifies a specific field
 * in a cluster struct type.
 *
 * @see {@link MatterSpecification.v11.Core} § 7.18.2.18
 */
export type FieldId = Branded<number, "FieldId">;

export function FieldId(fieldId: number, validate = true): FieldId {
    if (!validate) {
        return fieldId as FieldId;
    }
    if (fieldId >= 0xe0 && fieldId <= 0xfe) {
        // Global
        return fieldId as FieldId;
    }
    const { typeSuffix } = Mei.fromMei(fieldId);
    if (typeSuffix >= 0x00 && typeSuffix <= 0xdf) {
        return fieldId as FieldId;
    }
    throw new ValidationOutOfBoundsError(`Invalid field ID: ${fieldId}`);
}

export namespace FieldId {
    export const isGlobal = (fieldId: number): boolean => {
        return fieldId >= 0xe0 && fieldId <= 0xfe;
    };

    export const isValid = validatorOf(FieldId);
}

// TODO Adjust how to encode Field IDs
//  Field IDs SHALL be encoded as:
//    • A context tag when the MEI prefix encodes a standard/scoped source.
//    • A fully-qualified profile-specific tag when the MEI prefix encodes a manufacturer code. The Vendor ID SHALL be
//      set to the manufacturer code, the profile number set to 0 and the tag number set to the MEI suffix.
//  NOTE Support for encoding Field IDs with an MC source is provisional.
/** TLV schema for a field ID. */
export const TlvFieldId = new TlvWrapper<FieldId, number>(
    TlvUInt32,
    fieldId => fieldId,
    value => FieldId(value, false), // No automatic validation on decode
);
