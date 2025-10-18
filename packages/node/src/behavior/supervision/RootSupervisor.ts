/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, InternalError } from "#general";
import {
    AttributeModel,
    ClusterModel,
    ElementTag,
    FeatureMap,
    FeatureSet,
    Matter,
    Model,
    ModelIndex,
    Schema,
    Scope,
    ValueModel,
} from "#model";
import { AccessControl, Val } from "#protocol";
import { AttributeId } from "#types";
import { ValueCaster } from "../state/managed/values/ValueCaster.js";
import { ValueManager } from "../state/managed/values/ValueManager.js";
import { ValuePatcher } from "../state/managed/values/ValuePatcher.js";
import { ValueValidator } from "../state/validation/ValueValidator.js";
import { ValueSupervisor } from "./ValueSupervisor.js";

/**
 * Global attributes repeat for every cluster and for those where metadata does not change we cache supervision methods
 * for reuse.
 */
const GlobalAttributeSupervisors = {} as Record<number, ValueSupervisor>;

/**
 * We assume schema is immutable so we can cache supervisors.
 */
const cache = new WeakMap<Schema, RootSupervisor>();

/**
 * A RootSupervisor is a {@link ValueSupervisor} that supervises a specific root {@link Schema}.  It acts as a factory
 * for {@link ValueSupervisor}s for sub-schemas of the root schema.
 *
 * You can produce a ValueSupervisor for any schema using this factory. However, there are specific customizations
 * controlled by the root schema:
 *
 * - Change eventing occur for root schema members.  In the case of a cluster this means you can monitor for changes on
 *   a per-attribute basis.
 *
 * - If the root schema defines a cluster, the cluster's featureMap and supportedFeatures affect conformance-based
 *   validation.
 */
export class RootSupervisor implements ValueSupervisor {
    #generating = new Set<Schema>();
    #cache = new WeakMap<Schema, ValueSupervisor>();
    #featureMap: ValueModel;
    #supportedFeatures: FeatureSet;
    #scope: Scope;
    #members: Set<ValueModel>;
    #rootSchema: Schema;
    #root: ValueSupervisor;
    #memberNames?: Set<string>;
    #propertyNamesAndIds?: Map<string, AttributeId | undefined>;

    /**
     * Create a new supervisor.
     *
     * @param schema the {@link Schema} for the supervised data
     */
    constructor(schema: Schema) {
        this.#rootSchema = schema;

        this.#scope = Scope(schema, { forceCache: true, forceOwner: true });

        if (schema instanceof ClusterModel) {
            this.#featureMap = schema.featureMap;
            this.#supportedFeatures = schema.supportedFeatures ?? new FeatureSet();
        } else {
            this.#featureMap = new AttributeModel(FeatureMap);
            this.#supportedFeatures = new FeatureSet();
        }
        this.#members = new Set(this.membersOf(schema));

        this.#root = this.#createValueSupervisor(schema);
    }

    /**
     * Obtain the supervisor for schema.  The result is cached.
     */
    static for<T extends Schema | undefined>(
        schema: T,
    ): T extends undefined ? RootSupervisor | undefined : RootSupervisor {
        if (!schema) {
            return undefined as any;
        }

        if (cache.has(schema)) {
            return cache.get(schema)!;
        }

        const supervisor = new RootSupervisor(schema);
        cache.set(schema, supervisor);

        return supervisor;
    }

    get owner() {
        return this.#root.owner;
    }

    get schema() {
        return this.#rootSchema;
    }

    get scope() {
        return this.#scope;
    }

    get access() {
        return this.#root.access;
    }

    get validate() {
        return this.#root.validate;
    }

    get manage() {
        return this.#root.manage;
    }

    get patch() {
        return this.#root.patch;
    }

    get cast() {
        return this.#root.cast;
    }

    /**
     * The names of all members.
     */
    get memberNames() {
        let names = this.#memberNames;
        if (!names) {
            names = new Set();
            for (const member of this.#members) {
                names.add(camelize(member.name));
            }
            this.#memberNames = names;
        }
        return names;
    }

    /**
     * Retrieve names or IDs of fields configured as non-volatile.
     */
    persistentKeys(key: "id" | "name" = "name") {
        const persistent = new Set<string>();

        for (const member of this.#members) {
            // TODO: We should handle writable/fabric scoped being non-volatile already in the conformance interpreter
            if (
                member.effectiveQuality.nonvolatile ||
                // Persist all writable attributes in addition to those officially marked as nonvolatile
                (member.tag === ElementTag.Attribute &&
                    (member.effectiveAccess.writable || member.effectiveAccess.fabricScoped))
            ) {
                if (key === "id") {
                    const id = member.effectiveId;
                    if (id !== undefined) {
                        persistent.add(id.toString());
                        continue;
                    }
                }
                persistent.add(camelize(member.name));
            }
        }
        return persistent;
    }

