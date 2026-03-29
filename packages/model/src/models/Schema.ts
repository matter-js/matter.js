/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterModel } from "#models/ClusterModel.js";
import { DatatypeModel } from "#models/DatatypeModel.js";
import type { Model } from "#models/Model.js";
import type { ValueModel } from "#models/ValueModel.js";
import { ImplementationError } from "@matter/general";
import { MissingMetadataError } from "../decoration/errors.js";
import { Semantics } from "../decoration/semantics/Semantics.js";

/**
 * Matter data structure semantics
 *
 * Here we use the term "schema" to mean any model element that defines a datatype.  For schema we allow any Matter
 * model for such an element.
 *
 * Most schema is a {@link ValueModel} which explicitly models data. {@link ClusterModel} is also valid schema.
 *
 * You will see references to "structs" and "lists" throughout our code. These are Matter's two container types and map
 * to JS objects and arrays respectively.  Thus we tend to use struct/object and list/array interchangeably.
 *
 * If schema is a {@link ClusterModel}, it models a struct with attributes as fields.
 *
 * Schema is immutable and cannot change moving forward.
 */
export type Schema = ClusterModel | ValueModel;

const schemaMap = new WeakMap<object, ValueModel | (() => ValueModel)>();

/**
 * Obtain {@link Schema} for a {@link Schema.Source} if present.
 */
export function Schema(source: Schema.Source) {
    let model;
    if (typeof source === "object" && source !== null && "tag" in source) {
        source.finalize();

        model = source;
    } else if (typeof source === "function" && "Tag" in source) {
        // Model constructor, not a user class
        model = undefined;
    } else {
        // Check the schema map first (covers classes with Schema.set and enum objects)
        const mapped = schemaMap.get(source as object);
        if (mapped !== undefined) {
            if (typeof mapped === "function") {
                const resolved = mapped();
                resolved.finalize();
                schemaMap.set(source as object, resolved);
                model = resolved;
            } else {
                mapped.finalize();
                model = mapped;
            }
        } else if (typeof source === "function") {
            const semantics = Semantics.classOf(source as NewableFunction);

            semantics.finalize();

            model = semantics.semanticModel;
        }
    }

    if (!model) {
        return;
    }

    if (model.tag !== "cluster" && !model.isType) {
        throw new ImplementationError(`Model ${model.name} tag ${model.tag} is not legal for schema`);
    }

    return model as Schema.Struct;
}

export namespace Schema {
    /**
     * Schema that defines an object with named properties.
     */
    export type Struct = ClusterModel | DatatypeModel;

    /**
     * Schema that defines a cluster.
     */
    export type Cluster = ClusterModel;

    /**
     * Obtain {@link Schema} that is required for operation.
     */
    export function Required(source: Model.Source) {
        const schema = Schema(source);

        if (schema === undefined) {
            throw new MissingMetadataError(`Metadata missing for class ${source.name}`);
        }

        return schema;
    }

    export type Source = Schema | NewableFunction | object;

    /**
     * Associate schema with an arbitrary object (class constructor or enum object).
     *
     * The factory form enables lazy resolution — the factory is invoked on first access and the result cached.
     */
    export function set(target: object, source: ValueModel | (() => ValueModel)) {
        schemaMap.set(target, source);
    }

    export const empty = new DatatypeModel({ name: "Empty", type: "struct" });

    empty.finalize();
}
