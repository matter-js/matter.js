/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "#general";
import { Model } from "../models/Model.js";

/**
 * An read-only array of models with support for efficient lookup by name and ID.
 *
 * Name search uses canonical camel case, so "FooBar", "fooBar" and "foo-bar" are considered equivalent.
 */
export interface ModelIndex<T extends Model = Model> extends ReadonlyArray<T> {
    /**
     * Retrieve a model for the given ID or name.
     *
     * Use the two-parameter version for indices that contain multiple model types.
     */
    for(key: number | string): T | undefined;

    /**
     * Retrieve a model of the specific type for the given ID or name.
     *
     * Name search uses canonical camel case.
     */
    for<M extends T>(key: number | string, type: Model.Type<M>): M | undefined;

    /**
     * Filter to a specific model subtype.
     */
    ofType<M extends T>(type: Model.Type<M>): M[];
}

/**
 * Implementation of {@link ModelIndex} used for initial creation.
 */
export class MutableModelIndex<T extends Model = Model> extends Array<T> implements ModelIndex {
    #nameIndex?: Map<string, T | T[]>;
    #idIndex?: Map<number, T | T[]>;

    for(key: number | string): T;
    for<M extends T>(key: number | string, type: Model.Type<M>): M;

    for(key: number | string, type?: Model.Type): Model | undefined {
        let untyped: undefined | Model | Model[];

        if (typeof key === "number") {
            untyped = this.#ids.get(key);
        } else {
            untyped = this.#names.get(camelize(key));
        }

        if (untyped === undefined) {
            return undefined;
        }

        if (Array.isArray(untyped)) {
            if (type) {
                return untyped.find(m => m instanceof type);
            }
            return untyped[0];
        }

        if (type && !(untyped instanceof type)) {
            return undefined;
        }

        return untyped;
    }

    ofType<T extends Model.Type>(type: T): InstanceType<T>[] {
        return this.filter(m => m instanceof type) as InstanceType<T>[];
    }

    get #ids() {
        if (this.#idIndex) {
            return this.#idIndex;
        }

        const index = (this.#idIndex = new Map<number, T | T[]>());
        for (const model of this) {
            if (model.id === undefined) {
                continue;
            }

            const already = index.get(model.id);
            if (already) {
                if (Array.isArray(already)) {
                    already.push(model);
                } else {
                    index.set(model.id, [already, model]);
                }
            } else {
                index.set(model.id, model);
            }
        }

        return this.#idIndex;
    }

    get #names() {
        if (this.#nameIndex) {
            return this.#nameIndex;
        }

        const index = (this.#nameIndex = new Map<string, T | T[]>());
        for (const model of this) {
            const name = camelize(model.name);
            const already = index.get(name);
            if (already) {
                if (Array.isArray(already)) {
                    already.push(model);
                } else {
                    index.set(name, [already, model]);
                }
            } else {
                index.set(name, model);
            }
        }

        return this.#nameIndex;
    }
}
