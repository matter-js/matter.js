/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, Matter } from "@matter/model";
import { ClusterType } from "./ClusterType.js";
import { ClusterTypeOfModel } from "./ClusterTypeOfModel.js";

const customClusters = {} as { [id: number]: ClusterType };
const modelCache = new WeakMap<ClusterModel, ClusterType>();

/**
 * The formal definitions of clusters in Matter.js are generated programmatically.
 *
 * This singleton acts as a registry for generated {@link ClusterType}s.
 */
export namespace ClusterRegistry {
    /**
     * Obtain a cluster for a given ID.
     *
     * Checks custom clusters first, then generates from the Matter model on demand.
     */
    export function get(id: number): ClusterType | undefined {
        const custom = customClusters[id];
        if (custom !== undefined) {
            return custom;
        }

        const model = Matter.clusters(id);
        if (model === undefined) {
            return undefined;
        }

        let cluster = modelCache.get(model);
        if (cluster === undefined) {
            cluster = ClusterTypeOfModel(model);
            modelCache.set(model, cluster);
        }

        return cluster;
    }

    /**
     * Obtain a cluster name for a given ID without constructing a full ClusterType.
     */
    export function getName(id: number): string | undefined {
        const custom = customClusters[id];
        if (custom !== undefined) {
            return custom.name;
        }

        return Matter.clusters(id)?.name;
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

        customClusters[cluster.id] = cluster;
    }
}
