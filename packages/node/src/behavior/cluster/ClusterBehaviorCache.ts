/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Schema } from "@matter/model";
import type { ClusterBehavior } from "./ClusterBehavior.js";

const behaviorCache = new WeakMap<Behavior.Type, WeakMap<Schema, WeakRef<ClusterBehavior.Type>>>();

const clientCache = new WeakMap<Behavior.Type, WeakMap<Schema, WeakRef<ClusterBehavior.Type>>>();

/**
 * To save memory we cache behavior implementations specialized for specific clusters.  This allows for efficient
 * configuration of behaviors with conditional runtime logic.
 *
 * We use the schema as the cache key so this relies on similar caching for schemas.
 */
export namespace ClusterBehaviorCache {
    export function get(base: Behavior.Type, schema: Schema, forClient?: boolean) {
        const cache = forClient ? clientCache : behaviorCache;

        const baseCache = cache.get(base);
        if (baseCache === undefined) {
            return;
        }

        return baseCache.get(schema)?.deref();
    }

    export function set(base: Behavior.Type, schema: Schema, type: ClusterBehavior.Type) {
        let baseCache = behaviorCache.get(base);
        if (baseCache === undefined) {
            behaviorCache.set(base, (baseCache = new WeakMap()));
        }

        baseCache.set(schema, new WeakRef(type));
    }
}
