/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";

/**
 * Create a non-functional instance of a {@link Behavior} for introspection purposes.
 */
export function introspectionInstanceOf(type: Behavior.Type) {
    return new (type as unknown as new () => Record<string, (...args: any[]) => any>)();
}

/**
 * The extension interface for a behavior.
 */
export type ExtensionInterfaceOf<B extends Behavior.Type> = B extends { ExtensionInterface: infer I extends {} }
    ? I
    : {};

const isClient = Symbol("is-client");

/**
 * Type-level brand for cluster client behaviors.
 *
 * The brand is published as a separate exported alias so consumer `.d.ts` files can name it via
 * `typeof clientBrand` without needing to serialize the underlying `unique symbol` declaration.
 */
export const clientBrand = isClient;

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
export function isClientBehavior(type: Behavior.Type): boolean {
    // Use hasOwn so any derivation voids the client assertion
    return !!(type as ClientBehaviorType)[isClient] && Object.hasOwn(type, isClient);
}
