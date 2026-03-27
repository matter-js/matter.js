/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Val } from "@matter/protocol";
import { Internal } from "../state/managed/Internal.js";
import type { ValReference } from "../state/managed/ValReference.js";
import { bareObjectConfigs, GlobalConfig } from "./SupervisionConfig.js";

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
}

/**
 * Get or create the {@link Supervision.Config} for an object.
 */
export function Supervision(object: Val.Struct): Supervision.Config;

/**
 * Get or create a field-level {@link Supervision} for a specific field on an object.
 */
export function Supervision(object: Val.Struct, fieldName: string): Supervision;

export function Supervision(object: Val.Struct, fieldName?: string): Supervision.Config | Supervision {
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
    if (!child.config) {
        child.config = {};
    }
    return child.config;
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
        config?: Supervision;

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
