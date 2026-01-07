/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterType } from "./ClusterType.js";

const registered = {} as { [id: number]: ClusterType };

/**
 * The formal definitions of clusters in Matter.js are generated programmatically.
 *
 * This singleton acts as a registry for generated {@link ClusterType}s.
 */
export namespace ClusterRegistry {
    /**
     * Obtain a cluster for a given ID.
     */
    export function get(id: number): ClusterType | undefined {
        return registered[id];
    }

    /**
     * Register a cluster for global access.
     */
    export function register(cluster: ClusterType) {
        if (!cluster) {
            return;
        }

        if (cluster.id === undefined) {
            return;
        }

        registered[cluster.id] = cluster;
    }
}
