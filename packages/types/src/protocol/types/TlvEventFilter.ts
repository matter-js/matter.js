/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvNodeId } from "../../datatype/NodeId.js";
import { TlvUInt64 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.6 */

export const TlvEventFilter = TlvObject({
    // EventFilterIB
    nodeId: TlvOptionalField(0, TlvNodeId),
    eventMin: TlvField(1, TlvUInt64),
});

export type EventFilter = TypeFromSchema<typeof TlvEventFilter>;
