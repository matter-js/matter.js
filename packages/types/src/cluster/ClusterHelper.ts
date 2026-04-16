/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Diagnostic } from "@matter/general";
import { AttributeModel, ClusterModel, CommandModel, EventModel, Matter } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";
import { EndpointNumber } from "../datatype/EndpointNumber.js";
import { NodeId } from "../datatype/NodeId.js";
import { TlvAttributePath, TlvCommandPath, TlvEventPath } from "../protocol/index.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

function toHex(value: number | bigint | undefined) {
    return value === undefined ? "*" : `0x${value.toString(16)}`;
}

export function getClusterNameById(clusterId: ClusterId): string {
    return Matter.clusters(clusterId)?.name ?? `Unknown cluster ${Diagnostic.hex(clusterId)}`;
}

function resolveEndpointClusterName(
    nodeId: NodeId | undefined,
    endpointId: EndpointNumber | undefined,
    clusterId: ClusterId | undefined,
) {
    let elementName = nodeId === undefined ? "" : `${toHex(nodeId)}/`;
    if (endpointId === undefined) {
        elementName += "*";
    } else {
        elementName += `${toHex(endpointId)}`;
    }

    if (clusterId === undefined) {
        return `${elementName}/*`;
    }
    const name = Matter.clusters(clusterId)?.name;
    if (name === undefined) {
        return `${elementName}/unknown(${toHex(clusterId)})`;
    }
    return `${elementName}/${name}(${toHex(clusterId)})`;
}

function resolveElementName(cluster: ClusterModel | undefined, tag: string, elementId: number): string | undefined {
    if (cluster === undefined) {
        return undefined;
    }
    for (const child of cluster.children) {
        if (child.tag === tag && child.id === elementId) {
            return child.name;
        }
    }
    return undefined;
}

export function resolveAttributeName({
    nodeId,
    endpointId,
    clusterId,
    attributeId,
}: TypeFromSchema<typeof TlvAttributePath>) {
    const endpointClusterName = resolveEndpointClusterName(nodeId, endpointId, clusterId);
    if (endpointId === undefined || clusterId === undefined || attributeId === undefined) {
        return `${endpointClusterName}/${toHex(attributeId)}`;
    }
    const cluster = Matter.clusters(clusterId);
    const name = resolveElementName(cluster, AttributeModel.Tag, attributeId);
    if (name === undefined) {
        return `${endpointClusterName}/unknown(${toHex(attributeId)})`;
    }
    return `${endpointClusterName}/${name}(${toHex(attributeId)})`;
}

export function resolveEventName({
    nodeId,
    endpointId,
    clusterId,
    eventId,
    isUrgent,
}: TypeFromSchema<typeof TlvEventPath>) {
    const isUrgentStr = isUrgent ? "!" : "";
    const endpointClusterName = resolveEndpointClusterName(nodeId, endpointId, clusterId);
    if (endpointId === undefined || clusterId === undefined || eventId === undefined) {
        return `${isUrgentStr}${endpointClusterName}/${toHex(eventId)}`;
    }
    const cluster = Matter.clusters(clusterId);
    const name = resolveElementName(cluster, EventModel.Tag, eventId);
    if (name === undefined) {
        return `${isUrgentStr}${endpointClusterName}/unknown(${toHex(eventId)})`;
    }
    return `${isUrgentStr}${endpointClusterName}/${name}(${toHex(eventId)})`;
}

export function resolveCommandName({ endpointId, clusterId, commandId }: TypeFromSchema<typeof TlvCommandPath>) {
    const endpointClusterName = resolveEndpointClusterName(undefined, endpointId, clusterId);
    if (endpointId === undefined || clusterId === undefined || commandId === undefined) {
        return `${endpointClusterName}/${toHex(commandId)}`;
    }
    const cluster = Matter.clusters(clusterId);
    const name = resolveElementName(cluster, CommandModel.Tag, commandId);
    if (name === undefined) {
        return `${endpointClusterName}/unknown(${toHex(commandId)})`;
    }
    return `${endpointClusterName}/${name}(${toHex(commandId)})`;
}
