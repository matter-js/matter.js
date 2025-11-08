/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterType } from "#types";

/**
 * Create a non-functional instance of a {@link Behavior} for introspection purposes.
 */
export function introspectionInstanceOf(type: Behavior.Type) {
    return new (type as unknown as new () => Record<string, (...args: any[]) => any>)();
}

/**
 * The cluster type for a behavior.
 */
export type ClusterOf<B extends Behavior.Type> = B extends { cluster: infer C extends ClusterType }
    ? C
    : ClusterType.Unknown;

/**
 * The extension interface for a behavior.
 */
export type ExtensionInterfaceOf<B extends Behavior.Type> = B extends { ExtensionInterface: infer I extends {} }
    ? I
    : {};

const isClient = Symbol("is-client");

type ClientBehaviorType = { [isClient]?: boolean };

/**
 * Mark a behavior as a cluster client.
 */
export function markClientBehavior(type: Behavior.Type) {
    (type as ClientBehaviorType)[isClient] = true;
}

/**
 * Test whether a behavior is a cluster client.
 */
export function isClientBehavior(type: Behavior.Type) {
    // Use hasOwn so any derivation voids the client assertion
    return (type as ClientBehaviorType)[isClient] && Object.hasOwn(type, isClient);
}
