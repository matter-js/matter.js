/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Val } from "@matter/protocol";
import { Internal } from "../state/managed/Internal.js";
import type { ValReference } from "../state/managed/ValReference.js";
import { bareObjectConfigs, commandSupervisionConfigs, GlobalConfig } from "./SupervisionConfig.js";

/**
 * Granular validation configuration.
 *
 * You can use the {@link Supervision} factory to configure validation on any JavaScript object or object property.
 *
 * {@link conformance} and {@link constraint} are surgical — they disable a single validation phase for one value
 * without affecting children.
 *
 * {@link validate} is a blunt instrument — it disables all validation for the value and its entire subtree.  For
 * structs this means no child is visited; for lists no entry is validated.
 */
export interface Supervision {
    /**
     * Master toggle.  When false, disables conformance validation, constraint validation, and type-specific
     * validation for this value and its entire subtree.
     */
    validate?: boolean;

    /**
     * When false, disables conformance validation for this specific value only.  Child fields are unaffected.
     */
    conformance?: boolean;

    /**
     * When false, disables constraint validation for this specific value only.  Child fields are unaffected.
     */
    constraint?: boolean;

    /**
     * Intercept validation errors.
     *
     * * **Throw** — error propagates (rethrow original, or throw a different error such as
     *   {@link StatusResponse.InvalidCommandError} or {@link OkResponseError})
     * * **Return** — error is ignored; processing continues with unvalidated data
     */
    onValidationError?: (error: Error) => void;
}

/**
 * Get or create the {@link Supervision.Config} for an object.
 */
export function Supervision(object: Val.Struct): Supervision.Config;

/**
 * Get or create a field-level {@link Supervision} for a specific field on an object.
 */
export function Supervision<T extends Val.Struct>(object: T, fieldName: keyof T & string): Supervision;

/**
 * Get or create the command-level {@link Supervision} for a behavior constructor and method.
 */
export function Supervision(constructor: Function, methodName: string): Supervision;

/**
 * Get or create field-level {@link Supervision} for a specific field of a command on a behavior constructor.
 */
export function Supervision(constructor: Function, methodName: string, ...fieldPath: string[]): Supervision;

export function Supervision(
    target: Val.Struct | Function,
    nameOrMethod?: string,
    ...fieldPath: string[]
): Supervision.Config | Supervision {
    if (typeof target === "function") {
        return supervisionForConstructor(target, nameOrMethod!, fieldPath);
    }

    return supervisionForObject(target, nameOrMethod);
}

function supervisionForObject(object: Val.Struct, fieldName?: string): Supervision.Config | Supervision {
    let config: Supervision.Config;

    const ref = (object as Record<symbol, unknown>)[Internal.reference] as ValReference | undefined;
    if (ref) {
        if (!ref.supervisionConfig) {
            ref.supervisionConfig = new GlobalConfig();
        }
        config = ref.supervisionConfig;
    } else {
        let existing = bareObjectConfigs.get(object);
        if (!existing) {
            existing = new GlobalConfig();
            bareObjectConfigs.set(object, existing);
        }
        config = existing;
    }

    if (fieldName === undefined) {
        return config;
    }

    const child = config.child(fieldName);
    if (!child.supervision) {
        child.supervision = {};
    }
    return child.supervision;
}

function supervisionForConstructor(
    constructor: Function,
    methodName: string,
    fieldPath: string[],
): Supervision.Config | Supervision {
    const prototype = constructor.prototype;

    let map = commandSupervisionConfigs.get(prototype);
    if (map === undefined) {
        map = new Map();
        commandSupervisionConfigs.set(prototype, map);
    }

    let config = map.get(methodName);
    if (config === undefined) {
        config = new GlobalConfig();
        map.set(methodName, config);
    }

    if (fieldPath.length === 0) {
        if (!config.supervision) {
            config.supervision = {};
        }
        return config.supervision;
    }

    let current = config;
    for (const segment of fieldPath) {
        current = current.child(segment);
    }

    if (!current.supervision) {
        current.supervision = {};
    }
    return current.supervision;
}

/**
 * Controls whether supervision config mutations apply globally or only for the current session.
 */
export type SupervisionMode = "local" | "global";

export namespace Supervision {
    /**
     * Hierarchical container for {@link Supervision} configuration.
     *
     * Navigable by field name or list index to retrieve child configs.
     */
    export interface Config {
        /**
         * The supervision settings for this node.
         */
        supervision?: Supervision;

        /**
         * Get or create a child config for the given key.  Creates persistent children.
         */
        child(key: string | number): Config;

        /**
         * Read-only lookup of an existing child config.  Returns undefined if no child exists.
         */
        readonlyChild(key: string | number): Config | undefined;
    }
}
