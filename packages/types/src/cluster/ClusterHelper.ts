/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Diagnostic } from "@matter/general";
import { AttributeModel, ClusterModel, CommandModel, EventModel, Matter, MatterModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";
import { EndpointNumber } from "../datatype/EndpointNumber.js";
import { NodeId } from "../datatype/NodeId.js";
import { AttributePath, CommandPath, EventPath } from "../protocol/index.js";

function toHex(value: number | bigint | undefined) {
    return value === undefined ? "*" : `0x${value.toString(16)}`;
}

export function getClusterNameById(clusterId: ClusterId, matter: MatterModel = Matter): string {
    return matter.clusters(clusterId)?.name ?? `Unknown cluster ${Diagnostic.hex(clusterId)}`;
}

function resolveEndpointClusterName(
    nodeId: NodeId | undefined,
    endpointId: EndpointNumber | undefined,
    clusterId: ClusterId | undefined,
    matter: MatterModel,
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
    const name = matter.clusters(clusterId)?.name;
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

export function resolveAttributeName(
    { nodeId, endpointId, clusterId, attributeId }: AttributePath,
    matter: MatterModel = Matter,
) {
    const endpointClusterName = resolveEndpointClusterName(nodeId, endpointId, clusterId, matter);
    if (endpointId === undefined || clusterId === undefined || attributeId === undefined) {
        return `${endpointClusterName}/${toHex(attributeId)}`;
    }
    const cluster = matter.clusters(clusterId);
    const name = resolveElementName(cluster, AttributeModel.Tag, attributeId);
    if (name === undefined) {
        return `${endpointClusterName}/unknown(${toHex(attributeId)})`;
    }
    return `${endpointClusterName}/${name}(${toHex(attributeId)})`;
}

export function resolveEventName(
    { nodeId, endpointId, clusterId, eventId, isUrgent }: EventPath,
    matter: MatterModel = Matter,
) {
    const isUrgentStr = isUrgent ? "!" : "";
    const endpointClusterName = resolveEndpointClusterName(nodeId, endpointId, clusterId, matter);
    if (endpointId === undefined || clusterId === undefined || eventId === undefined) {
        return `${isUrgentStr}${endpointClusterName}/${toHex(eventId)}`;
    }
    const cluster = matter.clusters(clusterId);
    const name = resolveElementName(cluster, EventModel.Tag, eventId);
    if (name === undefined) {
        return `${isUrgentStr}${endpointClusterName}/unknown(${toHex(eventId)})`;
    }
    return `${isUrgentStr}${endpointClusterName}/${name}(${toHex(eventId)})`;
}

export function resolveCommandName({ endpointId, clusterId, commandId }: CommandPath, matter: MatterModel = Matter) {
    const endpointClusterName = resolveEndpointClusterName(undefined, endpointId, clusterId, matter);
    if (endpointId === undefined || clusterId === undefined || commandId === undefined) {
        return `${endpointClusterName}/${toHex(commandId)}`;
    }
    const cluster = matter.clusters(clusterId);
    const name = resolveElementName(cluster, CommandModel.Tag, commandId);
    if (name === undefined) {
        return `${endpointClusterName}/unknown(${toHex(commandId)})`;
    }
    return `${endpointClusterName}/${name}(${toHex(commandId)})`;
}

/**
 * Bidirectional name↔ID resolution for cluster attributes, events and commands.
 *
 * Each function is scoped to a cluster within a {@link MatterModel}, defaulting to the global {@link Matter} model;
 * pass a node's model (`node.matter`) so custom/vendor clusters resolve.  Lookups accept either the camelCase name
 * or the numeric ID and return `undefined` when unknown.
 */
export namespace ClusterLookup {
    export function attributeId(
        clusterId: ClusterId,
        nameOrId: string | number,
        matter: MatterModel = Matter,
    ): number | undefined {
        return matter.clusters(clusterId)?.attributes(nameOrId)?.id;
    }

    export function attributeName(
        clusterId: ClusterId,
        nameOrId: string | number,
        matter: MatterModel = Matter,
    ): string | undefined {
        return matter.clusters(clusterId)?.attributes(nameOrId)?.propertyName;
    }

    export function eventId(
        clusterId: ClusterId,
        nameOrId: string | number,
        matter: MatterModel = Matter,
    ): number | undefined {
        return matter.clusters(clusterId)?.events(nameOrId)?.id;
    }

    export function eventName(
        clusterId: ClusterId,
        nameOrId: string | number,
        matter: MatterModel = Matter,
    ): string | undefined {
        return matter.clusters(clusterId)?.events(nameOrId)?.propertyName;
    }

    export function commandId(
        clusterId: ClusterId,
        nameOrId: string | number,
        matter: MatterModel = Matter,
    ): number | undefined {
        return matter.clusters(clusterId)?.commands(nameOrId)?.id;
    }

    export function commandName(
        clusterId: ClusterId,
        nameOrId: string | number,
        matter: MatterModel = Matter,
    ): string | undefined {
        return matter.clusters(clusterId)?.commands(nameOrId)?.propertyName;
    }
}
