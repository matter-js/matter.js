/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Schema } from "#model";
import { ClusterType } from "#types";
import type { ClusterBehavior } from "./ClusterBehavior.js";

const behaviorCache = new WeakMap<
    Behavior.Type,
    WeakMap<ClusterType, WeakMap<Schema, WeakRef<ClusterBehavior.Type<any>>>>
>();

const clientCache = new WeakMap<
    Behavior.Type,
    WeakMap<ClusterType, WeakMap<Schema, WeakRef<ClusterBehavior.Type<any>>>>
>();

/**
 * To save memory we cache behavior implementations specialized for specific clusters.  This allows for efficient
 * configuration of behaviors with conditional runtime logic.
 *
 * We use the cluster and schema as cache keys so this relies on similar caching for those items.
 */
export namespace ClusterBehaviorCache {
    export function get(cluster: ClusterType, base: Behavior.Type, schema: Schema, forClient?: boolean) {
        const cache = forClient ? clientCache : behaviorCache;

        const baseCache = cache.get(base);
        if (baseCache === undefined) {
            return;
        }

        const clusterCache = baseCache.get(cluster);
        if (clusterCache === undefined) {
            return;
        }

        return clusterCache.get(schema)?.deref();
    }

    export function set(cluster: ClusterType, base: Behavior.Type, schema: Schema, type: ClusterBehavior.Type) {
        let baseCache = behaviorCache.get(base);
        if (baseCache === undefined) {
            behaviorCache.set(base, (baseCache = new WeakMap()));
        }

        let clusterCache = baseCache.get(cluster);
        if (clusterCache === undefined) {
            baseCache.set(cluster, (clusterCache = new WeakMap()));
        }

        clusterCache.set(schema, new WeakRef(type));
    }
}
