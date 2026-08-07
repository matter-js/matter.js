/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Schema } from "@matter/model";
import type { ClusterBehavior } from "./ClusterBehavior.js";

type SchemaCache = WeakMap<Schema, WeakMap<object, WeakRef<ClusterBehavior.Type>>>;

const behaviorCache = new WeakMap<Behavior.Type, SchemaCache>();

const clientCache = new WeakMap<Behavior.Type, SchemaCache>();

/**
 * To save memory we cache behavior implementations specialized for specific clusters.  This allows for efficient
 * configuration of behaviors with conditional runtime logic.
 *
 * We key on the schema, the namespace and the client/server distinction because each is visible on the generated type.
 * Keying on schema alone would hand a caller a type reporting a different {@link ClusterBehavior.cluster}.  This relies
 * on similar caching for schemas.
 */
export namespace ClusterBehaviorCache {
    export function get(base: Behavior.Type, schema: Schema, namespace: object, forClient?: boolean) {
        const cache = forClient ? clientCache : behaviorCache;

        return cache.get(base)?.get(schema)?.get(namespace)?.deref();
    }

    export function set(
        base: Behavior.Type,
        schema: Schema,
        namespace: object,
        type: ClusterBehavior.Type,
        forClient?: boolean,
    ) {
        const cache = forClient ? clientCache : behaviorCache;

        let schemaCache = cache.get(base);
        if (schemaCache === undefined) {
            cache.set(base, (schemaCache = new WeakMap()));
        }

        let namespaceCache = schemaCache.get(schema);
        if (namespaceCache === undefined) {
            schemaCache.set(schema, (namespaceCache = new WeakMap()));
        }

        namespaceCache.set(namespace, new WeakRef(type));
    }
}
