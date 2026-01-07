/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvClusterId } from "../../datatype/ClusterId.js";
import { TlvEndpointNumber } from "../../datatype/EndpointNumber.js";
import { TlvNodeId } from "../../datatype/NodeId.js";
import { TlvField, TlvOptionalField, TlvTaggedList } from "../../tlv/TlvObject.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.7 */

export const TlvClusterPath = TlvTaggedList({
    // ClusterPathIB
    nodeId: TlvOptionalField(0, TlvNodeId),
    endpointId: TlvField(1, TlvEndpointNumber),
    clusterId: TlvField(2, TlvClusterId),
});
