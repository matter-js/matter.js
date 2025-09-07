/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionSession } from "#action/Interactable.js";
import { AttributeTypeProtocol, ClusterProtocol, EndpointProtocol, NodeProtocol } from "#action/protocols.js";
import { Read } from "#action/request/Read.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { AccessControl, hasLocalActor, hasRemoteActor } from "#action/server/AccessControl.js";
import { DataResponse, FallbackLimits, WildcardPathFlagsCodec } from "#action/server/DataResponse.js";
import { Val } from "#action/Val.js";
import { Diagnostic, InternalError, Logger } from "#general";
import { AttributeModel, DataModelPath, ElementTag } from "#model";
import {
    AttributePath,
    ClusterId,
    EndpointNumber,
    GlobalAttributes,
    NodeId,
    Status,
    StatusCode,
    StatusResponseError,
    TlvSchema,
} from "#types";

const logger = Logger.get("AttributeReadResponse");

export const GlobalAttrIds = new Set(Object.values(GlobalAttributes({})).map(attr => attr.id));

/**
 * Implements read of attribute data for Matter "read" and "subscribe" interactions.
 *
 * TODO - profile; ensure nested functions are properly JITed and/or inlined
 */
export class AttributeReadResponse<
    SessionT extends InteractionSession = InteractionSession,
