/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#util/Type.js";

export type NumberId = Branded<number, "NumberId">;
export function NumberId(numberId: number): NumberId {
    return numberId as NumberId;
}

export type BigintId = Branded<bigint, "BigintId">;
export function BigintId(bigintId: bigint): BigintId {
    return bigintId as BigintId;
}
