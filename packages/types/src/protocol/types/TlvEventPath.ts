/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvClusterId } from "../../datatype/ClusterId.js";
import { TlvEndpointNumber } from "../../datatype/EndpointNumber.js";
import { TlvEventId } from "../../datatype/EventId.js";
import { TlvNodeId } from "../../datatype/NodeId.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvOptionalField, TlvTaggedList } from "../../tlv/TlvObject.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.8 */

export const TlvEventPath = TlvTaggedList({
    // EventPathIB
    nodeId: TlvOptionalField(0, TlvNodeId),
    endpointId: TlvOptionalField(1, TlvEndpointNumber),
    clusterId: TlvOptionalField(2, TlvClusterId),
    eventId: TlvOptionalField(3, TlvEventId),
    isUrgent: TlvOptionalField(4, TlvBoolean),
});

export type EventPath = TypeFromSchema<typeof TlvEventPath>;
