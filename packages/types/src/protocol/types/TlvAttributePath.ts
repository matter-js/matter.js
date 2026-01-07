/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvAttributeId } from "../../datatype/AttributeId.js";
import { TlvClusterId } from "../../datatype/ClusterId.js";
import { TlvEndpointNumber } from "../../datatype/EndpointNumber.js";
import { TlvNodeId } from "../../datatype/NodeId.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvNullable } from "../../tlv/TlvNullable.js";
import { TlvBitmap, TlvUInt16, TlvUInt32 } from "../../tlv/TlvNumber.js";
import { TlvOptionalField, TlvTaggedList } from "../../tlv/TlvObject.js";
import { WildcardPathFlagsBitmap } from "./WildcardPathFlagsBitmap.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.2 */

export const TlvAttributePath = TlvTaggedList({
    // AttributePathIB
    enableTagCompression: TlvOptionalField(0, TlvBoolean),
    nodeId: TlvOptionalField(1, TlvNodeId),
    endpointId: TlvOptionalField(2, TlvEndpointNumber),
    clusterId: TlvOptionalField(3, TlvClusterId),
    attributeId: TlvOptionalField(4, TlvAttributeId),
    listIndex: TlvOptionalField(5, TlvNullable(TlvUInt16)),
    wildcardPathFlags: TlvOptionalField(6, TlvBitmap(TlvUInt32, WildcardPathFlagsBitmap)),
});

export type AttributePath = TypeFromSchema<typeof TlvAttributePath>;
