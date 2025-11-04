/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Namespace } from "./Namespace.js";
import { TlvEnum, TlvUInt8 } from "../tlv/TlvNumber.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

/**
 * Semantic Tag
 *
 * This data type shall be represented by the following structure:
 *
 * @see {@link MatterSpecification.v142.Core} § 7.19.2.46
 */
export const TlvSemtag = TlvObject({
    /**
     * If the MfgCode field is not NULL, it shall be the Vendor ID of the manufacturer who has defined a certain
     * namespace and the NamespaceID field shall be the ID of a namespace defined by the manufacturer identified in the
     * MfgCode field.
     *
     * If a manufacturer specific Tag field is indicated in a list of SemanticTagStruct entries, the list shall include
     * at least one standard tag which is not from any manufacturer’s namespace. A standard tag is a tag from a common
     * namespace, a derived cluster namespace, or an applicable device-specific namespace.
     *
     * If MfgCode is NULL, the NamespaceID field shall indicate a standard namespace.
     *
     * @see {@link MatterSpecification.v142.Core} § 7.19.2.46.1
     */
    mfgCode: TlvField(0, TlvNullable(TlvVendorId)),

    /**
     * The NamespaceID field shall identify a namespace.
     *
     * The common and device-specific semantic tag namespaces are listed in StandardNamespaces.
     *
     * @see {@link MatterSpecification.v142.Core} § 7.19.2.46.2
     */
    namespaceId: TlvField(1, TlvEnum<Namespace>()),

    /**
     * The Tag field shall be the ID of a semantic tag located within the namespace indicated by NamespaceID.
     *
     * A device may expose tags from the common or device-specific namespaces and from manufacturer-specific namespaces
     * in a single TagList.
     *
     * @see {@link MatterSpecification.v142.Core} § 7.19.2.46.3
     */
    tag: TlvField(2, TlvUInt8),

    /**
     * The Label field, if present, shall contain human-readable text suitable for display on a client. The content of
     * the Label field is defined by the manufacturer.
     *
     * This field shall be present when the MfgCode is not NULL. This field SHOULD NOT be used if the Tag is from a
     * standard namespace, unless the Tag requires further qualification. For example: A Tag that has the meaning of
     * "room" in a location namespace, would require the a label string to qualify the type of room, such as "1", "2b",
     * "Bathroom", etc.
     *
     * @see {@link MatterSpecification.v142.Core} § 7.19.2.46.4
     */
    label: TlvOptionalField(3, TlvNullable(TlvString.bound({ maxLength: 64 })))
});

/**
 * Semantic Tag
 *
 * This data type shall be represented by the following structure:
 *
 * @see {@link MatterSpecification.v142.Core} § 7.19.2.46
 */
export interface Semtag extends TypeFromSchema<typeof TlvSemtag> {}
