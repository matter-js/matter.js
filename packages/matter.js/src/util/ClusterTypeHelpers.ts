/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterType, TypeFromSchema } from "@matter/types";

/**
 * Legacy compat: extract attribute value properties from a ClusterType.
 * Equivalent to the removed ClusterState.PropertiesOf.
 */
export type ClusterStatePropertiesOf<C> = PropertiesOfAttributes<ClusterType.AttributesOf<C>>;

type PropertiesOfAttributes<A extends Record<string, ClusterType.Attribute>> = {
    -readonly [N in keyof A as A[N] extends { fixed: true }
        ? never
        : A[N] extends { optional: true }
          ? never
          : N]: TypeFromSchema<A[N]["schema"]>;
} & {
    -readonly [N in keyof A as A[N] extends { fixed: true }
        ? never
        : A[N] extends { optional: true }
          ? N
          : never]?: TypeFromSchema<A[N]["schema"]>;
} & {
    -readonly [N in keyof A as A[N] extends { fixed: true }
        ? A[N] extends { optional: true }
            ? never
            : N
        : never]: TypeFromSchema<A[N]["schema"]>;
} & {
    -readonly [N in keyof A as A[N] extends { fixed: true }
        ? A[N] extends { optional: true }
            ? N
            : never
        : never]?: TypeFromSchema<A[N]["schema"]>;
};