    get propertyNamesAndIds() {
        let names = this.#propertyNamesAndIds;
        if (!names) {
            names = new Map();
            for (const member of this.#members) {
                names.set(camelize(member.name), member.id as AttributeId | undefined);
            }
            this.#propertyNamesAndIds = names;
        }
        return names;
    }

    /**
     * Retrieve members for schema in {@link scope}.
     *
     * The {@link Scope.ConformanceMode} defaults to "deconflicted" if you do not override.
     */
    membersOf<T extends Schema>(schema: T, options: Scope.MemberOptions = {}): ModelIndex<Model.ChildOf<T>> {
        if (options.conformance === undefined) {
            options = { ...options, conformance: "deconflicted" };
        }
        return this.#scope.membersOf(schema, options);
    }

    /**
     * All available features defined in the schema.
     */
    get featureMap() {
        return this.#featureMap;
    }

    /**
     * Features supported by this implementation.
     */
    get supportedFeatures() {
        return this.#supportedFeatures;
    }

    /**
     * Obtain {@link ValueSupervisor} implementation for a specific schema.
     *
     * @param schema the model describing the record type
     * @returns the I/O implementation
     */
    get(schema: Schema): ValueSupervisor {
        if (schema === this.#rootSchema) {
            return this;
        }

        let supervisor = this.#cache.get(schema);

        if (supervisor === undefined) {
            if (schema.tag === "attribute" && schema.id !== undefined && schema.id in GlobalAttributeSupervisors) {
                supervisor = {
                    ...GlobalAttributeSupervisors[schema.id],
                    owner: this,
                    schema,
                };
            } else {
                supervisor = this.#createValueSupervisor(schema);
            }

            this.#cache.set(schema, supervisor);
        }

        return supervisor;
    }

    #createValueSupervisor(schema: Schema) {
        // Implements deferred generation (see comments below).  Proxies to the real generator, installs the generated
        // function, then invokes. Since I/O functions are properties and not methods, we then continue to proxy to the
        // generated function for places where the function is held directly.
        const deferGeneration = (
            name: string,
            generator: (schema: Schema, supervisor: RootSupervisor, base?: new () => Val) => any,
        ) => {
            let generated = false;

            return ((...args: any[]): any => {
                if (!generated) {
                    if (manager === undefined) {
                        throw new InternalError("Deferred I/O generation invoked impossibly early");
                    }

                    (manager as any)[name] = generator(schema, this);

                    generated = true;
                }

                return (manager as any)[name](...args);
            }) as any;
        };

        let manager: ValueSupervisor;
        if (this.#isGenerating(schema)) {
            manager = {
                owner: this,
                schema,
                access: AccessControl(schema),
                validate: deferGeneration("validate", ValueValidator),
                manage: deferGeneration("manage", ValueManager),
                patch: deferGeneration("patch", ValuePatcher),
                cast: deferGeneration("cast", ValueCaster),
            };
        } else {
            try {
                this.#generating.add(schema);
                manager = {
                    owner: this,
                    schema,
                    access: AccessControl(schema),
                    validate: ValueValidator(schema, this),
                    manage: ValueManager(schema, this),
                    patch: ValuePatcher(schema, this),
                    cast: ValueCaster(schema, this),
                };
            } finally {
                this.#generating.delete(schema);
            }
        }

        this.#cache.set(schema, manager);

        return manager;
    }

    /**
     * If a schema has circular references, code generation may need to defer generation of child functions to avoid
     * infinite loops.
     *
     * In order to keep generation code simpler we use this method to detect when lazy generation is necessary and
     * install stubs that bootstrap each method.
     */
    #isGenerating(schema: Schema) {
        return this.#generating.has(schema);
    }
}

const PrototypicalCluster = new ClusterModel({ name: "Prototype" });
for (const attribute of Matter.all(AttributeModel)) {
    if (attribute.id === undefined || attribute.name === "FeatureMap") {
        continue;
    }

    PrototypicalCluster.children.push(attribute.clone());
}

const GlobalSupervisor = new RootSupervisor(PrototypicalCluster);
for (const attribute of PrototypicalCluster.children) {
    if (attribute.id === undefined || attribute.id === FeatureMap.id) {
        continue;
    }

    GlobalAttributeSupervisors[attribute.id] = GlobalSupervisor.get(attribute);
}