> extends DataResponse<SessionT> {
    #versions?: Record<EndpointNumber, Record<ClusterId, number>>;

    // Each input AttributePathIB that does not have an error installs a producer.  Producers run after validation and
    // generate actual attribute data
    #dataProducers?: Array<(this: AttributeReadResponse) => Iterable<ReadResult.Chunk>>;

    // The initial "chunk" may be a list of errors.  As producers execute it is a set of records associated with the
    // most recently touched endpoint.  When the endpoint changes the previous chunk emits
    #chunk?: ReadResult.Report[];

    // The following state updates as data producers execute.  This serves both to convey state between functions and as
    // a cache between producers that touch the same endpoint and/or cluster
    #currentEndpoint?: EndpointProtocol;
    #currentCluster?: ClusterProtocol;
    #currentState?: Val.ProtocolStruct;
    #wildcardPathFlags = 0;

    // Count how many attribute status (on error) and attribute values (on success) we have emitted
    #statusCount = 0;
    #valueCount = 0;
    #filteredCount = 0;

    constructor(node: NodeProtocol, session: SessionT) {
        super(node, session);
    }

    *process({ dataVersionFilters, attributeRequests }: Read.Attributes): Generator<ReadResult.Chunk, void, void> {
        const nodeId = hasLocalActor(this.session) ? NodeId.UNSPECIFIED_NODE_ID : this.nodeId;

        // Index versions
        if (dataVersionFilters?.length) {
            this.#versions = {};
            for (const {
                path: { nodeId: filterNodeId, endpointId, clusterId },
                dataVersion,
            } of dataVersionFilters) {
                if (filterNodeId !== undefined && filterNodeId !== nodeId) {
                    continue;
                }
                if (typeof endpointId !== "number") {
                    // Grr github advanced security
                    continue;
                }
                (this.#versions[endpointId] ?? (this.#versions[endpointId] = {}))[clusterId] = dataVersion;
            }
        }

        // Register paths
        for (const path of attributeRequests) {
            if (path.endpointId === undefined || path.clusterId === undefined || path.attributeId === undefined) {
                this.addWildcard(path);
            } else {
                this.addConcrete(path as ReadResult.ConcreteAttributePath);
            }
        }

        if (this.#dataProducers) {
            for (const producer of this.#dataProducers) {
                yield* producer.apply(this);
            }
        }

        // We emit chunks lazily when the endpoint changes so there may be one remaining chunk.  There may also be a
        // chunk with errors even if there are no data producers
        if (this.#chunk !== undefined) {
            yield this.#chunk;
        }
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

    get counts() {
        return {
            status: this.#statusCount,
            success: this.#valueCount,
            existent: this.#valueCount + this.#filteredCount,
        };
    }

    /**
     * Validate a wildcard path and update internal state.
     */
    protected addWildcard(path: AttributePath) {
        const { nodeId, endpointId, clusterId, attributeId, wildcardPathFlags } = path;

        if (clusterId === undefined && attributeId !== undefined && !GlobalAttrIds.has(attributeId)) {
            throw new StatusResponseError(
                `Illegal read of wildcard cluster with non-global attribute #${attributeId}`,
                Status.InvalidAction,
            );
        }

        if (nodeId !== undefined && nodeId !== this.nodeId) {
            return;
        }

        const wpf = wildcardPathFlags ? WildcardPathFlagsCodec.encode(wildcardPathFlags) : 0;

        if (endpointId === undefined) {
            this.#addProducer(function* (this: AttributeReadResponse) {
                this.#wildcardPathFlags = wpf;
                for (const endpoint of this.node) {
                    yield* this.readEndpointForWildcard(endpoint, path);
                }
            });
            return;
        }

        const endpoint = this.node[endpointId];
        if (endpoint) {
            this.#addProducer(function (this: AttributeReadResponse) {
                this.#wildcardPathFlags = wpf;
                return this.readEndpointForWildcard(endpoint, path);
            });
        }
    }

    /**
     * Validate a concrete path and update internal state.
     */
    protected addConcrete(path: ReadResult.ConcreteAttributePath) {
        const { nodeId, endpointId, clusterId, attributeId } = path;

        if (nodeId !== undefined && this.nodeId !== nodeId) {
            this.addStatus(path, Status.UnsupportedNode);
            return;
        }

        // Resolve path elements
        const endpoint = this.node[endpointId];
        const cluster = endpoint?.[clusterId];
        const attribute = cluster?.type.attributes[attributeId];
        let limits;
        if (attribute === undefined) {
            // We still need to authorize the user for access even though this path doesn't resolve.  Spec is not
            // explicit on what privilege level we should require as normally that information comes from the resolved
            // attribute.  So attempt to resolve via the active model
            const modelAttr = this.node.matter
                .member(path.clusterId, [ElementTag.Cluster])
                ?.member(path.attributeId, [ElementTag.Attribute]);

            if (modelAttr) {
                // OK cluster doesn't exist at that location, but we do understand semantically, so use limits from the
                // model
                limits = AccessControl(modelAttr as AttributeModel).limits;
            } else {
                // We've got no idea.  This effectively falls back to "view" privilege
                limits = FallbackLimits;
            }
        } else {
            limits = attribute.limits;
        }

        if (hasRemoteActor(this.session)) {
            // Validate access.  Order here prescribed by 1.4 core spec 8.4.3.2
            // We need some fallback location if cluster is not defined
            const location: AccessControl.Location = {
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
                    this.addStatus(path, Status.UnsupportedAccess);
                    return;

                case AccessControl.Authority.Restricted:
                    this.addStatus(path, Status.AccessRestricted);
                    return;

                default:
                    throw new InternalError(`Unsupported authorization state ${permission}`);
            }
        }

        if (endpoint === undefined) {
            this.addStatus(path, Status.UnsupportedEndpoint);
            return;
        }
        if (cluster === undefined) {
            this.addStatus(path, Status.UnsupportedCluster);
            return;
        }
        if (attribute === undefined || !cluster.type.attributes[attribute.id]) {
            this.addStatus(path, Status.UnsupportedAttribute);
            return;
        }
        if (!limits.readable) {
            this.addStatus(path, Status.UnsupportedRead);
            return;
        }

        // Skip if version is unchanged
        const skipVersion = this.#versions?.[path.endpointId]?.[path.clusterId];
        if (skipVersion !== undefined && skipVersion === cluster.version) {
            this.#filteredCount++;
            return;
        }

        // This path contributes an attribute value
        this.#addProducer(function* () {
            // Update internal state for target endpoint
            if (this.#currentEndpoint !== endpoint) {
                if (this.#chunk) {
                    yield this.#chunk;
                    this.#chunk = undefined;
                }
                this.#currentEndpoint = endpoint;
                this.#currentCluster = cluster;
                this.#currentState = cluster.readState(this.session);
            } else if (this.#currentCluster !== cluster) {
                this.#currentCluster = cluster;
                this.#currentState = cluster.readState(this.session);
            } else if (this.#currentState === undefined) {
                this.#currentState = cluster.readState(this.session);
            }

            const value = this.#currentState[attributeId];
            const version = cluster.version;
            logger.debug(
                () => `Reading attribute ${this.node.inspectPath(path)}=${Diagnostic.json(value)} (version=${version})`,
            );
            // Perform actual read of one attribute
            this.#addValue(path, value, version, this.#currentCluster.type.attributes[attributeId]!.tlv);
        });
    }

    /**
     * Starts new chunk or adds to current chunk all values from {@link endpoint} selected by {@link path}.
     *
     * Emits previous chunk if it exists and was not for this endpoint.  This means that our chunk size is one endpoint
     * worth of data, except for the initial error chunk if there are path errors.
     *
     * {@link this.#wildcardPathFlags} to numeric bitmap must be set prior to invocation.
     *
     * TODO - skip endpoints for which subject is unauthorized as optimization
     */
    protected *readEndpointForWildcard(endpoint: EndpointProtocol, path: AttributePath) {
        if (endpoint.wildcardPathFlags & this.#wildcardPathFlags) {
            return;
        }

        if (this.#currentEndpoint !== endpoint) {
            if (this.#chunk) {
                yield this.#chunk;
                this.#chunk = undefined;
            }
            this.#currentEndpoint = endpoint;
            this.#currentCluster = undefined;
        }

        const { clusterId } = path;
        if (clusterId === undefined) {
            for (const cluster of endpoint) {
                this.readClusterForWildcard(cluster, path);
            }
        } else {
            const cluster = endpoint[clusterId];
            if (cluster !== undefined) {
                this.readClusterForWildcard(cluster, path);
            }
        }
    }

    /**
     * Read values from a specific {@link cluster} for a wildcard path.
     *
     * Depends on state initialized by {@link #readEndpointForWildcard}.
     *
     * TODO - skip clusters for which subject is unauthorized
     */
    protected readClusterForWildcard(cluster: ClusterProtocol, path: AttributePath) {
        if (cluster.type.wildcardPathFlags & this.#wildcardPathFlags) {
            return;
        }

        if (this.#currentCluster !== cluster) {
            this.#currentCluster = cluster;
            this.#currentState = undefined;
        }

        const { attributeId } = path;
        const skipVersion = this.#versions?.[this.#guardedCurrentEndpoint.id]?.[cluster.type.id];
        const filteredByVersion = skipVersion !== undefined && skipVersion === cluster.version;

        if (attributeId === undefined) {
            if (filteredByVersion) {
                for (const attribute of cluster.type.attributes) {
                    if (attribute.limits.readable) {
                        this.#filteredCount++;
                    }
                }
                return;
            }
            for (const attribute of cluster.type.attributes) {
                this.readAttributeForWildcard(attribute, path);
            }
        } else {
            if (filteredByVersion) {
                this.#filteredCount++;
                return;
            }
            const attribute = cluster.type.attributes[attributeId];
            if (attribute !== undefined) {
                this.readAttributeForWildcard(attribute, path);
            }
        }
    }

    /**
     * Read values from a specific {@link attribute} for a wildcard path.
     *
     * Depends on state initialized by {@link #readClusterForWildcard}.
     */
    protected readAttributeForWildcard(attribute: AttributeTypeProtocol, path: AttributePath) {
        if (!this.#guardedCurrentCluster.type.attributes[attribute.id]) {
            return;
        }

        if (attribute.wildcardPathFlags & this.#wildcardPathFlags) {
            return;
        }

        if (
            !attribute.limits.readable ||
            (hasRemoteActor(this.session) &&
                this.session.authorityAt(attribute.limits.readLevel, this.#guardedCurrentCluster.location) !==
                    AccessControl.Authority.Granted)
        ) {
            return;
        }

        if (this.#currentState === undefined) {
            this.#currentState = this.#guardedCurrentCluster.readState(this.session);
        }
        const value = this.#currentState[attribute.id];
        if (value === undefined) {
            // Should normally never happen
            logger.warn(`Attribute ${this.node.inspectPath(path)} defined and enabled but has no value.`);
            return;
        }

        this.#addValue(
            {
                ...path,
                endpointId: this.#guardedCurrentEndpoint.id,
                clusterId: this.#guardedCurrentCluster.type.id,
                attributeId: attribute.id,
            },
            this.#currentState[attribute.id],
            this.#guardedCurrentCluster.version,
            attribute.tlv,
        );
    }

    /**
     * Add a function that produces data.  These functions are run after validation of input paths.
     */
    #addProducer(producer: (this: AttributeReadResponse) => Iterable<ReadResult.Chunk>) {
        if (this.#dataProducers) {
            this.#dataProducers.push(producer);
        } else {
            this.#dataProducers = [producer];
        }
    }

    #addReportData(report: ReadResult.Report) {
        if (this.#chunk) {
            this.#chunk.push(report);
        } else {
            this.#chunk = [report];
        }
    }

    /**
     * Add a status value.
     */
    protected addStatus(path: ReadResult.ConcreteAttributePath, status: Status) {
        logger.debug(
            () => `Error reading attribute ${this.node.inspectPath(path)}: Status=${StatusCode[status]}(${status})`,
        );

        const report: ReadResult.AttributeStatus = {
            kind: "attr-status",
            path,
            status,
        };

        this.#addReportData(report);
        this.#statusCount++;
    }

    /**
     * Add an attribute value.
     */
    #addValue(path: ReadResult.ConcreteAttributePath, value: unknown, version: number, tlv: TlvSchema<unknown>) {
        const report: ReadResult.AttributeValue = {
            kind: "attr-value",
            path,
            value,
            version,
            tlv,
        };

        this.#addReportData(report);
        this.#valueCount++;
    }
}
