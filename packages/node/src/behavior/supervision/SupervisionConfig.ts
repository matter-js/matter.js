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
    #config?: Supervision;
    #children?: Map<string | number, GlobalConfig>;

    get config() {
        return this.#config;
    }

    set config(config: Supervision | undefined) {
        this.#config = config;
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
}

/**
 * Session-scoped configuration that wraps a {@link GlobalConfig}.  Local overrides shadow global values.
 */
export class LocalConfig implements Supervision.Config {
    #global: GlobalConfig;
    #localConfig?: Supervision;
    #hasLocalConfig = false;
    #children?: Map<string | number, LocalConfig>;

    constructor(global: GlobalConfig) {
        this.#global = global;
    }

    get config() {
        if (this.#hasLocalConfig) {
            return this.#localConfig;
        }
        return this.#global.config;
    }

    set config(config: Supervision | undefined) {
        this.#localConfig = config;
        this.#hasLocalConfig = true;
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

export function maybeConfigOf(object: Val.Struct, fieldName?: string): Supervision.Config | Supervision | undefined {
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

    return config.readonlyChild(fieldName)?.config;
}

/**
 * Module-level storage for bare (unmanaged) objects.  Shared with {@link Supervision} factory.
 */
export const bareObjectConfigs = new WeakMap<object, GlobalConfig>();
