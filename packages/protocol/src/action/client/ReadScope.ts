/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Read } from "#action/request/Read.js";
import { ClusterId, EndpointNumber } from "#types";

/**
 * This utility tells you whether a given endpoint/cluster is in scope for a read.
 */
export interface ReadScope {
    /**
     * Is a cluster included in the read?
     *
     * This is useful to determine if the read should include a version filter.
     */
    isRelevant(endpoint: EndpointNumber, cluster: ClusterId): boolean;

    /**
     * Are all attributes in a cluster included in a read?
     *
     * This is useful to determine if the cluster's version should be updated in response to a read.
     */
    isWildcard(endpoint: EndpointNumber, cluster: ClusterId): boolean;

    /**
     * Was the read returned data filtered by fabric?
     */
    isFabricFiltered: boolean;
}

interface Check {
    (endpoint: EndpointNumber, cluster: ClusterId): boolean;
}

export function ReadScope(read: Read): ReadScope {
    return {
        isRelevant(endpoint, cluster) {
            this.isRelevant = generateScopeTester(read, "any");
            return this.isRelevant(endpoint, cluster);
        },

        isWildcard(endpoint, cluster) {
            this.isWildcard = generateScopeTester(read, "all");
            return this.isWildcard(endpoint, cluster);
        },

        isFabricFiltered: read.isFabricFiltered ?? true,
    };
}

function generateScopeTester(read: Read, attrRequirement: "any" | "all"): Check {
    if (!read.attributeRequests?.length) {
        return isNever;
    }

    let wildcardEndpointClusters: undefined | Set<ClusterId>;
    let specificEndpointClusters: undefined | Record<EndpointNumber, true | Set<ClusterId>>;

    for (const { endpointId, clusterId, attributeId } of read.attributeRequests) {
        // Ignore path if it addresses a specific attribute and we are only interested in wildcard attributes
        if (attributeId !== undefined && attrRequirement === "all") {
            continue;
        }

        // Wildcard endpoint
        if (endpointId === undefined) {
            // Full wildcard read; short-circuit all subsequent logic
            if (clusterId === undefined) {
                return isAlways;
            }

            // Wildcard cluster across all endpoints
            (wildcardEndpointClusters ??= new Set()).add(clusterId);
            continue;
        }

        // Specific endpoint with wildcard cluster cases
        if (clusterId === undefined) {
            (specificEndpointClusters ??= {})[endpointId] = true;
            continue;
        }

        // Specific endpoint and cluster
        if (attributeId === undefined) {
            let ep = specificEndpointClusters?.[endpointId];
            if (ep === true) {
                continue;
            }
            if (ep === undefined) {
                ep = (specificEndpointClusters ??= {})[endpointId] = new Set();
            }
            ep.add(clusterId);
        }
    }

    return (endpoint, cluster) => {
        if (wildcardEndpointClusters?.has(cluster)) {
            return true;
        }
        const ep = specificEndpointClusters?.[endpoint];
        return ep === true || !!ep?.has(cluster);
    };
}

function isNever() {
    return false;
}

function isAlways() {
    return true;
}
