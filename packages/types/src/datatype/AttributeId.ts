/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, hex } from "@matter/general";
import { ValidationOutOfBoundsError, validatorOf } from "../common/ValidationError.js";
import { TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";
import { Mei } from "./ManufacturerExtensibleIdentifier.js";

/**
 * An Attribute ID is a 32 bit number and indicates an attribute defined in a cluster specification.
 *
 * @see {@link MatterSpecification.v161.Core} § 7.19.2.31
 */
export type AttributeId = Branded<number, "AttributeId">;

export function AttributeId(attributeId: number, validate = true): AttributeId {
    if (!validate) {
        return attributeId as AttributeId;
    }
    if (attributeId >= 0xf000 && attributeId <= 0xfffe) {
        return attributeId as AttributeId;
    }
    const { typeSuffix } = Mei.fromMei(attributeId);
    if (typeSuffix >= 0x0000 && typeSuffix <= 0x4fff) {
        return attributeId as AttributeId;
    }
    throw new ValidationOutOfBoundsError(
        `Invalid attribute ID 0x${hex.fixed(attributeId, 8)}: the suffix must be 0x0000 - 0x4fff, or the ID must be a global attribute ID 0xf000 - 0xfffe`,
    );
}

export namespace AttributeId {
    export const isGlobal = (attributeId: AttributeId | number): boolean => {
        return attributeId >= 0xf000 && attributeId <= 0xfffe;
    };

    export const isValid = validatorOf(AttributeId);
}

/** Tlv schema for an Attribute Id. */
export const TlvAttributeId = new TlvWrapper<AttributeId, number>(
    TlvUInt32,
    attributeId => attributeId,
    value => AttributeId(value, false), // No automatic validation on decode
);
