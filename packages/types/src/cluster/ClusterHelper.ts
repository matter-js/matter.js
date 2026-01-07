/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Diagnostic, Logger } from "#general";
import { AttributeId } from "../datatype/AttributeId.js";
import { ClusterId } from "../datatype/ClusterId.js";
import { CommandId } from "../datatype/CommandId.js";
import { EndpointNumber } from "../datatype/EndpointNumber.js";
import { EventId } from "../datatype/EventId.js";
import { NodeId } from "../datatype/NodeId.js";
import { TlvAttributePath, TlvCommandPath, TlvEventPath } from "../protocol/index.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Attribute, Cluster, Command, Event } from "./Cluster.js";
import { ClusterRegistry } from "./ClusterRegistry.js";

const logger = Logger.get("ClusterHelper");

interface CachedAttributeInfo {
    attribute: Attribute<any, any>;
    name: string;
}
interface CachedEventInfo {
    event: Event<any, any>;
    name: string;
}
interface CachedCommandInfo {
    command: Command<any, any, any>;
    name: string;
}
const clusterAttributeCache = new Map<ClusterId, Map<AttributeId, CachedAttributeInfo>>();
const clusterEventCache = new Map<ClusterId, Map<EventId, CachedEventInfo>>();
const clusterCommandCache = new Map<ClusterId, Map<CommandId, CachedCommandInfo>>();

export const UnknownCluster = (clusterId: ClusterId) =>
    Cluster({
        id: clusterId,
        name: `Unknown cluster ${toHex(clusterId)}`,
        revision: 0,
        unknown: true,
    });

export function getClusterNameById(clusterId: ClusterId): string {
    return ClusterRegistry.get(clusterId)?.name ?? `Unknown cluster ${Diagnostic.hex(clusterId)}`;
}

export function getClusterById(clusterId: ClusterId): Cluster<any, any, any, any, any> {
    let cluster = ClusterRegistry.get(clusterId);
    if (cluster === undefined) {
        logger.info(`Unknown cluster ${toHex(clusterId)} requested: UnknownCluster instance added.`);
        cluster = UnknownCluster(clusterId);
        ClusterRegistry.register(cluster);
    }
    return cluster;
}

export function getClusterAttributeById(
    clusterDef: Cluster<any, any, any, any, any>,
    attributeId: AttributeId,
): CachedAttributeInfo | undefined {
    if (!clusterAttributeCache.has(clusterDef.id)) {
        const attributeMap = new Map<AttributeId, CachedAttributeInfo>();

        const { attributes } = clusterDef;

        // Add accessors
        for (const attributeName in attributes) {
            const attribute = attributes[attributeName];
            attributeMap.set(attribute.id, { attribute, name: attributeName });
        }

        clusterAttributeCache.set(clusterDef.id, attributeMap);
        return attributeMap.get(attributeId);
    }
    const attributeMap = clusterAttributeCache.get(clusterDef.id);
    if (attributeMap === undefined) {
        return undefined;
    }
    return attributeMap.get(attributeId);
}

export function getClusterEventById(
    clusterDef: Cluster<any, any, any, any, any>,
    eventId: EventId,
): CachedEventInfo | undefined {
    if (!clusterEventCache.has(clusterDef.id)) {
        const eventMap = new Map<EventId, CachedEventInfo>();

        const { events } = clusterDef;

        // Add accessors
        for (const eventName in events) {
            const event = events[eventName];
            eventMap.set(event.id, { event, name: eventName });
        }

        clusterEventCache.set(clusterDef.id, eventMap);
        return eventMap.get(eventId);
    }
    const eventMap = clusterEventCache.get(clusterDef.id);
    if (eventMap === undefined) {
        return undefined;
    }
    return eventMap.get(eventId);
}

export function getClusterCommandById(
    clusterDef: Cluster<any, any, any, any, any>,
    commandId: CommandId,
): CachedCommandInfo | undefined {
    if (!clusterCommandCache.has(clusterDef.id)) {
        const commandMap = new Map<CommandId, CachedCommandInfo>();

        const { commands } = clusterDef;

        // Add accessors
        for (const commandName in commands) {
            const command = commands[commandName];
            commandMap.set(command.requestId, { command, name: commandName });
        }

        clusterCommandCache.set(clusterDef.id, commandMap);
        return commandMap.get(commandId);
    }
    const commandMap = clusterCommandCache.get(clusterDef.id);
    if (commandMap === undefined) {
        return undefined;
    }
    return commandMap.get(commandId);
}

function toHex(value: number | bigint | undefined) {
    return value === undefined ? "*" : `0x${value.toString(16)}`;
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
    const cluster = getClusterById(clusterId);
    if (cluster.unknown) {
        return `${elementName}/unknown(${toHex(clusterId)})`;
    }
    return `${elementName}/${cluster.name}(${toHex(clusterId)})`;
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
    const cluster = getClusterById(clusterId);
    const attribute = getClusterAttributeById(cluster, attributeId);
    if (attribute === undefined) {
        return `${endpointClusterName}/unknown(${toHex(attributeId)})`;
    }
    return `${endpointClusterName}/${attribute.name}(${toHex(attributeId)})`;
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
    const event = getClusterEventById(getClusterById(clusterId), eventId);
    if (event === undefined) {
        return `${isUrgentStr}${endpointClusterName}/unknown(${toHex(eventId)})`;
    }
    return `${isUrgentStr}${endpointClusterName}/${event.name}(${toHex(eventId)})`;
}

export function resolveCommandName({ endpointId, clusterId, commandId }: TypeFromSchema<typeof TlvCommandPath>) {
    const endpointClusterName = resolveEndpointClusterName(undefined, endpointId, clusterId);
    if (endpointId === undefined || clusterId === undefined || commandId === undefined) {
        return `${endpointClusterName}/${toHex(commandId)}`;
    }
    const command = getClusterCommandById(getClusterById(clusterId), commandId);
    if (command === undefined) {
        return `${endpointClusterName}/unknown(${toHex(commandId)})`;
    }
    return `${endpointClusterName}/${command.name}(${toHex(commandId)})`;
}
