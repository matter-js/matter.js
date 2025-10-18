/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { AnyElement, BaseElement } from "#elements/index.js";
import { camelize, ImplementationError } from "#general";
import type { Model } from "./Model.js";

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

/**
 * Invoked by {@link Model} to instantiate a new child array.
 */
export function Children<T extends Model = Model>(
    initial: Children.InputIterable<T>,
    adopt: (child: Model) => void,
    reroot: (child: Model, isOwned: boolean) => boolean,
    disown: (child: Model) => boolean,
) {
    // The actual list of children.  We maintain children as elements until they're accessed.  This allows us to build
    // the full model without instantiating thousands of Models we may never use
    const children = Array<Model.TaggedDefinition<T>>();

    // Set to true when we are using the list of children operationally.  After reification the "children" array
    // contains only models
    let reified = false;

    // Index data.  This is a map of constructor -> (ID index, name index)
    //
    // There is an index for any constructor for which lookup has been performed.  Note that models may appear in more
    // than one constructor slot because we support lookup by any class in the inheritance hierarchy.  E.g.
    // AttributeModel could appear in an index for both AttributeModel and ValueModel.
    //
    // ID indices are sparse arrays.  Name indices are objects.
    //
    // We allow for an array in the index slot because we allow duplicate IDs or names.  This may be illegal but we
    // catch this in validation.  We only return the first entry on index lookup but this way the index remains correct
    // if e.g. a duplicate entry is inserted temporarily then deleted.
    //
    // We also allow for a single Model in the index slot because name/ID duplicates are very uncommon so we can avoid
    // the array > 99% of the time.
    let indices:
        | undefined
        | Map<
              abstract new (...args: any[]) => Model,
              {
                  byId: IndexEntry[];
                  byName: Record<string, IndexEntry>;
              }
          >;

    // Callback; used to maintain external indices
    let onNameChanged: undefined | ((name: string, model?: Model) => void);

    /**
     * Enter "reified" mode (see comment above).
     */
    function reify() {
        if (reified) {
            return;
        }
        for (let i = 0; i < children.length; i++) {
            let child = children[i];
            if (child instanceof ModelConstructor) {
                continue;
            }
            child = ModelConstructor.create(child as unknown as AnyElement) as T;
            doAdopt(child);
            children[i] = child;
        }
        reified = true;
    }

    /**
     * Determine if an element has any Model children.  If so we need to upgrade to a model on insertion.
     */
    function hasModel(child: BaseElement) {
        if (child instanceof ModelConstructor) {
            return true;
        }
        return child.children?.some(hasModel);
    }

    /**
     * Convert a new child to "insertion" form.  The input may be an element or model.  If we are reified, we upgrade
     * elements to models.  If child or any descendents is a model, we reify so models will have the correct parent
     * after insertion.
     */
    function insertionFormOf(child: Model.TaggedDefinition<T>) {
        if (child instanceof ModelConstructor) {
            return child;
        }

        if (reified || hasModel(child)) {
            return ModelConstructor.create(child as unknown as AnyElement) as T;
        }

        return child;
    }

    /**
     * Add a model to a name or ID index.
     */
    function indexInsert<K extends number | string>(index: Record<K, IndexEntry>, key: K, model: Model) {
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
    function indexDelete<K extends number | string>(index: Record<K, IndexEntry>, key: K, model: Model) {
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
    function buildIndex(type: Model.Type) {
        reify();

        const byId = Array<Model>();
        const byName = {} as Record<string, Model>;

        for (const child of children) {
            if (child instanceof type) {
                // By caching effectiveId we're assuming that models without an ID do not shift position within their
                // parent.  As this is effectively static data it should be OK
                const id = child.effectiveId;
                if (id !== undefined) {
                    indexInsert(byId, id, child);
                }
                indexInsert(byName, child.name, child);
            }
        }

        const slot = { byId, byName };

        if (!indices) {
            indices = new Map();
        }
        indices.set(type, slot);

        return slot;
    }

    /**
     * Remove a child of the model.  Clears model from indices and clears "parent" field.
     */
    function deleteChild(child: Model) {
        if (indices) {
            for (const [type, slot] of indices.entries()) {
                if (child instanceof type) {
                    if (child.id) {
                        indexDelete(slot.byId, child.id, child);
                    }
                    indexDelete(slot.byName, child.name, child);
                }
            }
        }

        onNameChanged?.(child.name, undefined);
        doDisown(child);
    }

    /**
     * Add a child of the model.  Adopts the model and adds to any applicable indices.
     */
    function addChild(child: Model) {
        if ((child.parent?.children as unknown) === children) {
            return;
        }

        if (indices) {
            for (const [type, slot] of indices.entries()) {
                if (child instanceof type) {
                    if (child.id) {
                        indexInsert(slot.byId, child.id, child);
                    }
                    indexInsert(slot.byName, child.name, child);
                }
            }
        }

        doAdopt(child);
    }

    /**
     * Recursively reroot a single child & descendents.
     *
     * Invoked when the child's parent changes.
     */
    function doReroot(child: Model, isOwned: boolean) {
        if (!reroot(child, isOwned) || !child.hasChildren) {
            return;
        }
        (child.children as InternalChildren).rerootAll(isOwned);
    }

    /**
     * Recursively reroot all children & descendents.
     *
     * Invoked when the owner's root changes.  Only affects reified models.
     */
    function rerootAll(isOwned: boolean) {
        for (const child of children) {
            if (child instanceof ModelConstructor) {
                doReroot(child, isOwned);
            }
        }
    }

    function doAdopt(child: Model) {
        adopt(child);
        onNameChanged?.(child.name, child);
        doReroot(child, true);
    }

    function doDisown(child: Model) {
        onNameChanged?.(child.name, undefined);
        if (disown(child)) {
            doReroot(child, false);
        }
    }

    function get(type: typeof Model, idOrName: number | string) {
        const value = all(type, idOrName);
        if (Array.isArray(value)) {
            return value[0];
        }
        return value;
    }

    function all(type: typeof Model, idOrName?: number | string) {
        const slot = indices?.get(type) ?? buildIndex(type);
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

    function selectTypes(tags: Children.TagSelector): Model.Type[] {
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

    function indexLookup<T>(
        selector: number | string,
        indexName: "byId" | "byName",
        allowedTags: Children.TagSelector,
        except: Set<Model> | undefined,
        processor: (model: Model) => T,
    ) {
        for (const type of selectTypes(allowedTags)) {
            let slot = indices?.get(type);
            if (slot === undefined) {
                slot = buildIndex(type);
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

    function indexApply(selector: (child: Model) => boolean, allowedTags: Children.TagSelector, except?: Set<Model>) {
        for (const type of selectTypes(allowedTags)) {
            let index = indices?.get(type)?.byName;
            if (!index) {
                index = buildIndex(type).byName;
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

    function select(selector: Children.Selector, allowedTags?: Children.TagSelector, except?: Set<Model>) {
        reify();

        if (typeof selector === "string") {
            return indexLookup(selector, "byName", allowedTags, except, model => model);
        }

        if (typeof selector === "number") {
            return indexLookup(selector, "byId", allowedTags, except, model => model);
        }

        return indexApply(selector, allowedTags, except);
    }

    function selectAll(
        selector: Exclude<Children.Selector, (args: any) => any>,
        allowedTags?: Children.TagSelector,
        except?: Set<Model>,
    ) {
        reify();

        const results = Array<Model>();

        if (typeof selector === "string") {
            indexLookup(selector, "byName", allowedTags, except, model => {
                results.push(model);
            });
        } else {
            indexLookup(selector, "byId", allowedTags, except, model => {
                results.push(model);
            });
        }

        return results;
    }

    function updateId(child: Model, oldId: number | undefined) {
        if (!indices) {
            return;
        }
        for (const [type, slot] of indices.entries()) {
            if (child instanceof type) {
                if (oldId !== undefined) {
                    indexDelete(slot.byId, oldId, child);
                }
                if (child.id !== undefined) {
                    indexInsert(slot.byId, child.id, child);
                }
            }
        }
    }

    function updateName(child: Model, oldName: string) {
        if (onNameChanged) {
            onNameChanged(oldName, undefined);
            onNameChanged(child.name, child);
        }

        if (!indices) {
            return;
        }

        for (const [type, slot] of indices.entries()) {
            if (child instanceof type) {
                if (oldName !== undefined) {
                    indexDelete(slot.byName, oldName, child);
                }
                if (child.name !== undefined) {
                    indexInsert(slot.byName, child.name, child);
                }
            }
        }
    }

    // We implement "splice" for efficiency...  The default implementation moves elements one at a time, forcing us to
    // search the array to see if it's already present each time
    function splice(index: number, deleteCount?: number, ...toAdd: Model.TaggedDefinition<T>[]) {
        // Upgrade elements as necessary and adopt any new models
        toAdd = toAdd.map(child => {
            child = insertionFormOf(child);
            if (child instanceof ModelConstructor) {
                doAdopt(child);
            }
            return child;
        });

        // Perform the actual splice
        const result = children.splice(index, deleteCount ?? 0, ...toAdd);

        // Convert deleted elements to models and disown elements that are already models
        return result.map(child => {
            if (child instanceof ModelConstructor) {
                doDisown(child);
            } else {
                child = ModelConstructor.create(child as unknown as AnyElement) as T;
            }
            return child;
        });
    }

    function finalize() {
        for (const child of self) {
            (child as Model).finalize();
        }
        Object.freeze(children);
    }

    function validateChild(value: unknown) {
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

    const self = new Proxy(children, {
        get(_target, name, receiver) {
            if (typeof name === "string" && name.match(/^\d+$/)) {
                let child = children[name as unknown as number];
                if (child && !(child instanceof ModelConstructor)) {
                    child = ModelConstructor.create(child as unknown as AnyElement) as T;
                    addChild(child);
                    children[name as unknown as number] = child;
                }

                return child;
            }

            switch (name) {
                case "get":
                    return get;

                case "all":
                    return all;

                case "select":
                    return select;

                case "selectAll":
                    return selectAll;

                case "updateId":
                    return updateId;

                case "updateName":
                    return updateName;

                case "splice":
                    return splice;

                case "freeze":
                    return finalize;

                case "toString":
                    return () => `[Children: ${children.length}]`;

                case "rerootAll":
                    return rerootAll;
            }

            return Reflect.get(children, name, receiver);
        },

        set(_target, name, value, receiver) {
            if (typeof name !== "string" || !name.match(/^\d+$/)) {
                switch (name) {
                    case "length":
                        if (value > children.length) {
                            // Do not allow preallocation that would create gaps
                            return true;
                        }
                        break;

                    case "onNameChanged":
                        reify();
                        onNameChanged = value;
                        return true;
                }
                return Reflect.set(children, name, value, receiver);
            }

            validateChild(value);

            const existing = children[name as unknown as number];
            if (existing !== undefined) {
                if (existing === value) {
                    return true;
                }
                if (existing instanceof ModelConstructor) {
                    deleteChild(existing);
                }
            }

            let targetIndex = name as unknown as number;

            if (value.parent?.children === self) {
                const currentIndex = children.indexOf(value);
                if (currentIndex !== -1) {
                    children.splice(currentIndex, 1);

                    if (currentIndex < targetIndex) {
                        targetIndex--;
                    }
                }
            } else {
                value = insertionFormOf(value);
                if (value instanceof ModelConstructor) {
                    addChild(value);
                }
            }

            if (targetIndex > children.length) {
                targetIndex = children.length;
            }

            children[targetIndex] = value;

            return true;
        },

        deleteProperty: (_target, p) => {
            let child: undefined | Model.TaggedDefinition<T>;

            if (typeof p === "string" && p.match(/^\d+$/)) {
                child = children[p as unknown as number];
            }

            // eslint-disable-next-line @typescript-eslint/no-array-delete
            delete children[p as unknown as number];

            // Child may have been added elsewhere in the index so only delete if not still present
            if (child instanceof ModelConstructor && !children.includes(child)) {
                deleteChild(child);
            }

            return true;
        },
    });

    // Clone child array because if it references a former parent they'll disappear as we add
    initial = [...initial];

    self.push(...initial);

    return self as InternalChildren<T>;
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
