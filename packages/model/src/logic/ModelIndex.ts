/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Callable, camelize, ImplementationError } from "@matter/general";
import { Model } from "../models/Model.js";

/**
 * A collection of models with support for efficient lookup by name and ID.
 *
 * Callable as a function to look up models by key:
 *
 *     clusters("OnOff")           // equivalent to clusters.for("OnOff")
 *
 * Name search uses canonical camel case, so "FooBar", "fooBar" and "foo-bar" are considered equivalent.
 */
export interface ModelIndex<T extends Model = Model> {
    /**
     * Look up a model by ID or name.
     *
     * If `key` is `undefined`, returns `undefined`.
     */
    (key: number | string | undefined): T | undefined;

    /**
     * Retrieve a model for the given ID or name.
     *
     * If `key` is `undefined`, returns `undefined`.
     *
     * Use the two-parameter version for indices that contain multiple model types.
     *
     * @deprecated Use the call signature instead: `index(key)` rather than `index.for(key)`.
     */
    for(key: undefined): undefined;
    for(key: number | string): T | undefined;
    for(key: number | string | undefined): T | undefined;

    /**
     * Retrieve a model of the specific type for the given ID or name.
     *
     * Name search uses canonical camel case.
     *
     * @deprecated Use the call signature instead: `index(key)` rather than `index.for(key)`.
     */
    for<M extends T>(key: number | string, type: Model.Type<M>): M | undefined;

    /**
     * Retrieve a model for the given ID or name, throwing if not found.
     *
     * If `key` is `undefined`, returns `undefined` without throwing.
     */
    require(key: undefined): undefined;
    require(key: number | string): T;
    require(key: number | string | undefined): T | undefined;

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

    /**
     * Iterate over all models.
     */
    [Symbol.iterator](): IterableIterator<T>;

    /**
     * Execute a function for each model.
     */
    forEach(fn: (model: T, index: number) => void): void;

    /**
     * Map models to a new array.
     */
    map<U>(fn: (model: T, index: number) => U): U[];

    /**
     * Filter models.
     */
    filter(fn: (model: T, index: number) => boolean): T[];

    /**
     * Find the first model matching a predicate.
     */
    find(fn: (model: T, index: number) => boolean): T | undefined;

    /**
     * Test whether any model matches a predicate.
     */
    some(fn: (model: T, index: number) => boolean): boolean;

    /**
     * Test whether all models match a predicate.
     */
    every(fn: (model: T, index: number) => boolean): boolean;

    /**
     * Reduce models to a single value.
     */
    reduce<U>(fn: (accumulator: U, model: T, index: number) => U, initialValue: U): U;

    /**
     * The number of models in this index.
     */
    readonly length: number;

    /**
     * Access a model by position.
     */
    at(index: number): T | undefined;
}

/**
 * Implementation of {@link ModelIndex} used for initial creation.
 */
export class MutableModelIndex<T extends Model = Model>
    extends Callable<[key: number | string | undefined], T | undefined>
    implements ModelIndex<T>
{
    #items: T[];
    #nameIndex?: Map<string, T | T[]>;
    #idIndex?: Map<number, T | T[]>;

    constructor(items: T[] = []) {
        let self: MutableModelIndex<T>;
        super(function (key: number | string | undefined) {
            return self.for(key as any);
        });
        self = this;

        // The function's own "length" property (number of formal parameters) would shadow the getter on
        // our prototype.  Delete it so our getter is reachable.
        delete (this as unknown as { length?: number }).length;

        this.#items = items;
    }

    /**
     * Add items.  Used during construction only.
     */
    push(...items: T[]) {
        this.#items.push(...items);
        this.#nameIndex = undefined;
        this.#idIndex = undefined;
    }

    override get length() {
        return this.#items.length;
    }

    at(index: number): T | undefined {
        return this.#items.at(index);
    }

    [Symbol.iterator](): IterableIterator<T> {
        return this.#items[Symbol.iterator]();
    }

    forEach(fn: (model: T, index: number) => void): void {
        this.#items.forEach(fn);
    }

    map<U>(fn: (model: T, index: number) => U): U[] {
        return this.#items.map(fn);
    }

    filter(fn: (model: T, index: number) => boolean): T[] {
        return this.#items.filter(fn);
    }

    find(fn: (model: T, index: number) => boolean): T | undefined {
        return this.#items.find(fn);
    }

    some(fn: (model: T, index: number) => boolean): boolean {
        return this.#items.some(fn);
    }

    every(fn: (model: T, index: number) => boolean): boolean {
        return this.#items.every(fn);
    }

    reduce<U>(fn: (accumulator: U, model: T, index: number) => U, initialValue: U): U {
        return this.#items.reduce(fn, initialValue);
    }

    for(key: undefined): undefined;
    for(key: number | string): T;
    for<M extends T>(key: number | string, type: Model.Type<M>): M;

    for(key: number | string | undefined, type?: Model.Type): Model | undefined {
        if (key === undefined) {
            return undefined;
        }

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

    require(key: undefined): undefined;
    require(key: number | string): T;
    require<M extends T>(key: number | string, type: Model.Type<M>): M;

    require(key: number | string | undefined, type?: Model.Type): Model | undefined {
        if (key === undefined) {
            return undefined;
        }
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
        return this.#items.filter(m => m instanceof type) as InstanceType<T>[];
    }

    get #ids() {
        if (this.#idIndex) {
            return this.#idIndex;
        }

        const index = (this.#idIndex = new Map<number, T | T[]>());
        for (const model of this.#items) {
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
        for (const model of this.#items) {
            const name = model.propertyName;
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
