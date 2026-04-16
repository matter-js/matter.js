/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Val } from "@matter/protocol";
import { Internal } from "../state/managed/Internal.js";
import type { ValReference } from "../state/managed/ValReference.js";
import type { Supervision } from "./Supervision.js";

/**
 * Global configuration that persists across sessions.  Children are lazily created and cached.
 */
export class GlobalConfig implements Supervision.Config {
    #supervision?: Supervision;
    #children?: Map<string | number, GlobalConfig>;

    get supervision() {
        return this.#supervision;
    }

    set supervision(supervision: Supervision | undefined) {
        this.#supervision = supervision;
    }

    child(key: string | number): GlobalConfig {
        if (this.#children === undefined) {
            this.#children = new Map();
        }

        let child = this.#children.get(key);
        if (child === undefined) {
            child = new GlobalConfig();
            this.#children.set(key, child);
        }
        return child;
    }

    readonlyChild(key: string | number): GlobalConfig | undefined {
        return this.#children?.get(key);
    }

    /**
     * Iterate over all existing children.
     */
    forEachChild(fn: (key: string | number, child: GlobalConfig) => void) {
        this.#children?.forEach((child, key) => fn(key, child));
    }
}

/**
 * Session-scoped configuration that wraps a {@link GlobalConfig}.  Local overrides shadow global values.
 */
export class LocalConfig implements Supervision.Config {
    #global: GlobalConfig;
    #localSupervision?: Supervision;
    #hasLocalSupervision = false;
    #children?: Map<string | number, LocalConfig>;

    constructor(global: GlobalConfig) {
        this.#global = global;
    }

    get supervision() {
        if (this.#hasLocalSupervision) {
            return this.#localSupervision;
        }
        return this.#global.supervision;
    }

    set supervision(supervision: Supervision | undefined) {
        this.#localSupervision = supervision;
        this.#hasLocalSupervision = true;
    }

    child(key: string | number): LocalConfig {
        if (this.#children === undefined) {
            this.#children = new Map();
        }

        let child = this.#children.get(key);
        if (child === undefined) {
            child = new LocalConfig(this.#global.child(key));
            this.#children.set(key, child);
        }
        return child;
    }

    readonlyChild(key: string | number): LocalConfig | undefined {
        const globalChild = this.#global.readonlyChild(key);
        if (globalChild === undefined) {
            return this.#children?.get(key);
        }

        let child = this.#children?.get(key);
        if (child === undefined) {
            child = new LocalConfig(globalChild);
            if (this.#children === undefined) {
                this.#children = new Map();
            }
            this.#children.set(key, child);
        }
        return child;
    }
}

/**
 * Non-allocating lookup of the {@link Supervision.Config} for an object.  Returns undefined if unconfigured.
 */
export function maybeConfigOf(object: Val.Struct): Supervision.Config | undefined;

/**
 * Non-allocating lookup of field-level {@link Supervision} for a specific field.  Returns undefined if unconfigured.
 */
export function maybeConfigOf(object: Val.Struct, fieldName: string): Supervision | undefined;

/**
 * Non-allocating lookup of command-level config for a behavior constructor.  Walks the prototype chain.
 */
export function maybeConfigOf(constructor: Function, methodName: string): Supervision.Config | undefined;

export function maybeConfigOf(
    objectOrConstructor: Val.Struct | Function,
    fieldName?: string,
): Supervision.Config | Supervision | undefined {
    if (typeof objectOrConstructor === "function") {
        return maybeConfigOfConstructor(objectOrConstructor.prototype, fieldName!);
    }

    return maybeConfigOfObject(objectOrConstructor, fieldName);
}

function maybeConfigOfObject(object: Val.Struct, fieldName?: string): Supervision.Config | Supervision | undefined {
    let config: Supervision.Config | undefined;

    const ref = (object as Record<symbol, unknown>)[Internal.reference] as ValReference | undefined;
    if (ref) {
        config = ref.supervisionConfig;
    } else {
        config = bareObjectConfigs.get(object);
    }

    if (config === undefined) {
        return undefined;
    }

    if (fieldName === undefined) {
        return config;
    }

    return config.readonlyChild(fieldName)?.supervision;
}

/**
 * Module-level storage for bare (unmanaged) objects.  Shared with {@link Supervision} factory.
 */
export const bareObjectConfigs = new WeakMap<object, GlobalConfig>();

/**
 * Module-level storage for per-command configs keyed by behavior prototype.
 *
 * Key: `constructor.prototype`; value: map from method name → {@link GlobalConfig} tree.
 */
export const commandSupervisionConfigs = new WeakMap<object, Map<string, GlobalConfig>>();

/**
 * Non-allocating lookup of the command-level config for a behavior constructor.  Walks the prototype chain and merges
 * configs from base classes (earliest prototype provides defaults, later prototypes overlay).
 */
export function maybeConfigOfConstructor(prototype: object, methodName: string): GlobalConfig | undefined {
    // Collect configs from prototype chain (most-derived first)
    const chain = [] as GlobalConfig[];
    let current: object | null = prototype;
    while (current !== null) {
        const map = commandSupervisionConfigs.get(current);
        if (map !== undefined) {
            const config = map.get(methodName);
            if (config !== undefined) {
                chain.push(config);
            }
        }
        current = Object.getPrototypeOf(current);
    }

    if (chain.length === 0) {
        return undefined;
    }

    if (chain.length === 1) {
        return chain[0];
    }

    // Merge: base first, then derived overlays
    return mergeConfigs(chain.reverse());
}

function mergeConfigs(configs: GlobalConfig[]): GlobalConfig {
    const merged = new GlobalConfig();

    for (const source of configs) {
        mergeConfigInto(merged, source);
    }

    return merged;
}

function mergeConfigInto(target: GlobalConfig, source: GlobalConfig) {
    if (source.supervision !== undefined) {
        target.supervision = { ...target.supervision, ...source.supervision };
    }

    // Walk source children and merge recursively
    source.forEachChild((key, child) => {
        mergeConfigInto(target.child(key), child);
    });
}
