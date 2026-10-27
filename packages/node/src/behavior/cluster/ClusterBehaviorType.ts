/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describeList, GeneratedClass, ImplementationError } from "@matter/general";
import {
    ClassSemantics,
    ClusterModel,
    CommandModel,
    ElementTag,
    FeatureSet,
    Matter,
    Schema,
    Scope,
} from "@matter/model";
import { ClusterType } from "@matter/types";
import { Behavior } from "../Behavior.js";
import { type DerivationContext, deriveStatics } from "../internal/ClusterDerivation.js";
import { setDeclaredSchema } from "../internal/DeclaredSchema.js";
import { introspectionInstanceOf } from "./cluster-behavior-utils.js";
import type { ClusterBehavior } from "./ClusterBehavior.js";
import { ClusterBehaviorCache } from "./ClusterBehaviorCache.js";

/**
 * Generates a {@link ClusterBehavior.Type}.
 *
 * This factory performs runtime class generation of behaviors associated with a Matter cluster.  It implements
 * ClusterBehavior.for() directly and is a core component of PeerBehavior().
 */
export function ClusterBehaviorType({
    namespace,
    base,
    features,
    schema,
    name,
    forClient,
    commandFactory,
}: ClusterBehaviorType.Configuration) {
    // Resolve schema: from param, from base, from namespace, or from Matter model.  Base takes priority over
    // namespace because it may have extended the schema (e.g. to relax constraints for custom validation).
    if (schema === undefined) {
        const baseSchema = Schema(base);
        if (baseSchema?.tag === ElementTag.Cluster) {
            schema = baseSchema;
        }
        if (!schema && namespace) {
            schema = (namespace as ClusterType).schema;
        }
        if (!schema && namespace) {
            const nsId = (namespace as { id?: number }).id;
            if (nsId !== undefined) {
                schema = schemaForId(nsId);
            }
        }
    }

    if (!schema) {
        throw new ImplementationError("ClusterBehaviorType: no schema available");
    }

    // Apply feature selection to schema
    if (features !== undefined) {
        schema = applyFeatureSelection(schema, features);
    } else {
        schema = syncFeatures(schema, namespace);
    }

    // A feature the specification mandates without condition is not a selection.  We support it in our own
    // implementations; for a peer we defer to the features it reports
    if (!forClient) {
        schema = selectUnconditionalFeatures(schema);
    }

    // Construct namespace from schema if not provided
    if (!namespace) {
        namespace = ClusterType(schema);
    }

    const useCache = name === undefined && commandFactory === undefined;

    if (useCache) {
        const cached = ClusterBehaviorCache.get(base, schema, namespace, forClient);
        if (cached) {
            return cached;
        }

        if (base.name.startsWith(schema.name)) {
            name = base.name;
        } else {
            name = `${schema.name}Behavior`;
        }
    }

    const context: DerivationContext = {
        scope: Scope(schema),
        namespace,
        base,
        newProps: {},
        forClient,
        commandFactory,
    };

    const { State, Events, features: supportedFeatures } = deriveStatics(context, schema);

    const type = GeneratedClass({
        name,
        base,

        // Assigned, so ClusterBehavior's accessors record namespace, features and ID
        staticProperties: {
            State,
            Events,
            id: idOf(base, schema),
            cluster: namespace,
            features: supportedFeatures,
        },

        instanceDescriptors: createDefaultCommandDescriptors(context),
    }) as ClusterBehavior.Type;

    // Decorate the class
    setDeclaredSchema(type, schema);
    ClassSemantics.of(type).mutableModel = schema;

    // Mutation of schema will almost certainly result in logic errors so ensure that can't happen
    schema.finalize();

    if (useCache) {
        ClusterBehaviorCache.set(base, schema, namespace, type, forClient);
    }

    return type as ClusterBehavior.Type;
}

export namespace ClusterBehaviorType {
    export interface Configuration {
        /**
         * The cluster namespace for the new behavior.  If omitted, a minimal namespace is constructed from schema.
         */
        namespace?: object;

        /**
         * The behavior to extend.
         */
        base: Behavior.Type;

        /**
         * Feature selection.  A list of feature names, or `true` for "complete" (all elements regardless of
         * conformance).
         */
        features?: readonly string[] | true;

        /**
         * The schema for the new behavior.
         *
         * If omitted uses the schema from the namespace or the standard Matter data model.
         */
        schema?: Schema.Cluster;

        /**
         * Name used for the generated class.
         *
         * If omitted derives name from the schema.
         */
        name?: string;

        /**
         * Modify generation for client instrumentation.
         *
         * This affects a few things like how quieter events generate.
         */
        forClient?: boolean;

        /**
         * Factory for command implementations.
         *
         * By default, commands install as {@link Behavior.unimplemented}.  In client scenarios this allows the caller to
         * provide a useful default implementation.
         */
        commandFactory?: CommandFactory;
    }

    export interface CommandFactory {
        (name: string, commandModel?: CommandModel): (this: ClusterBehavior, fields?: {}) => unknown;
    }
}

/**
 * Obtain schema for a particular cluster by ID.
 */
function schemaForId(id: number) {
    for (const child of Matter.children) {
        if (child.tag === ElementTag.Cluster && child.id === id) {
            return child as ClusterModel;
        }
    }
    return undefined;
}

/**
 * We cache schema for clusters configured for certain features.  This in turn enables the RootSupervisor cache which
 * keys off of the schema.
 */
const configuredSchemaCache = new WeakMap<Schema.Cluster, Record<string, Schema.Cluster>>();

