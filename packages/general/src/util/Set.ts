/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Observable, ObservableValue } from "./Observable.js";

/**
 * A read-only set.
 */
export interface ImmutableSet<T> {
    [Symbol.iterator]: () => Iterator<T, undefined>;
    has(item: T): boolean;
    get size(): number;
    map<R>(mapper: (item: T) => R): R[];
    find(predicate: (item: T) => boolean | undefined): T | undefined;
    filter(predicate: (item: T) => boolean | undefined): T[];
}

/**
 * A write-only set.
 */
export interface MutableSet<T, AddT = T> {
    add(definition: AddT): void;
    delete(definition: T): boolean;
    clear(): void;
}

/**
 * Set change events.
 */
export interface ObservableSet<T> {
    get added(): Observable<[T]>;
    get deleted(): Observable<[T]>;
    get empty(): ObservableValue;
}

/**
 * An interface for index set lookup.
 *
 * Note that this interface only supports a single item for each key.  If multiple items associate with a key only the
 * first is returned.
 */
export interface IndexedSet<T> {
    /**
     * Retrieve an item with the named {@link field} set to {@link value}.
     */
    get<F extends keyof T>(field: F, value: T[F]): T | undefined;

    /**
     * Obtain a {@link Map} of values in {@link field} to the associated item in the set.
     */
    mapOf<F extends keyof T>(field: F): Map<T[F], T>;
}

/**
 * A generic set implementation supporting all interfaces in this module.
 *
 * Unused features have minimal performance impact.
 */
export class BasicSet<T, AddT = T> implements ImmutableSet<T>, MutableSet<T, AddT>, ObservableSet<T>, IndexedSet<T> {
    #entries = new Set<T>();
    #added?: Observable<[T]>;
    #deleted?: Observable<[T]>;
    #empty?: ObservableValue;
    #indices?: {
        [field in keyof T]?: Map<T[field], T>;
    };
    #maps?: {
        [field in keyof T]?: Map<T[field], T>;
    };

    constructor(...initialItems: AddT[]) {
        for (const item of initialItems) {
            this.add(item);
        }
    }

    [Symbol.iterator]() {
        return this.#entries[Symbol.iterator]();
    }

    get size() {
        return this.#entries.size;
    }

    map<R>(mapper: (item: T) => R) {
        return [...this].map(mapper);
    }

    find(predicate: (item: T) => boolean | undefined) {
        for (const item of this) {
            if (predicate(item)) {
                return item;
            }
        }
    }

    filter(predicate: (item: T) => boolean | undefined) {
        const result = new Array<T>();
        for (const item of this) {
            if (predicate(item)) {
                result.push(item);
            }
        }
        return result;
    }

    has(item: T) {
        return this.#entries.has(item);
    }

    add(item: AddT) {
        const created = this.create(item);

        if (this.#entries.has(item as any)) {
            return;
        }

        this.#entries.add(item as any);

        if (this.#indices) {
            for (const field in this.#indices) {
                const value = created[field];
                if (value === undefined) {
                    continue;
                }

                const index = this.#indices[field];
                if (index === undefined || index.has(value)) {
                    continue;
                }

                index.set(value, created);
            }
        }

        this.#added?.emit(created);

        if (this.#empty && this.#empty.value) {
            this.#empty.emit(false);
        }
    }

    get<F extends keyof T>(field: F, value: T[F]) {
        return this.#indexOf(field).get(value);
    }

    #indexOf<F extends keyof T>(field: F) {
        if (!this.#indices) {
            this.#indices = {};
        }
        let index = this.#indices[field];
        if (index === undefined) {
            index = new Map<any, T>();
            for (const item of this) {
                const value = item[field];
                if (value === undefined || index.has(value)) {
                    continue;
                }
                index.set(value, item);
            }
            this.#indices[field] = index;
        }
        return index!; // Need "!" due to (apparent) TS bug
    }

    /**
     * Obtain key/value map using specific field as key.
     *
     * Note we use {@link This} to constrain usage to sets where {@link T} === {@link AddT} as required by {@link Map}.
     */
    mapOf<This extends BasicSet<T, T>, F extends keyof T>(this: This, field: F): Map<T[F], T> {
        if (!this.#maps) {
            this.#maps = {};
        }
        let map = this.#maps[field];
        if (map === undefined) {
            map = new MapOfIndexedSet(this, field, this.#indexOf(field));
            this.#maps[field] = map;
        }
        return map;
    }

    delete(item: T): boolean;
    delete<F extends keyof T>(field: keyof T, value: T[F]): boolean;
    delete<F extends keyof T>(itemOrField: T | F, value?: T[F]): boolean {
        let item: T | undefined;
        if (value === undefined) {
            item = itemOrField as T;
        } else {
            item = this.get(itemOrField as F, value);
            if (item === undefined) {
                return false; // Item not found
            }
        }

        if (!this.#entries.delete(item)) {
            return false;
        }

        if (this.#indices) {
            for (const field in this.#indices) {
                const value = item[field];
                if (value === undefined) {
                    continue;
                }

                const index = this.#indices[field];
                if (index !== undefined && index.get(value) === item) {
                    index.delete(value);
                }
            }
        }

        this.#deleted?.emit(item);

        if (this.#empty && !this.size) {
            this.#empty.emit(true);
        }

        return true;
    }

    clear() {
        for (const entry of [...this]) {
            this.delete(entry);
        }
    }

    get added() {
        if (this.#added === undefined) {
            this.#added = Observable();
        }
        return this.#added;
    }

    get deleted() {
        if (this.#deleted === undefined) {
            this.#deleted = Observable();
        }
        return this.#deleted;
    }

    get empty() {
        if (this.#empty === undefined) {
            this.#empty = ObservableValue(!this.#entries.size);
        }
        return this.#empty;
    }

    protected create(definition: AddT) {
        return definition as unknown as T;
    }
}

