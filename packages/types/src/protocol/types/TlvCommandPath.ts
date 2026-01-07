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

/** @see {@link MatterSpecification.v13.Core}, section 10.6.11 */

export const TlvCommandPath = TlvTaggedList({
    // CommandPathIB
    endpointId: TlvOptionalField(0, TlvEndpointNumber),
    clusterId: TlvField(1, TlvClusterId),
    commandId: TlvField(2, TlvCommandId),
});

export type CommandPath = TypeFromSchema<typeof TlvCommandPath>;
