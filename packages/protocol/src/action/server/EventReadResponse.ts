/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionSession } from "#action/Interactable.js";
import { ClusterProtocol, EndpointProtocol, EventTypeProtocol, NodeProtocol } from "#action/protocols.js";
import { Read } from "#action/request/Read.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { AccessControl, hasRemoteActor } from "#action/server/AccessControl.js";
import { DataResponse, FallbackLimits } from "#action/server/DataResponse.js";
import { NumberedOccurrence } from "#events/Occurrence.js";
import { InternalError, isObject, Logger } from "#general";
import { DataModelPath, ElementTag, EventModel } from "#model";
import {
    EventNumber,
    EventPath,
    FabricIndex,
    NodeId,
    Status,
    StatusCode,
    StatusResponseError,
    TlvSchema,
} from "#types";

const logger = Logger.get("EventReadResponse");

/**
 * Implements read of event data for Matter "read" and "subscribe" interactions.
 *
 * We collect all allowed event paths at first and then iterate over all events and use the ones matching to the paths.
 *
 * TODO - profile; ensure nested functions are properly JITed and/or inlined
 */
export class EventReadResponse<
    SessionT extends InteractionSession = InteractionSession,
> extends DataResponse<SessionT> {
    // Normalized Event Filter to just our node-id
    #eventMinVersion?: EventNumber;

    // The Fabric filtering is done when we read the data from OccurrenceManager, so we can determine the parameter once
    #filteredForFabricIndex?: FabricIndex;

    // The following state updates as data producers execute.  This serves both to convey state between functions and as
    // a cache between producers that touch the same endpoint and/or cluster
    #currentEndpoint?: EndpointProtocol;
    #currentCluster?: ClusterProtocol;

    // Collected allowed and existing event paths to consider when reading events
    #allowedEventPaths = new Map<string, TlvSchema<unknown>>();

    // Count how many events status (on error) and event values (on success) we have emitted
    #statusCount = 0;
    #valueCount = 0;

    constructor(node: NodeProtocol, session: SessionT) {
        super(node, session);
    }

    async *process({
        eventFilters,
        eventRequests,
        isFabricFiltered,
    }: Read.Events): AsyncGenerator<ReadResult.Chunk, void, void> {
        const nodeId = !this.session.fabric ? NodeId.UNSPECIFIED_NODE_ID : this.nodeId;

        if (eventFilters !== undefined) {
            for (const { nodeId: filterNodeId, eventMin } of eventFilters) {
                if (filterNodeId === undefined || filterNodeId === nodeId) {
                    this.#eventMinVersion = EventNumber(eventMin);
                    break;
                }
            }
        }

        if (isFabricFiltered) {
            this.#filteredForFabricIndex = this.session.fabric ?? FabricIndex.NO_FABRIC;
        }

        // This path contributes an event value
        // Register paths
        for (const path of eventRequests) {
            if (path.endpointId === undefined || path.clusterId === undefined || path.eventId === undefined) {
                this.#addWildcard(path);
            } else {
                const status = this.#addConcrete(path as ReadResult.ConcreteEventPath);
                if (status !== undefined) {
                    // This path is not valid, so emit a status response
                    yield [status];
                    this.#statusCount++;
                }
            }
        }

        // Perform actual read of all events
        for await (const data of this.#readAllowedEvents()) {
            yield [data];
            this.#valueCount++;
        }
    }

    get counts() {
        return {
            status: this.#statusCount,
            success: this.#valueCount,
            existent: this.#allowedEventPaths.size,
        };
    }

    /** Guarded accessor for this.#currentEndpoint.  This should never be undefined */
    get #guardedCurrentEndpoint() {
        if (this.#currentEndpoint === undefined) {
            throw new InternalError("currentEndpoint is not set. Should never happen");
        }
        return this.#currentEndpoint;
    }

    /** Guarded accessor for this.#currentCluster.  This should never be undefined */
    get #guardedCurrentCluster(): ClusterProtocol {
        if (this.#currentCluster === undefined) {
            throw new InternalError("currentCluster is not set. Should never happen");
        }
        return this.#currentCluster;
    }

    /**
     * Validate a wildcard path and update the internal state.
     */
    #addWildcard(path: EventPath) {
        const { nodeId, clusterId, endpointId, eventId } = path;

        if (clusterId === undefined && eventId !== undefined) {
            throw new StatusResponseError("Illegal read request with wildcard cluster ID", StatusCode.InvalidAction);
        }

        if (nodeId !== undefined && nodeId !== this.nodeId) {
            return;
        }

        if (endpointId === undefined) {
            for (const endpoint of this.node) {
                this.#addEndpointForWildcard(endpoint, path);
            }
            return;
        }

        const endpoint = this.node[endpointId];
        if (endpoint) {
            return this.#addEndpointForWildcard(endpoint, path);
        }
    }

    /**
     * Validate a concrete path and update the internal state.
     */
    #addConcrete(path: ReadResult.ConcreteEventPath) {
        const { nodeId, endpointId, clusterId, eventId } = path;
        if (nodeId !== undefined && this.nodeId !== nodeId) {
            return this.#asStatus(path, Status.UnsupportedNode);
        }

        // Resolve path elements
        const endpoint = this.node[endpointId];
        const cluster = endpoint?.[clusterId];
        const event = cluster?.type.events[eventId];
        let limits;
        if (event === undefined) {
            // We still need to authorize the user for access even though this path doesn't resolve.  Spec is not
            // explicit on what privilege level we should require as normally that information comes from the resolved
            // event.  So attempt to resolve via the active model
            const modelEvent = this.node.matter
                .member(path.clusterId, [ElementTag.Cluster])
                ?.member(path.eventId, [ElementTag.Event]);

            if (modelEvent) {
                // OK cluster doesn't exist at that location, but we do understand semantically, so use limits from the
                // model
                limits = AccessControl(modelEvent as EventModel).limits;
            } else {
                // We've got no idea.  This effectively falls back to "view" privilege
                limits = FallbackLimits;
            }
        } else {
            limits = event.limits;
        }

        // Validate access.  Order here prescribed by 1.4 core spec 8.4.3.2
        // We need some fallback location if cluster is not defined
        if (hasRemoteActor(this.session)) {
            const location = {
                ...(cluster?.location ?? {
                    path: DataModelPath.none,
                    endpoint: endpointId,
                    cluster: clusterId,
                }),
                owningFabric: this.session.fabric,
            };
            const permission = this.session.authorityAt(limits.readLevel, location);
            switch (permission) {
                case AccessControl.Authority.Granted:
                    break;

                case AccessControl.Authority.Unauthorized:
                    return this.#asStatus(path, Status.UnsupportedAccess);

                case AccessControl.Authority.Restricted:
                    return this.#asStatus(path, Status.AccessRestricted);

                default:
                    throw new InternalError(`Unsupported authorization state ${permission}`);
            }
        }

        if (endpoint === undefined) {
            return this.#asStatus(path, Status.UnsupportedEndpoint);
        }
        if (cluster === undefined) {
            return this.#asStatus(path, Status.UnsupportedCluster);
        }
        if (event === undefined || !cluster.type.events[event.id]) {
            return this.#asStatus(path, Status.UnsupportedEvent);
        }

        if (this.#currentEndpoint !== endpoint) {
            this.#currentEndpoint = endpoint;
            this.#currentCluster = cluster;
        } else if (this.#currentCluster !== cluster) {
            this.#currentCluster = cluster;
        }

        // Register allowed event-path
        this.#registerEventPath(path);
    }

    /**
     * Starts new chunk or adds to current chunk all values from {@link endpoint} selected by {@link path}.
     *
     * Emits previous chunk if it exists and was not for this endpoint.  This means that our chunk size is one endpoint
     * worth of data, except for the initial error chunk if there are path errors.
     *
     * TODO - skip endpoints for which subject is unauthorized
     */
    #addEndpointForWildcard(endpoint: EndpointProtocol, path: EventPath) {
        if (this.#currentEndpoint !== endpoint) {
            this.#currentEndpoint = endpoint;
            this.#currentCluster = undefined;
        }

        const { clusterId } = path;
        if (clusterId === undefined) {
            for (const cluster of endpoint) {
                this.#addClusterForWildcard(cluster, { ...path, endpointId: endpoint.id });
            }
        } else {
            const cluster = endpoint[clusterId];
            if (cluster !== undefined) {
                this.#addClusterForWildcard(cluster, { ...path, endpointId: endpoint.id });
            }
        }
    }

    /**
     * Read values from a specific {@link cluster} for a wildcard path.
     *
     * Depends on state initialized by {@link #addEndpointForWildcard}.
     *
     * TODO - skip endpoints for which subject is unauthorized as optimization
     */
    #addClusterForWildcard(cluster: ClusterProtocol, path: EventPath) {
        if (this.#currentCluster !== cluster) {
            this.#currentCluster = cluster;
        }

        const { eventId } = path;
        if (eventId === undefined) {
            for (const event of cluster.type.events) {
                this.#addEventForWildcard(event, {
                    ...path,
                    clusterId: cluster.type.id,
                });
            }
        } else {
            const event = cluster.type.events[eventId];
            if (event !== undefined) {
                this.#addEventForWildcard(event, {
                    ...path,
                    clusterId: cluster.type.id,
                });
            }
        }
    }

    /**
     * Read values from a specific {@link event} for a wildcard path.
     *
     * Depends on state initialized by {@link #addClusterForWildcard}.
     */
    #addEventForWildcard(event: EventTypeProtocol, path: EventPath) {
        if (!this.#guardedCurrentCluster.type.events[event.id]) {
            return; // EVent is not active, so ignore
        }
        if (
            hasRemoteActor(this.session) &&
            this.session.authorityAt(event.limits.readLevel, this.#guardedCurrentCluster.location) !==
                AccessControl.Authority.Granted
        ) {
            return;
        }

        this.#registerEventPath({ ...path, eventId: event.id } as ReadResult.ConcreteEventPath);
    }

    #createEventKey(path: ReadResult.ConcreteEventPath) {
        const { endpointId, clusterId, eventId } = path;
        return `${endpointId}:${clusterId}:${eventId}`;
    }

    #registerEventPath(path: ReadResult.ConcreteEventPath) {
        const { eventId } = path;
        this.#allowedEventPaths.set(
            this.#createEventKey({
                ...path,
                endpointId: this.#guardedCurrentEndpoint.id,
                clusterId: this.#guardedCurrentCluster.type.id,
                eventId,
            }),
            this.#guardedCurrentCluster.type.events[eventId]!.tlv,
        );
    }

    async *#readAllowedEvents() {
        for await (const event of this.node.eventHandler.get(this.#eventMinVersion)) {
            const tlv = this.#allowedEventPaths.get(this.#createEventKey(event));
            if (tlv === undefined) {
                // This event is not in the allowed list, so skip it
                continue;
            }
            // Filter out if we need to do fabric filtering and  the event is not for the current fabric
            if (this.#filteredForFabricIndex !== undefined) {
                const { payload } = event;
                if (!isObject(payload)) {
                    continue;
                }
                const { fabricIndex } = payload;
                if (fabricIndex !== undefined && fabricIndex !== this.#filteredForFabricIndex) {
                    continue;
                }
            }
            yield this.#asValue(event, tlv);
        }
    }

    /**
     * Add a status value.
     */
    #asStatus(path: ReadResult.ConcreteEventPath, status: Status) {
        logger.debug(`Error reading event ${this.node.inspectPath(path)}: Status=${StatusCode[status]}(${status})`);

        const report: ReadResult.EventStatus = {
            kind: "event-status",
            path,
            status,
        };

        return report;
    }

    /**
     * Add event values as separate entries to the result.
     */
    #asValue(event: NumberedOccurrence, tlv: TlvSchema<unknown>) {
        const { number, epochTimestamp: timestamp, priority, payload: value, endpointId, clusterId, eventId } = event;
        const report: ReadResult.EventValue = {
            kind: "event-value",
            path: { endpointId, clusterId, eventId },
            number,
            priority,
            timestamp,
            value,
            tlv,
        };

        return report;
    }
}
