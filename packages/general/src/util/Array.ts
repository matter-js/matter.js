/**
 * Array types
 *
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type AtLeastOne<T> = ArrayMinLength<T, 1>;

type BuildArrayMinLength<T, N extends number, Current extends T[]> = Current["length"] extends N
    ? [...Current, ...T[]]
    : BuildArrayMinLength<T, N, [...Current, T]>;

export type ArrayMinLength<T, N extends number> = BuildArrayMinLength<T, N, []>;