/**
 * Schema that differ from another only by feature selection cache against that schema, so a selection reapplied to a
 * variant converges on the original object rather than minting a third.
 */
const featureVariantOrigin = new WeakMap<Schema.Cluster, Schema.Cluster>();

/**
 * Ensure the supported features enumerated by schema align with a namespace's feature selection.
 */
function syncFeatures(schema: Schema.Cluster, namespace: object | undefined) {
    const nsSupportedFeatures = (namespace as { supportedFeatures?: Record<string, boolean> } | undefined)
        ?.supportedFeatures;
    if (nsSupportedFeatures === undefined) {
        return schema;
    }

    return syncFeaturesFromSet(schema, featureSetFor(schema, new FeatureSet(nsSupportedFeatures)));
}

/**
 * Apply a feature selection to a schema.  If `features` is `true`, all elements are included regardless of
 * conformance ("complete" mode).
 */
function applyFeatureSelection(schema: Schema.Cluster, features: readonly string[] | true): Schema.Cluster {
    const names = features === true ? (schema as ClusterModel).features.map(feature => feature.name) : features;

    return syncFeaturesFromSet(schema, featureSetFor(schema, names));
}

/**
 * Map feature names to a schema's FeatureSet short codes.
 */
function featureSetFor(schema: Schema.Cluster, names: Iterable<string>) {
    const model = schema as ClusterModel;
    const { features } = model;
    const { features: resolved, unresolved } = FeatureSet.resolve(features, names);

    if (unresolved.length) {
        throw new ImplementationError(
            `${model.name} has no feature ${describeList("and", ...unresolved.map(name => `"${name}"`))}; known features are ${FeatureSet.titlesOf(features).join(", ")}`,
        );
    }

    return resolved;
}

/**
 * Ensure features the specification mandates without condition are selected.
 */
function selectUnconditionalFeatures(schema: Schema.Cluster) {
    const unconditional = (schema as ClusterModel).unconditionalFeatures;
    if (!unconditional.size) {
        return schema;
    }

    const selection = new FeatureSet([...schema.supportedFeatures, ...unconditional]);

    return syncFeaturesFromSet(schema, selection);
}

/**
 * Apply a FeatureSet to a schema, using the cache.
 */
function syncFeaturesFromSet(schema: Schema.Cluster, featureSet: FeatureSet): Schema.Cluster {
    if (featureSet.is(schema.supportedFeatures)) {
        return schema;
    }

    const origin = featureVariantOrigin.get(schema) ?? schema;
    if (featureSet.is(origin.supportedFeatures)) {
        return origin;
    }

    const featureKey = [...featureSet].sort().join(",");
    let schemaBucket = configuredSchemaCache.get(origin);
    if (schemaBucket === undefined) {
        schemaBucket = {};
        configuredSchemaCache.set(origin, schemaBucket);
    } else if (featureKey in schemaBucket) {
        return schemaBucket[featureKey];
    }

    const variant = origin.clone();
    variant.supportedFeatures = featureSet;
    schemaBucket[featureKey] = variant;
    featureVariantOrigin.set(variant, origin);

    return variant;
}

const sourceFactory = Symbol("source-factory");

interface MarkedCommand {
    [sourceFactory]?: ClusterBehaviorType.CommandFactory;
}

/**
 * Create descriptors for any command methods that are not already present in the base class.
 */
function createDefaultCommandDescriptors({ scope, base, commandFactory }: DerivationContext) {
    const result = {} as Record<string, PropertyDescriptor>;
    const instance = introspectionInstanceOf(base);

    // We add functions for all commands, not just those that are conformant.  This ensures that the interface is
    // compatible with the "client" clusters.  Commands that are nonconformant will not appear in the type and if
    // somehow invoked will result in an "unimplemented" error
    const commandModels = scope.membersOf(scope.owner, { tags: [ElementTag.Command] });
    const names = new Set(commandModels.map(command => command.propertyName));
    const commandsByName = new Map(commandModels.map(cmd => [cmd.propertyName, cmd as CommandModel]));

    const conformantNames = new Set(
        scope
            .membersOf(scope.owner, { tags: [ElementTag.Command], conformance: "conformant" })
            .map(command => command.propertyName),
    );

    for (const name of names) {
        let implementation;

        // Choose implementation, or skip if appropriate implementation is already present
        if (!conformantNames.has(name)) {
            if (instance[name] && instance[name] !== Behavior.unimplemented) {
                continue;
            }
        }
        if (commandFactory) {
            // With a factory, replace any existing implementation not provided by the factory
            if ((instance[name] as MarkedCommand | undefined)?.[sourceFactory] === commandFactory) {
                continue;
            }

            implementation = commandFactory(name, commandsByName.get(name));

            (implementation as MarkedCommand)[sourceFactory] = commandFactory;
        } else {
            // Otherwise make sure we at least have an "unimplemented"... um, implementation
            if (instance[name]) {
                continue;
            }
            implementation = Behavior.unimplemented;
        }

        result[name] = {
            value: implementation,
            writable: true,
        };
    }

    return result;
}

/**
 * A variant of a behavior for the same cluster keeps the behavior's id, so it replaces that behavior on an endpoint
 * rather than joining it.  A decorated subclass names its schema after the class, so the schema's name is not the id.
 */
function idOf(base: Behavior.Type, schema: ClusterModel) {
    if (
        "cluster" in base &&
        typeof base.cluster === "object" &&
        base.cluster !== null &&
        "id" in base.cluster &&
        base.cluster.id === schema.id
    ) {
        return base.id;
    }
    return schema.propertyName as Uncapitalize<string>;
}
