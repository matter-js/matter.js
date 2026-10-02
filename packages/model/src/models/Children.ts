/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { AnyElement, BaseElement } from "#elements/index.js";
import { camelize, ImplementationError } from "@matter/general";
import type { Model } from "./Model.js";
import type { ModelTreePosition } from "./ModelTreePosition.js";

/**
 * Local copy of ModelConstructor allows us to avoid circular dependency.
 *
 * If this is undefined it means Children was accessed without having loaded Model first which shouldn't happen in
 * normal use.
 */
let ModelConstructor: typeof Model = undefined as unknown as typeof Model;

/**
 * Children of a model.  This is a {@link Model} array with some specialization for model-specific operations.
 *
 * A model is listed at most once and its parent is the model that lists it.  Inserting a model that is already a child
 * moves it, so array algorithms applied through `Array.prototype` methods that assign indices one by one do not keep
 * the order; use the methods of this interface.
 *
 * @template T the type of model that owns the children
 */
export interface Children<T extends Model = Model> extends Array<T> {
    /**
     * Add children.
     *
     * Operates like a standard array push but we adjust the type to allow insertion of elements as well as models.  A
     * model that is already a child moves to the end; listing a model twice in one call throws.
     */
    push(...children: Model.TaggedDefinition<T>[]): number;

    /**
     * Array splice.
     *
     * Allows splicing in elements or models.  A model that is already a child moves to the insertion point; listing a
     * model twice in one call throws.
     */
    splice(index: number, deleteCount?: number, ...toAdd: Model.TaggedDefinition<T>[]): T[];

    /**
     * Access a model of specific type by ID or name.  This is an optimized operation that uses internal index lookup.
     */
    get<C extends Model>(type: Model.Type<C>, idOrName: number | string): C | undefined;

    /**
     * Access all models of a specific type in list order, optionally filtered to a specific ID or name.  Even if filtered there
     * may be multiple return values if there are different variants of the element defined.
     */
    all<C extends Model>(type: Model.Type<C>, idOrName?: number | string): C[];

    /**
     * Access a model using a {@link Children.Selector}.  This is an optimized primitive used by various tree traversal
     * algorithms.
     */
    select(
        selector: Children.Selector,
        allowedTags?: Children.TagSelector,
        except?: Set<Model>,
    ): Model.ChildOf<T> | undefined;

    /**
     * Like {@link select} but retrieves all models for which selection applies.
     */
    selectAll(selector: Children.Selector, allowedTags?: Children.TagSelector, except?: Set<Model>): Model.ChildOf<T>[];
}

export interface InternalChildren<T extends Model = Model> extends Children<T> {
    /**
     * Models invoke this when their ID or name changes so we can update internal bookkeeping.
     */
    keysChanged(): void;

    /**
     * Freeze the set of children.
     */
    freeze(): void;

    /**
     * Ensure roots of children are synced with parent.
     */
    rerootAll(isOwned: boolean): void;

    /**
     * Changes on every mutation of the list or of a child's ID or name.  Unique across all lists so a model that
     * replaces its list never reports a generation a cache saw for the old one.
     */
    readonly generation: number;
}

type IndexEntry = Model | Model[];

interface Index {
    byId: Map<number, IndexEntry>;
    byName: Map<string, IndexEntry>;
}

let lastGeneration = 0;

class ChildList<T extends Model = Model> {
    #children: Model.TaggedDefinition<T>[];
    #reified = false;
    #generation = ++lastGeneration;
    #indices?: Map<abstract new (...args: any[]) => Model, Index>;
    #position: ModelTreePosition;
    #proxy: InternalChildren<T>;

