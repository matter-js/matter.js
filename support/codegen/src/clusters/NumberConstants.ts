/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    attribId,
    clusterId,
    commandId,
    devtypeId,
    endpointNo,
    epochS,
    epochUs,
    eventId,
    fabricId,
    fabricIdx,
    groupId,
    Model,
    nodeId,
    percent,
    percent100ths,
    posixMs,
    subjectId,
    systimeMs,
    systimeUs,
    vendorId,
} from "#model";

function special(type: string, category: "datatype" | "number" = "datatype") {
    return { type, category };
}

/**
 * Map of matter datatype names to TlvGenerator.tlvImport arguments.
 */
export const SpecializedNumbers = {
    [attribId.name]: special("TlvAttributeId", "datatype"),
    [clusterId.name]: special("TlvClusterId", "datatype"),
    [commandId.name]: special("TlvCommandId", "datatype"),
    [devtypeId.name]: special("TlvDeviceTypeId", "datatype"),
    [endpointNo.name]: special("TlvEndpointNumber", "datatype"),
    [eventId.name]: special("TlvEventId", "datatype"),
    [fabricId.name]: special("TlvFabricId", "datatype"),
    [fabricIdx.name]: special("TlvFabricIndex", "datatype"),
    [groupId.name]: special("TlvGroupId", "datatype"),
    [nodeId.name]: special("TlvNodeId", "datatype"),
    [subjectId.name]: special("TlvSubjectId", "datatype"),
    [vendorId.name]: special("TlvVendorId", "datatype"),
    [percent.name]: special("TlvPercent", "number"),
    [percent100ths.name]: special("TlvPercent100ths", "number"),
    [epochUs.name]: special("TlvEpochUs", "number"),
    [epochS.name]: special("TlvEpochS", "number"),
    [posixMs.name]: special("TlvPosixMs", "number"),
    [systimeUs.name]: special("TlvSysTimeUs", "number"),
    [systimeMs.name]: special("TlvSysTimeMS", "number"),
};

export function specializedNumberTypeFor(model: Model) {
    for (let base: Model | undefined = model; base; base = base.base) {
        if (SpecializedNumbers[base.name]) {
            return base;
        }
    }
}
