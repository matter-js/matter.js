/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeId, TlvAttributeId } from "../datatype/AttributeId.js";
import { CommandId, TlvCommandId } from "../datatype/CommandId.js";
import { BitSchema, TypeFromPartialBitSchema } from "../schema/BitmapSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvBitmap, TlvUInt16, TlvUInt32 } from "../tlv/TlvNumber.js";
import type { Attribute } from "./RetiredElements.js";
import { Attribute as AttributeFactory } from "./RetiredElements.js";

// TODO Adjust typing to be derived from the schema below
/** @see {@link MatterSpecification.v11.Core} § 7.13 */
export type GlobalAttributes<F extends BitSchema> = {
    /** Indicates the revision of the server cluster specification supported by the cluster instance. */
    clusterRevision: Attribute<number, never>;

    /** Indicates whether the server supports zero or more optional cluster features. */
    featureMap: Attribute<TypeFromPartialBitSchema<F>, never>;

    /** List of the attribute IDs of the attributes supported by the cluster instance. */
    attributeList: Attribute<AttributeId[], never>;

    /** List of client generated commands which are supported by this cluster server instance. */
    acceptedCommandList: Attribute<CommandId[], never>;

    /** List of server generated commands (server to client commands). */
    generatedCommandList: Attribute<CommandId[], never>;
};

export const GlobalAttributes = <F extends BitSchema>(features: F) =>
    ({
        clusterRevision: AttributeFactory(0xfffd, TlvUInt16),
        featureMap: AttributeFactory(0xfffc, TlvBitmap(TlvUInt32, features)),
        attributeList: AttributeFactory(0xfffb, TlvArray(TlvAttributeId)),
        acceptedCommandList: AttributeFactory(0xfff9, TlvArray(TlvCommandId)),
        generatedCommandList: AttributeFactory(0xfff8, TlvArray(TlvCommandId)),
    }) as GlobalAttributes<F>;