    constructor(initial: Children.InputIterable<T>, position: ModelTreePosition) {
        this.#children = Array<Model.TaggedDefinition<T>>();
        this.#position = position;

        const impl = this;
        this.#proxy = new Proxy(this.#children, {
            get(target, name, receiver) {
                return impl.#proxyGet(target, name, receiver);
            },
            set(_target, name, value, receiver) {
                return impl.#proxySet(name, value, receiver);
            },
            deleteProperty(_target, p) {
                return impl.#proxyDeleteProperty(p);
            },
        }) as InternalChildren<T>;

        // Clone child array because if it references a former parent they'll disappear as we add
        initial = [...initial];

        this.#proxy.push(...initial);
    }

    get proxy() {
        return this.#proxy;
    }

    /**
     * Enter "reified" mode.  Converts all element children to Model instances.
     */
    #reify() {
        if (this.#reified) {
            return;
        }
        for (let i = 0; i < this.#children.length; i++) {
            let child = this.#children[i];
            if (child instanceof ModelConstructor) {
                continue;
            }
            child = ModelConstructor.create(child as unknown as AnyElement) as T;
            this.#doAdopt(child);
            this.#children[i] = child;
        }
        this.#reified = true;
    }

    /**
     * Determine if an element has any Model children.  If so we need to upgrade to a model on insertion.
     */
    #hasModel(child: BaseElement): boolean {
        if (child instanceof ModelConstructor) {
            return true;
        }
        return child.children?.some(c => this.#hasModel(c)) ?? false;
    }

    /**
     * Convert a new child to "insertion" form.  The input may be an element or model.  If we are reified, we upgrade
     * elements to models.  If child or any descendents is a model, we reify so models will have the correct parent
     * after insertion.
     */
    #insertionFormOf(child: Model.TaggedDefinition<T>) {
        if (child instanceof ModelConstructor) {
            return child;
        }

        if (this.#reified || this.#hasModel(child)) {
            return ModelConstructor.create(child as unknown as AnyElement) as T;
        }

        return child;
    }

    #indexInsert<K>(index: Map<K, IndexEntry>, key: K, model: Model) {
        const existing = index.get(key);
        if (existing === undefined) {
            index.set(key, model);
        } else if (Array.isArray(existing)) {
            existing.push(model);
        } else {
            index.set(key, [existing, model]);
        }
    }

    /**
     * Record a mutation.  Indices are derived from the list and rebuilt on next use.
     */
    #touch() {
        this.#generation = ++lastGeneration;
        this.#indices = undefined;
    }

    /**
     * Populate id and name indices for a specific child type.
     */
    #buildIndex(type: Model.Type) {
        this.#reify();

        const slot: Index = { byId: new Map(), byName: new Map() };
        const { byId, byName } = slot;

        for (const child of this.#children) {
            if (child instanceof type) {
                const id = child.effectiveId;
                if (id !== undefined) {
                    this.#indexInsert(byId, id, child);
                }
                this.#indexInsert(byName, child.name, child);
            }
        }

        if (!this.#indices) {
            this.#indices = new Map();
        }
        this.#indices.set(type, slot);

        return slot;
    }

    /**
     * Recursively reroot a single child & descendents.
     *
     * Invoked when the child's parent changes.
     */
    #doReroot(child: Model, isOwned: boolean) {
        if (!this.#position.reroot(child, isOwned) || !child.hasChildren) {
            return;
        }
        (child.children as InternalChildren).rerootAll(isOwned);
    }

    /**
     * Recursively reroot all children & descendents.
     *
     * Invoked when the owner's root changes.  Only affects reified models.
     */
    #rerootAll(isOwned: boolean) {
        for (const child of this.#children) {
            if (child instanceof ModelConstructor) {
                this.#doReroot(child, isOwned);
            }
        }
    }

    #doAdopt(child: Model) {
        this.#position.adopt(child);
        this.#doReroot(child, true);
    }

    #doDisown(child: Model) {
        if (this.#position.disown(child)) {
            this.#doReroot(child, false);
        }
    }

    #get(type: typeof Model, idOrName: number | string) {
        const value = this.#all(type, idOrName);
        if (Array.isArray(value)) {
            return value[0];
        }
        return value;
    }

    #all(type: typeof Model, idOrName?: number | string) {
        if (idOrName === undefined) {
            this.#reify();
            return this.#children.filter(child => child instanceof type);
        }

        const slot = this.#indices?.get(type) ?? this.#buildIndex(type);
        const result = typeof idOrName === "number" ? slot.byId.get(idOrName) : slot.byName.get(idOrName);

        if (result === undefined) {
            return [];
        }

        if (Array.isArray(result)) {
            return result;
        }

        return [result];
    }

    #selectTypes(tags: Children.TagSelector): Model.Type[] {
        if (tags === undefined || tags === "*") {
            return [ModelConstructor];
        }

        if (typeof tags === "string") {
            tags = [tags];
        }

        const result = Array<Model.Type>();
        for (const tag of tags) {
            const type = ModelConstructor.types[tag];
            if (type === undefined) {
                throw new ImplementationError(`Unknown element tag "${tag}"`);
            }
            result.push(type);
        }

        return result;
    }

    #indexLookup<R>(
        selector: number | string,
        allowedTags: Children.TagSelector,
        except: Set<Model> | undefined,
        processor: (model: Model) => R,
    ) {
        for (const type of this.#selectTypes(allowedTags)) {
            let slot = this.#indices?.get(type);
            if (slot === undefined) {
                slot = this.#buildIndex(type);
            }

            const entry = typeof selector === "number" ? slot.byId.get(selector) : slot.byName.get(selector);

            if (Array.isArray(entry)) {
                for (const subentry of entry) {
                    if (except?.has(subentry)) {
                        continue;
                    }
                    const result = processor(subentry);
                    if (result !== undefined) {
                        return result;
                    }
                }
                continue;
            }

            if (entry) {
                if (except?.has(entry)) {
                    continue;
                }
                const result = processor(entry);
                if (result) {
                    return result;
                }
            }
        }
    }

    #indexApply(selector: (child: Model) => boolean, allowedTags: Children.TagSelector, except?: Set<Model>) {
        const types = this.#selectTypes(allowedTags);
        for (const child of this.#children) {
            if (
                child instanceof ModelConstructor &&
                types.some(type => child instanceof type) &&
                !except?.has(child) &&
                selector(child)
            ) {
                return child;
            }
        }
    }

    #select(selector: Children.Selector, allowedTags?: Children.TagSelector, except?: Set<Model>) {
        this.#reify();

        if (typeof selector === "string") {
            return this.#indexLookup(selector, allowedTags, except, model => model);
        }

        if (typeof selector === "number") {
            return this.#indexLookup(selector, allowedTags, except, model => model);
        }

        return this.#indexApply(selector, allowedTags, except);
    }

    #selectAll(
        selector: Exclude<Children.Selector, (args: any) => any>,
        allowedTags?: Children.TagSelector,
        except?: Set<Model>,
    ) {
        this.#reify();

        const results = Array<Model>();

        this.#indexLookup(selector, allowedTags, except, model => {
            results.push(model);
        });

        return results;
    }

    #splice(index: number, deleteCount: number, ...toAdd: Model.TaggedDefinition<T>[]) {
        this.#assertMutable();
        for (const child of toAdd) {
            this.#validateChild(child);
        }
        toAdd = toAdd.map(child => this.#insertionFormOf(child));

        const models = toAdd.filter(child => child instanceof ModelConstructor);
        if (new Set(models).size !== models.length) {
            throw new ImplementationError("A model cannot be listed twice among the children of one model");
        }

        const own = new Set(models.filter(model => model.parent?.children === this.#proxy));
        const joining = models.filter(model => !own.has(model));

        // Adopting removes a model from its former parent, so check every parent before moving any model
        for (const model of joining) {
            if (model.parent !== undefined && Object.isFrozen(model.parent.children)) {
                throw new ImplementationError(`Cannot move ${model} out of finalized ${model.parent}`);
            }
        }
        for (const model of joining) {
            this.#doAdopt(model);
        }

        let start = relativeIndex(index, this.#children.length);
        const count = Math.max(Math.trunc(deleteCount) || 0, 0);

        for (const model of own) {
            const current = this.#children.indexOf(model);
            if (current === -1 || (current >= start && current < start + count)) {
                continue;
            }
            this.#children.splice(current, 1);
            if (current < start) {
                start--;
            }
        }

        const removed = this.#children.splice(start, count, ...toAdd);
        this.#touch();

        return removed.map(child => {
            if (!(child instanceof ModelConstructor)) {
                return ModelConstructor.create(child as unknown as AnyElement) as T;
            }
            if (!models.includes(child)) {
                this.#doDisown(child);
            }
            return child;
        });
    }

    /**
     * Reorder the list with an array operation that keeps its members.
     */
    #reorder(operation: (children: T[]) => void) {
        this.#assertMutable();
        this.#reify();
        const next = this.#children.filter((child): child is T => child instanceof ModelConstructor);
        const generation = this.#generation;
        operation(next);
        if (this.#generation !== generation) {
            throw new ImplementationError("Children changed while they were being reordered");
        }
        for (let i = 0; i < next.length; i++) {
            this.#children[i] = next[i];
        }
        this.#touch();
        return this.#proxy;
    }

    #assertMutable() {
        if (Object.isFrozen(this.#children)) {
            throw new ImplementationError("Cannot change the children of a finalized model");
        }
    }

    #finalize() {
        for (const child of this.#proxy) {
            (child as Model).finalize();
        }
        Object.freeze(this.#children);
    }

    #validateChild(value: unknown) {
        if (value instanceof ModelConstructor) {
            return;
        }

        if (value === undefined || value === null) {
            throw new ImplementationError(`Child cannot be ${value}`);
        }
        if (typeof value !== "object") {
            throw new ImplementationError(`Child must be an object (child is typeof ${typeof value})`);
        }

        const { tag } = value as AnyElement;

        if (typeof tag !== "string") {
            throw new ImplementationError(`Child must have a string tag (tag is typeof ${typeof tag})`);
        }
        if (tag[0] < "a" || tag[0] > "z" || !(camelize(tag, true) in ElementTag)) {
            throw new ImplementationError(`Child tag "${tag}" is unknown`);
        }
    }

    #proxyGet(_target: Model.TaggedDefinition<T>[], name: string | symbol, receiver: unknown) {
        if (typeof name === "string" && name.match(/^\d+$/)) {
            let child = this.#children[name as unknown as number];
            if (child && !(child instanceof ModelConstructor)) {
                child = ModelConstructor.create(child as unknown as AnyElement) as T;
                this.#doAdopt(child);
                this.#children[name as unknown as number] = child;
            }

            return child;
        }

        switch (name) {
            case "get":
                return (type: typeof Model, idOrName: number | string) => this.#get(type, idOrName);

            case "all":
                return (type: typeof Model, idOrName?: number | string) => this.#all(type, idOrName);

            case "select":
                return (selector: Children.Selector, allowedTags?: Children.TagSelector, except?: Set<Model>) =>
                    this.#select(selector, allowedTags, except);

            case "selectAll":
                return (
                    selector: Exclude<Children.Selector, (args: any) => any>,
                    allowedTags?: Children.TagSelector,
                    except?: Set<Model>,
                ) => this.#selectAll(selector, allowedTags, except);

            case "keysChanged":
                return () => this.#touch();

            case "splice":
                return (...args: [index: number, deleteCount?: number, ...toAdd: Model.TaggedDefinition<T>[]]) => {
                    if (!args.length) {
                        return [];
                    }
                    const [index, deleteCount, ...toAdd] = args;
                    return this.#splice(index, args.length < 2 ? Infinity : (deleteCount ?? 0), ...toAdd);
                };

            case "push":
                return (...toAdd: Model.TaggedDefinition<T>[]) => {
                    this.#splice(this.#children.length, 0, ...toAdd);
                    return this.#children.length;
                };

            case "unshift":
                return (...toAdd: Model.TaggedDefinition<T>[]) => {
                    this.#splice(0, 0, ...toAdd);
                    return this.#children.length;
                };

            case "pop":
                return () => this.#splice(this.#children.length - 1, 1)[0];

            case "shift":
                return () => this.#splice(0, 1)[0];

            case "reverse":
                return () => this.#reorder(children => children.reverse());

            case "sort":
                return (compare?: (a: T, b: T) => number) => this.#reorder(children => children.sort(compare));

            case "fill":
            case "copyWithin":
                return () => {
                    throw new ImplementationError(`Children do not support ${name}`);
                };

            case "freeze":
                return () => this.#finalize();

            case "toString":
                return () => `[Children: ${this.#children.length}]`;

            case "rerootAll":
                return (isOwned: boolean) => this.#rerootAll(isOwned);

            case "generation":
                return this.#generation;
        }

        return Reflect.get(this.#children, name, receiver);
    }

    #proxySet(name: string | symbol, value: any, receiver: unknown) {
        if (typeof name !== "string" || !name.match(/^\d+$/)) {
            if (name === "length") {
                const length = Number(value);
                if (length >>> 0 !== length) {
                    throw new ImplementationError(`Invalid children length ${value}`);
                }

                // Do not allow preallocation that would create gaps
                if (length < this.#children.length) {
                    this.#splice(length, Infinity);
                }
                return true;
            }
            return Reflect.set(this.#children, name, value, receiver);
        }

        this.#validateChild(value);

        const index = Math.min(Number(name), this.#children.length);
        if (this.#children[index] === value) {
            return true;
        }

        this.#splice(index, 1, value);
        return true;
    }

    #proxyDeleteProperty(p: string | symbol) {
        if (typeof p === "string" && p.match(/^\d+$/)) {
            this.#splice(Number(p), 1);
            return true;
        }
        return Reflect.deleteProperty(this.#children, p);
    }
}

/**
 * Resolve a negative or fractional splice index the way {@link Array.prototype.splice} does.
 */
function relativeIndex(index: number, length: number) {
    const relative = Math.trunc(index) || 0;
    return relative < 0 ? Math.max(length + relative, 0) : relative;
}

/**
 * Invoked by {@link Model} to instantiate a new child array.
 */
export function Children<T extends Model = Model>(initial: Children.InputIterable<T>, position: ModelTreePosition) {
    return new ChildList(initial, position).proxy;
}

export namespace Children {
    /**
     * A model selector designates models for retrieval.  It may be a model name, number, or a predicate function.
     */
    export type Selector = string | number | ((child: Model) => boolean);

    /**
     * A tag selector filters models based on type.  It may be a tag name, a list of tag names, or "*" or undefined to
     * disable type filtering.
     */
    export type TagSelector = undefined | ElementTag | "*" | ElementTag[];

    /**
     * An iterable of input definitions.
     */
    export type InputIterable<T extends Model> = Iterable<Model.TaggedDefinition<T>>;
}

Children.installModelConstructor = (constructor: typeof Model) => (ModelConstructor = constructor);
