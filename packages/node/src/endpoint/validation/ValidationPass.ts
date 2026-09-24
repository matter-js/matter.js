/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter, MatterModel } from "@matter/model";

/**
 * One run of device type validation over one or more endpoints, resolved in {@link model}.
 *
 * The checks of a pass share what several endpoints read from the tree: the facts of each endpoint, the conditions
 * of each node scope and the composition facts of each composing endpoint. Judging the endpoints of a node scope one
 * by one otherwise repeats that work per endpoint.
 *
 * A pass must not outlive one synchronous run. The tree may change between runs, and nothing a pass memoizes of it is
 * invalidated. A lookup that reads only {@link model} — the cluster, feature or element a requirement names, for
 * example — outlives the pass and is shared with every other pass resolved in the same model; see {@link ModelMemo}.
 *
 * Mutating a model in place after it has validated an endpoint is unsupported: {@link ModelMemo} keys its entries by
 * model instance, not content, so a mutated model keeps serving lookups from before the mutation. Build a new model
 * instead, e.g. with {@link MatterModel.withClusters}, which already returns a copy.
 */
export class ValidationPass {
    readonly model: MatterModel;

    constructor(model: MatterModel = Matter) {
        this.model = model;
    }
}

export namespace ValidationPass {
    /**
     * Values computed at most once per {@link ValidationPass} and key.
     */
    export class Memo<K, V> {
        #tables = new WeakMap<ValidationPass, Map<K, { value: V }>>();

        /**
         * The value for {@link key} in {@link pass}, computed by {@link compute} on first use.
         */
        get(pass: ValidationPass, key: K, compute: () => V): V {
            let table = this.#tables.get(pass);
            if (table === undefined) {
                table = new Map();
                this.#tables.set(pass, table);
            }

            let entry = table.get(key);
            if (entry === undefined) {
                entry = { value: compute() };
                table.set(key, entry);
            }
            return entry.value;
        }
    }

    /**
     * Values computed at most once per {@link MatterModel} instance and key, shared by every {@link ValidationPass}
     * resolved in that model.
     *
     * Reserved for a lookup whose result is a pure function of the model and the key: resolving a requirement to the
     * cluster, feature or element it names, a device type's conditions, and similar. A tree-derived fact never
     * belongs here.
     *
     * Keyed on the model instance, so a model built by {@link MatterModel.withClusters} — a copy, per its contract —
     * never sees another model's entries. The outer table is a {@link WeakMap}, so discarding a model discards its
     * entries with it.
     */
    export class ModelMemo<K, V> {
        #tables = new WeakMap<MatterModel, Map<K, { value: V }>>();

        /**
         * The value for {@link key} in {@link model}, computed by {@link compute} on first use.
         */
        get(model: MatterModel, key: K, compute: () => V): V {
            let table = this.#tables.get(model);
            if (table === undefined) {
                table = new Map();
                this.#tables.set(model, table);
            }

            let entry = table.get(key);
            if (entry === undefined) {
                entry = { value: compute() };
                table.set(key, entry);
            }
            return entry.value;
        }
    }
}
