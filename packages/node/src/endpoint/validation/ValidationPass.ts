/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter, MatterModel } from "@matter/model";

/**
 * One run of device type validation over one or more endpoints, resolved in {@link model}.
 *
 * The checks of a pass share what several endpoints read: the facts of each endpoint, the conditions of each node
 * scope, the composition facts of each composing endpoint and the names each requirement may reference. Judging the
 * endpoints of a node scope one by one otherwise repeats that work per endpoint.
 *
 * A pass must not outlive one synchronous run. The tree and the model may change between runs, and nothing a pass
 * memoizes is invalidated.
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
}
