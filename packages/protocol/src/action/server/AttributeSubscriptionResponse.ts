/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionSession } from "#action/Interactable.js";
import { AttributeTypeProtocol, ClusterProtocol, EndpointProtocol, NodeProtocol } from "#action/protocols.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { InternalError } from "#general";
import { AttributeId, AttributePath, ClusterId, EndpointNumber } from "#types";
import { AttributeReadResponse } from "./AttributeReadResponse.js";

export namespace DirtyState {
    export type ForCluster = {
        [clusterId: ClusterId]: Set<AttributeId>;
    };

    export type ForNode = {
        [endpointId: EndpointNumber]: ForCluster;
    };
}

/**
 * A specialization of {@link AttributeReadResponse} that processes a read/subscribe request with a filter applied to
 * the attributes. Only processes attributes that match the filter.
 */
export class AttributeSubscriptionResponse<
    SessionT extends InteractionSession = InteractionSession,
> extends AttributeReadResponse<SessionT> {
    #dirty: DirtyState.ForNode;
    #currentEndpointDirty?: DirtyState.ForCluster;
    #currentClusterDirty?: Set<number>;

    constructor(node: NodeProtocol, session: SessionT, filter: DirtyState.ForNode) {
        super(node, session);
        this.#dirty = filter;
    }

    get dirty() {
        return this.#dirty;
    }

    /** Guarded accessor for this.#currentEndpointFilter.  This should never be undefined */
    protected get currentEndpointDirty() {
        if (!this.#currentEndpointDirty) {
            throw new InternalError("currentEndpointFilter is not set. Should never happen");
        }
        return this.#currentEndpointDirty;
    }

    /** Guarded accessor for this.#currentCLusterFilter.  This should never be undefined */
    protected get currentClusterDirty() {
        if (!this.#currentClusterDirty) {
            throw new InternalError("currentClusterFilter is not set. Should never happen");
        }
        return this.#currentClusterDirty;
    }

    protected override addConcrete(path: ReadResult.ConcreteAttributePath) {
        const { endpointId, clusterId, attributeId } = path;
        if (this.#dirty[endpointId]?.[clusterId]?.has(attributeId) === undefined) {
            return;
        }
        super.addConcrete(path);
    }

    protected override *readEndpointForWildcard(endpoint: EndpointProtocol, path: AttributePath) {
        this.#currentEndpointDirty = this.#dirty[endpoint.id];
        if (this.#currentEndpointDirty === undefined) {
            return;
        }
        yield* super.readEndpointForWildcard(endpoint, path);
    }

    protected override readClusterForWildcard(cluster: ClusterProtocol, path: AttributePath) {
        this.#currentClusterDirty = this.currentEndpointDirty[cluster.type.id];
        if (this.#currentClusterDirty === undefined) {
            return;
        }
        super.readClusterForWildcard(cluster, path);
    }

    protected override readAttributeForWildcard(attribute: AttributeTypeProtocol, path: AttributePath) {
        if (!this.currentClusterDirty.has(attribute.id)) {
            return;
        }
        super.readAttributeForWildcard(attribute, path);
    }

    protected override addStatus() {
        // For Filtered responses we suppress all status reports
    }
}
