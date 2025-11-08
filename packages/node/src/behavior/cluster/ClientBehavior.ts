/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterType } from "#types";
import { ClusterBehavior } from "./ClusterBehavior.js";
import { markClientBehavior } from "./cluster-behavior-utils.js";

/**
 * Client view of a {@link ClusterBehavior}.
 *
 * You may use a client behavior to access the type-safe version of a behavior without knowing details of the underlying
 * implementation such as the base class or supported features.
 *
 * For appropriate type safety {@link cluster} must be specify all cluster elements, and those that are not mandatory
 * without features must be marked as optional.
 */
export function ClientBehavior<const T extends ClusterType>(cluster: T): ClusterBehavior.Type<T> {
    const behavior = ClusterBehavior.for(cluster, undefined, `${cluster.name}Client`);

    markClientBehavior(behavior);

    return behavior;
}
