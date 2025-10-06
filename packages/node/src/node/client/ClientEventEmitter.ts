/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ElementEvent, Events } from "#behavior/Events.js";
import { camelize, Logger } from "#general";
import { ClusterModel, EventModel, MatterModel } from "#model";
import type { ClientNode } from "#node/ClientNode.js";
import type { ReadResult } from "#protocol";
import type { ClusterId, EndpointNumber, EventId } from "#types";
import type { ClientStructure } from "./ClientStructure.js";

const logger = Logger.get("ClientEventEmitter");

/**
 * Event handler for Matter events transmitted by a peer.
 *
 * TODO - set priority on context when split for server vs. client
 * TODO - record latest event number for each subscription shape (or just wildcard?)
 */
export interface ClientEventEmitter {
    (event: ReadResult.EventValue): void;
}

/**
 * Cache of MatterModel + cluster + event ID -> event name.
 */
const nameCache = new WeakMap<
    MatterModel,
    Record<`${ClusterId}-${EventId}`, undefined | { cluster: string; event: string }>
>();

/**
 * We warn for each cluster or cluster+event that we don't support.
 */
const warnedForUnknown = new Set<ClusterId | `${ClusterId}-${EventId}`>();

export function ClientEventEmitter(node: ClientNode, structure: ClientStructure) {
    return emitClientEvent;

    function emitClientEvent(occurrence: ReadResult.EventValue) {
        const names = getNames(node.matter, occurrence);
        if (!names) {
            return;
        }

        const event = getEvent(occurrence.path.endpointId, names.cluster, names.event);
        if (event) {
            node.act(agent => {
                // Current ActionContext is not writable, could skip act() but meh, see TODO above
                //agent.context.priority = occurrence.priority;
                event.emit(occurrence.value, agent.context);
            });
        }
    }

    function getEvent(endpointId: EndpointNumber, clusterName: string, eventName: string) {
        const endpoint = structure.endpointFor(endpointId);
        if (endpoint === undefined) {
            logger.error(`Received event for unsupported endpoint #${endpointId}`);
            return;
        }

        const events = (endpoint.events as Events.Generic<ElementEvent>)[clusterName];
        if (events === undefined) {
            logger.error(`Received event ${eventName} for unsupported cluster ${clusterName} on ${endpoint}`);
            return;
        }

        const event = events[eventName];
        if (event === undefined) {
            logger.error(`Received unsupported event ${eventName} for cluster ${clusterName} on ${endpoint}`);
            return;
        }

        return event;
    }
}

function getNames(matter: MatterModel, { path: { clusterId, eventId } }: ReadResult.EventValue) {
    let matterCache = nameCache.get(matter);
    if (matterCache === undefined) {
        matterCache = {};
        nameCache.set(matter, matterCache);
    }

    const key = `${clusterId}-${eventId}` as const;
    if (key in matterCache) {
        return matterCache[key];
    }

    const cluster = matter.get(ClusterModel, clusterId);
    if (cluster === undefined) {
        if (!warnedForUnknown.has(clusterId)) {
            logger.warn(`Ignoring events for unknown cluster #${clusterId}`);
            warnedForUnknown.add(clusterId);
            matterCache[key] = undefined;
        }
        return;
    }

    const event = cluster.get(EventModel, eventId);
    if (event === undefined) {
        if (!warnedForUnknown.has(key)) {
            logger.warn(`Ignoring unknown event #${eventId} for ${cluster.name} cluster`);
            warnedForUnknown.add(key);
            matterCache[key] = undefined;
        }
        return;
    }

    return (matterCache[key] = { cluster: camelize(cluster.name), event: camelize(event.name) });
}
