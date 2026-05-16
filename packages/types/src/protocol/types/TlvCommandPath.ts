/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/index.js";
import { TlvClusterId } from "../../datatype/ClusterId.js";
import { TlvCommandId } from "../../datatype/CommandId.js";
import { TlvEndpointNumber } from "../../datatype/EndpointNumber.js";
import { TlvField, TlvOptionalField, TlvTaggedList } from "../../tlv/TlvObject.js";

/**
 * @see {@link MatterSpecification.v13.Core}, section 10.6.11
 *
 * `TlvTaggedList` emits members in schema/tag order, which is what
 * {@link MatterSpecification.v151.Core} section 10.6.1 ("Tag Rules")
 * requires for §10 IBs: "Unless otherwise noted, all context tags SHALL
 * be emitted in the order as defined in the appropriate specification."
 * Section A.5.3 ("Lists") additionally states that a list member's
 * meaning is denoted by its position. Together they require
 * `CommandPathIB` on the wire to be `endpointId (0), clusterId (1),
 * commandId (2)` regardless of the order in which the caller populated
 * the value object.
 *
 * Section numbers and wording verified against the Matter 1.3, 1.4, and
 * 1.5 / 1.5.1 Core specifications; matter.js targets 1.5.1 (see
 * `Specification.REVISION`).
 */
export const TlvCommandPath = TlvTaggedList({
    // CommandPathIB
    endpointId: TlvOptionalField(0, TlvEndpointNumber),
    clusterId: TlvField(1, TlvClusterId),
    commandId: TlvField(2, TlvCommandId),
});

export type CommandPath = TypeFromSchema<typeof TlvCommandPath>;