/**
 * A {@link Map} backed by an {@link IndexedSet}.
 *
 * This supports the common case where sets must be looked up by key.  Implementations like {@link BasicSet} offer
 * efficient lookup by key using {@link IndexedSet#get}, but usage like a {@link Map} is still cumbersome.  This class
 * works as an adapter to make key/value access patterns more natural.
 */
export class MapOfIndexedSet<T, S extends ImmutableSet<T> & MutableSet<T> & IndexedSet<T>, K extends keyof T>
    implements Map<T[K], T>
{
    #set: S;
    #key: K;

    // This is an optimization for lookup
    #index?: Map<T[K], T>;

    /**
     * Create a new map.
     *
     * @param set the backing data
     * @param key a property of {@link T} used as the key
     * @param index optional index that optimizes lookup by bypassing {@link IndexedSet#get}
     */
    constructor(set: S, key: K, index?: Map<T[K], T>) {
        this.#set = set;
        this.#key = key;
        this.#index = index;
    }

    clear(): void {
        this.#set.clear();
    }

    delete(key: T[K]): boolean {
        const item = this.get(key);
        if (item) {
            return this.#set.delete(item);
        }
        return false;
    }

    forEach(callbackfn: (value: T, key: T[K], map: Map<T[K], T>) => void, thisArg?: any): void {
        if (thisArg) {
            callbackfn = callbackfn.bind(thisArg);
        }
        for (const [k, v] of this) {
            callbackfn(v, k, this);
        }
    }

    get(key: T[K]): T | undefined {
        if (this.#index) {
            return this.#index.get(key);
        }
        return this.#set.get(this.#key, key);
    }

    has(key: T[K]): boolean {
        return this.#index ? this.#index.has(key) : this.#set.get(this.#key, key) !== undefined;
    }

    set(key: T[K], value: T): this {
        if (value[this.#key] !== key) {
            throw new MapOfIndexedSet.KeyValueMismatchError(
                `Cannot set key "${key}" because value property ${String(this.#key)} is "${value[this.#key]}"`,
            );
        }
        if (this.has(key)) {
            if (this.get(key) === value) {
                return this;
            }
            this.#set.delete((this.#index ? this.#index.get(key) : this.#set.get(this.#key, key)) as T);
        }
        this.#set.add(value);
        return this;
    }

    get size() {
        return this.#set.size;
    }

    entries(): MapIterator<[T[K], T]> {
        return this[Symbol.iterator]();
    }

    keys(): MapIterator<T[K]> {
        if (this.#index) {
            return this.#index.keys();
        }
        const keys = [...this.#set].map(item => item[this.#key]).filter(key => key !== undefined);
        return keys[Symbol.iterator]();
    }

    values(): MapIterator<T> {
        if (this.#index) {
            return this.#index.values();
        }
        const values = [...this.#set].map(item => item);
        return values[Symbol.iterator]();
    }

    *[Symbol.iterator](): MapIterator<[T[K], T]> {
        for (const item of this.#set) {
            const k = item[this.#key];
            if (k === undefined) {
                continue;
            }
            yield [k, item];
        }
    }

    [Symbol.toStringTag] = "Map";
}

export namespace MapOfIndexedSet {
    export class KeyValueMismatchError extends ImplementationError {}
}
