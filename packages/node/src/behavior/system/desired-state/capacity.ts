/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AclCapacityExceededError,
    CapacityExceededError,
    GroupCapacityExceededError,
    GroupKeyCapacityExceededError,
} from "./errors.js";
import type { CapacityInfo } from "./ItemKind.js";

/** Observed per-fabric device limits, keyed by item kind. */
export type CapacityCache = Record<string, CapacityInfo>;

type CapacityErrorCtor = new (kind: string, limit: number, used: number, requested: number) => CapacityExceededError;

const CAPACITY_ERROR_BY_KIND: Record<string, CapacityErrorCtor> = {
    acl: AclCapacityExceededError,
    group: GroupCapacityExceededError,
    groupKey: GroupKeyCapacityExceededError,
};

export function assertCapacity(kind: string, cache: CapacityCache, requested = 1): void {
    const info = cache[kind];
    if (info === undefined) {
        return;
    }
    if (info.used + requested > info.limit) {
        const Ctor = CAPACITY_ERROR_BY_KIND[kind] ?? CapacityExceededError;
        throw new Ctor(kind, info.limit, info.used, requested);
    }
}
