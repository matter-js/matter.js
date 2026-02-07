/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ElementEvent, Events } from "#behavior/Events.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { camelize, Diagnostic, isObject, Logger, Timestamp } from "#general";
import { ClusterModel, EventModel, MatterModel } from "#model";
import type { ClientNode } from "#node/ClientNode.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import type { ReadResult, Val } from "#protocol";
import type { ClusterId, EventId } from "#types";
import type { ClientStructure } from "./ClientStructure.js";

const logger = Logger.get("ClientEventEmitter");

/**
 * Event handler for Matter events transmitted by a peer.
 *
 * TODO - set priority on context when split for server vs. client
 */
export interface ClientEventEmitter {
    (event: ReadResult.EventValue): Promise<void>;
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
    const changes = node.env.get(ChangeNotificationService);

    return emitClientEvent;

    async function emitClientEvent(occurrence: ReadResult.EventValue) {
        const names = getNames(node.matter, occurrence);
        if (!names) {
            return;
        }

        const target = getTarget(node, occurrence, names.cluster, names.event);
        if (!target) {
            return;
        }

        await node.act(async agent => {
            // Current ActionContext is not writable, could skip act() but meh, see TODO above
            //agent.context.priority = occurrence.priority;
            target.event.emit(occurrence.value, agent.context);

            const network = agent.get(NetworkClient);
            if (occurrence.number > network.state.maxEventNumber) {
                await agent.context.transaction.addResources(network);
                await agent.context.transaction.begin();
                network.state.maxEventNumber = occurrence.number;
                await agent.context.transaction.commit();
            }
        });

        const behavior = target.endpoint.behaviors.supported[names.cluster];
        if (behavior) {
            const { number, timestamp, priority, value } = occurrence;
            changes.broadcastEvent(target.endpoint, behavior, target.event.schema as EventModel, {
                number,
                timestamp: timestamp as Timestamp,
                priority,
                payload: value as Val.Struct | undefined,
            });
        }
    }

    function getTarget(node: ClientNode, occurrence: ReadResult.EventValue, clusterName: string, eventName: string) {
        const {
            value,
            path: { endpointId },
        } = occurrence;
        const endpoint = structure.endpointFor(endpointId);
        if (endpoint === undefined) {
            logger.warn(`Received event for unknown endpoint #${endpointId} on ${node}`);
            return;
        }

        const events = (endpoint.events as Events.Generic<ElementEvent>)[clusterName];
        if (events === undefined) {
            logger.warn(`Received event ${eventName} for unsupported cluster ${clusterName} on ${endpoint}`);
            return;
        }

        logger.info(
            "Received event",
            Diagnostic.strong(`${clusterName}.${eventName}`),
            " on ",
            Diagnostic.strong(endpoint.toString()),
            Diagnostic.weak(isObject(value) ? Diagnostic.dict(value) : value),
        );

        const event = events[eventName];
        if (event) {
            return { endpoint, event };
        }
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
