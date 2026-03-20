/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterNamespace } from "@matter/types";
import { ClusterBehavior } from "./ClusterBehavior.js";
import { markClientBehavior } from "./cluster-behavior-utils.js";

/**
 * Client view of a {@link ClusterBehavior}.
 *
 * You may use a client behavior to access the type-safe version of a behavior without knowing details of the underlying
 * implementation such as the base class or supported features.
 *
 * For appropriate type safety {@link cluster} must specify all cluster elements, and those that are not mandatory
 * without features must be marked as optional.
 */
export function ClientBehavior<const NS extends ClusterNamespace>(
    ns: NS,
): ClusterBehavior.Complete<typeof ClusterBehavior, NS> {
    const schema = (ns as { schema?: { name?: string } }).schema;
    const behavior = ClusterBehavior.for(ns, undefined, `${schema?.name ?? "Unknown"}Client`);

    markClientBehavior(behavior as ClusterBehavior.Type);

    return behavior as any;
}
