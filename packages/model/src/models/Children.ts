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
 * @template T the type of model that owns the children
 */
export interface Children<T extends Model = Model> extends Array<T> {
    /**
     * Add children.
     *
     * Operates like a standard array push but we adjust the type to allow insertion of elements as well as models.
     */
    push(...children: Model.TaggedDefinition<T>[]): number;

    /**
     * Array splice.
     *
     * Allows splicing in elements or models.
     */
    splice(index: number, deleteCount?: number, ...toAdd: Model.TaggedDefinition<T>[]): T[];

    /**
     * Access a model of specific type by ID or name.  This is an optimized operation that uses internal index lookup.
     */
    get<C extends Model>(type: Model.Type<C>, idOrName: number | string): C | undefined;

    /**
     * Access all models of a specific type, optionally filtered to a specific ID or number.  Even if filtered there
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
     * Models invoke this when their ID changes so we can update internal bookkeeping.
     */
    updateId(child: Model, oldId: number | undefined): void;

    /**
     * Models invoke this when their name changes so we can update internal bookkeeping.
     */
    updateName(child: Model, oldName: string): void;

    /**
     * Freeze the set of children.
     */
    freeze(): void;

    /**
     * Callback to notify of name changes.
     */
    onNameChanged?: (name: string, model?: Model) => void;

    /**
     * Ensure roots of children are synced with parent.
     */
    rerootAll(isOwned: boolean): void;
}

type IndexEntry = Model | Model[];

class ChildList<T extends Model = Model> {
    #children: Model.TaggedDefinition<T>[];
    #reified = false;
    #indices?: Map<
        abstract new (...args: any[]) => Model,
        {
            byId: IndexEntry[];
            byName: Record<string, IndexEntry>;
        }
    >;
    #onNameChanged?: (name: string, model?: Model) => void;
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

