/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, ImplementationError } from "@matter/general";
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
     * Retrieve a model for the given ID or name, throwing if not found.
     */
    require(key: number | string): T;

    /**
     * Retrieve a model of the specific type for the given ID or name, throwing if not found.
     */
    require<M extends T>(key: number | string, type: Model.Type<M>): M;

    /**
     * Retrieve a model by key and create an operational extension of it.
     *
     * Shorthand for `index.require(key).extend(properties, ...children)`.
     */
    extend(
        key: number | string,
        properties?: Partial<Model.Definition<T>>,
        ...children: Model.ChildDefinition<Model>[]
    ): T;

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

    require(key: number | string): T;
    require<M extends T>(key: number | string, type: Model.Type<M>): M;

    require(key: number | string, type?: Model.Type): Model {
        const result = this.for(key, type as any);
        if (result === undefined) {
            throw new ImplementationError(`Required member "${key}" not found`);
        }
        return result;
    }

    extend(
        key: number | string,
        properties?: Partial<Model.Definition<T>>,
        ...children: Model.ChildDefinition<Model>[]
    ): T {
        return this.require(key).extend(properties, ...children);
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
