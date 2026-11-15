/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
import { Metatype } from "../common/Metatype.js";
import type { ClusterModel } from "../models/ClusterModel.js";
import type { ValueModel } from "../models/ValueModel.js";

/**
 * Removes values marked {@link ValueModel.effectiveIsSecret} from data before it is logged.
 *
 * The redacting functions return their input unchanged while {@link Logger.redactSecrets} is false.
 */
export namespace SecretRedaction {
    /**
     * The text that replaces each secret value in the output of {@link redact}.
     */
    export const PLACEHOLDER = "(redacted)";

    const containsSecretCache = new WeakMap<ValueModel, boolean>();

    /**
     * Return {@link value} with every value that {@link model} marks as secret replaced by {@link PLACEHOLDER}.
     *
     * The result is a copy wherever a secret was replaced, so the secret is not reachable from it.  The input is not
     * modified.  Without a model or without a secret in the model the input is returned as is.  Properties the model
     * does not define stay unchanged.
     */
    export function redact(model: ValueModel | undefined, value: unknown): unknown {
        if (!Logger.redactSecrets || model === undefined || !containsSecret(model)) {
            return value;
        }
        return redactValue(model, value);
    }

    /**
     * {@link redact} for a single entry of the list {@link listModel} describes, such as an entry a chunked write
     * appends.  The entry is replaced if the list itself is secret.
     */
    export function redactEntry(listModel: ValueModel | undefined, entry: unknown): unknown {
        if (Logger.redactSecrets && listModel?.effectiveIsSecret && entry !== undefined && entry !== null) {
            return PLACEHOLDER;
        }
        return redact(listModel?.listEntry, entry);
    }

    /**
     * {@link redact} for attribute values of {@link cluster} keyed by property name, such as the state of a cluster.
     */
    export function redactAttributes(cluster: ClusterModel, values: object): object {
        const attributes = [...cluster.attributes];
        if (!Logger.redactSecrets || !attributes.some(containsSecret)) {
            return values;
        }
        return redactProperties(attributes, values);
    }

    /**
     * Whether {@link model} or any of its members, at any depth, is secret.
     *
     * Results are cached per model, so a model must be marked secret before data of it is first redacted.
     */
    export function containsSecret(model: ValueModel): boolean {
        let result = containsSecretCache.get(model);
        if (result === undefined) {
            result = searchSecret(model, new Set());
            containsSecretCache.set(model, result);
        }
        return result;
    }

    function searchSecret(model: ValueModel, visiting: Set<ValueModel>): boolean {
        if (model.effectiveIsSecret) {
            return true;
        }
        if (visiting.has(model)) {
            return false;
        }
        visiting.add(model);
        for (const child of childModelsOf(model)) {
            if (searchSecret(child, visiting)) {
                return true;
            }
        }
        return false;
    }

    function redactValue(model: ValueModel, value: unknown): unknown {
        if (value === undefined || value === null) {
            return value;
        }

        if (model.effectiveIsSecret) {
            return PLACEHOLDER;
        }

        if (!containsSecret(model)) {
            return value;
        }

        switch (model.effectiveMetatype) {
            case Metatype.array: {
                const entry = model.listEntry;
                if (entry === undefined || !Array.isArray(value)) {
                    return value;
                }
                return value.map(item => redactValue(entry, item));
            }

            case Metatype.object: {
                if (typeof value !== "object" || Array.isArray(value)) {
                    return value;
                }
                return redactProperties(model.members, value);
            }
        }

        return value;
    }

    function redactProperties(members: Iterable<ValueModel>, value: object) {
        const result: Record<string, unknown> = { ...value };
        for (const member of members) {
            const name = member.propertyName;
            if (name in result) {
                result[name] = redactValue(member, result[name]);
            }
        }
        return result;
    }

    function childModelsOf(model: ValueModel): Iterable<ValueModel> {
        switch (model.effectiveMetatype) {
            case Metatype.array: {
                const entry = model.listEntry;
                return entry === undefined ? [] : [entry];
            }

            case Metatype.object:
                return model.members;
        }
        return [];
    }
}