    /**
     * Add a model to a name or ID index.
     */
    #indexInsert<K extends number | string>(index: Record<K, IndexEntry>, key: K, model: Model) {
        const existing = index[key];
        if (existing) {
            if (Array.isArray(existing)) {
                existing.push(model);
            } else {
                index[key] = [existing, model];
            }
        } else {
            index[key] = model;
        }
    }

    /**
     * Remove a model from a name or ID index.
     */
    #indexDelete<K extends number | string>(index: Record<K, IndexEntry>, key: K, model: Model) {
        const existing = index[key];
        if (existing === model) {
            delete index[key];
        }
        if (Array.isArray(existing)) {
            const pos = existing.indexOf(model);
            if (pos === -1) {
                return;
            }
            existing.splice(pos, 1);
            if (existing.length === 1) {
                index[key] = existing[0];
            }
            return;
        }
    }

    /**
     * Populate id and name indices for a specific child type.
     */
    #buildIndex(type: Model.Type) {
        this.#reify();

        const byId = Array<Model>();
        const byName = {} as Record<string, Model>;

        for (const child of this.#children) {
            if (child instanceof type) {
                // By caching effectiveId we're assuming that models without an ID do not shift position within their
                // parent.  As this is effectively static data it should be OK
                const id = child.effectiveId;
                if (id !== undefined) {
                    this.#indexInsert(byId, id, child);
                }
                this.#indexInsert(byName, child.name, child);
            }
        }

        const slot = { byId, byName };

        if (!this.#indices) {
            this.#indices = new Map();
        }
        this.#indices.set(type, slot);

        return slot;
    }

    /**
     * Remove a child of the model.  Clears model from indices and clears "parent" field.
     */
    #deleteChild(child: Model) {
        if (this.#indices) {
            for (const [type, slot] of this.#indices.entries()) {
                if (child instanceof type) {
                    if (child.id) {
                        this.#indexDelete(slot.byId, child.id, child);
                    }
                    this.#indexDelete(slot.byName, child.name, child);
                }
            }
        }

        this.#onNameChanged?.(child.name, undefined);
        this.#doDisown(child);
    }

    /**
     * Add a child of the model.  Adopts the model and adds to any applicable indices.
     */
    #addChild(child: Model) {
        if ((child.parent?.children as unknown) === this.#children) {
            return;
        }

        if (this.#indices) {
            for (const [type, slot] of this.#indices.entries()) {
                if (child instanceof type) {
                    if (child.id) {
                        this.#indexInsert(slot.byId, child.id, child);
                    }
                    this.#indexInsert(slot.byName, child.name, child);
                }
            }
        }

        this.#doAdopt(child);
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
        this.#onNameChanged?.(child.name, child);
        this.#doReroot(child, true);
    }

    #doDisown(child: Model) {
        this.#onNameChanged?.(child.name, undefined);
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
        const slot = this.#indices?.get(type) ?? this.#buildIndex(type);
        if (idOrName === undefined) {
            return Object.values(slot.byName).flatMap(entry => entry);
        }

        let result;
        if (typeof idOrName === "number") {
            result = slot.byId[idOrName];
        } else {
            result = slot.byName[idOrName];
        }

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
        indexName: "byId" | "byName",
        allowedTags: Children.TagSelector,
        except: Set<Model> | undefined,
        processor: (model: Model) => R,
    ) {
        for (const type of this.#selectTypes(allowedTags)) {
            let slot = this.#indices?.get(type);
            if (slot === undefined) {
                slot = this.#buildIndex(type);
            }

            const index = slot[indexName] as Record<number | string, Model | Model[]>;
            const entry = index[selector];

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
        for (const type of this.#selectTypes(allowedTags)) {
            let index = this.#indices?.get(type)?.byName;
            if (!index) {
                index = this.#buildIndex(type).byName;
            }

            for (const key in index) {
                const entry = index[key];
                if (Array.isArray(entry)) {
                    for (const subentry of entry) {
                        if (except?.has(subentry)) {
                            continue;
                        }
                        if (selector(subentry)) {
                            return subentry;
                        }
                    }
                    continue;
                }

                if (except?.has(entry)) {
                    continue;
                }

                if (selector(entry)) {
                    return entry;
                }
            }
        }
    }

    #select(selector: Children.Selector, allowedTags?: Children.TagSelector, except?: Set<Model>) {
        this.#reify();

        if (typeof selector === "string") {
            return this.#indexLookup(selector, "byName", allowedTags, except, model => model);
        }

        if (typeof selector === "number") {
            return this.#indexLookup(selector, "byId", allowedTags, except, model => model);
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

        if (typeof selector === "string") {
            this.#indexLookup(selector, "byName", allowedTags, except, model => {
                results.push(model);
            });
        } else {
            this.#indexLookup(selector, "byId", allowedTags, except, model => {
                results.push(model);
            });
        }

        return results;
    }

    #updateId(child: Model, oldId: number | undefined) {
        if (!this.#indices) {
            return;
        }
        for (const [type, slot] of this.#indices.entries()) {
            if (child instanceof type) {
                if (oldId !== undefined) {
                    this.#indexDelete(slot.byId, oldId, child);
                }
                if (child.id !== undefined) {
                    this.#indexInsert(slot.byId, child.id, child);
                }
            }
        }
    }

    #updateName(child: Model, oldName: string) {
        if (this.#onNameChanged) {
            this.#onNameChanged(oldName, undefined);
            this.#onNameChanged(child.name, child);
        }

        if (!this.#indices) {
            return;
        }

        for (const [type, slot] of this.#indices.entries()) {
            if (child instanceof type) {
                if (oldName !== undefined) {
                    this.#indexDelete(slot.byName, oldName, child);
                }
                if (child.name !== undefined) {
                    this.#indexInsert(slot.byName, child.name, child);
                }
            }
        }
    }

    // We implement "splice" for efficiency...  The default implementation moves elements one at a time, forcing us to
    // search the array to see if it's already present each time
    #splice(index: number, deleteCount?: number, ...toAdd: Model.TaggedDefinition<T>[]) {
        // Upgrade elements as necessary and adopt any new models
        toAdd = toAdd.map(child => {
            child = this.#insertionFormOf(child);
            if (child instanceof ModelConstructor) {
                this.#doAdopt(child);
            }
            return child;
        });

        // Perform the actual splice
        const result = this.#children.splice(index, deleteCount ?? 0, ...toAdd);

        // Convert deleted elements to models and disown elements that are already models
        return result.map(child => {
            if (child instanceof ModelConstructor) {
                this.#doDisown(child);
            } else {
                child = ModelConstructor.create(child as unknown as AnyElement) as T;
            }
            return child;
        });
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
                this.#addChild(child);
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

            case "updateId":
                return (child: Model, oldId: number | undefined) => this.#updateId(child, oldId);

            case "updateName":
                return (child: Model, oldName: string) => this.#updateName(child, oldName);

            case "splice":
                return (index: number, deleteCount?: number, ...toAdd: Model.TaggedDefinition<T>[]) =>
                    this.#splice(index, deleteCount, ...toAdd);

            case "freeze":
                return () => this.#finalize();

            case "toString":
                return () => `[Children: ${this.#children.length}]`;

            case "rerootAll":
                return (isOwned: boolean) => this.#rerootAll(isOwned);
        }

        return Reflect.get(this.#children, name, receiver);
    }

    #proxySet(name: string | symbol, value: any, receiver: unknown) {
        if (typeof name !== "string" || !name.match(/^\d+$/)) {
            switch (name) {
                case "length":
                    if (value > this.#children.length) {
                        // Do not allow preallocation that would create gaps
                        return true;
                    }
                    break;

                case "onNameChanged":
                    this.#reify();
                    this.#onNameChanged = value;
                    return true;
            }
            return Reflect.set(this.#children, name, value, receiver);
        }

        this.#validateChild(value);

        const existing = this.#children[name as unknown as number];
        if (existing !== undefined) {
            if (existing === value) {
                return true;
            }
            if (existing instanceof ModelConstructor) {
                this.#deleteChild(existing);
            }
        }

        let targetIndex = name as unknown as number;

        if (value.parent?.children === this.#proxy) {
            const currentIndex = this.#children.indexOf(value);
            if (currentIndex !== -1) {
                this.#children.splice(currentIndex, 1);

                if (currentIndex < targetIndex) {
                    targetIndex--;
                }
            }
        } else {
            value = this.#insertionFormOf(value);
            if (value instanceof ModelConstructor) {
                this.#addChild(value);
            }
        }

        if (targetIndex > this.#children.length) {
            targetIndex = this.#children.length;
        }

        this.#children[targetIndex] = value;

        return true;
    }

    #proxyDeleteProperty(p: string | symbol) {
        let child: undefined | Model.TaggedDefinition<T>;

        if (typeof p === "string" && p.match(/^\d+$/)) {
            child = this.#children[p as unknown as number];
        }

        // oxlint-disable-next-line @typescript-eslint/no-array-delete
        delete this.#children[p as unknown as number];

        // Child may have been added elsewhere in the index so only delete if not still present
        if (child instanceof ModelConstructor && !this.#children.includes(child)) {
            this.#deleteChild(child);
        }

        return true;
    }
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
