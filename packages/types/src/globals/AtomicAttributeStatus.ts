/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvAttributeId } from "../datatype/AttributeId.js";
import { Status } from "./Status.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

/**
 * This struct indicates the status of an attribute during an atomic write.
 *
 * @see {@link MatterSpecification.v142.Core} § 7.15.5
 */
export const TlvAtomicAttributeStatus = TlvObject({
    /**
     * This field shall indicate the ID of the attribute with the associated StatusCode.
     *
     * @see {@link MatterSpecification.v142.Core} § 7.15.5.1
     */
    attributeId: TlvField(0, TlvAttributeId),

    /**
     * This field shall indicate the atomic status of an attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 7.15.5.2
     */
    statusCode: TlvField(1, TlvEnum<Status>())
});

/**
 * This struct indicates the status of an attribute during an atomic write.
 *
 * @see {@link MatterSpecification.v142.Core} § 7.15.5
 */
export interface AtomicAttributeStatus extends TypeFromSchema<typeof TlvAtomicAttributeStatus> {}
