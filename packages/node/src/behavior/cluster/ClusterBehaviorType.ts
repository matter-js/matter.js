/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Events, OfflineEvent, OnlineEvent, QuietEvent } from "#behavior/Events.js";
import { AsyncObservable, camelize, EventEmitter, GeneratedClass, ImplementationError } from "@matter/general";
import {
    ClassSemantics,
    ClusterModel,
    DecodedBitmap,
    DefaultValue,
    ElementTag,
    FeatureMap,
    FeatureSet,
    Matter,
    Metatype,
    Schema,
    Scope,
    ValueModel,
} from "@matter/model";
import { Val } from "@matter/protocol";
import { ClusterNamespace } from "@matter/types";
import { Behavior } from "../Behavior.js";
import { DerivedState } from "../state/StateType.js";
import type { ClusterBehavior } from "./ClusterBehavior.js";
import { ClusterBehaviorCache } from "./ClusterBehaviorCache.js";
import { introspectionInstanceOf } from "./cluster-behavior-utils.js";

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
        if (base.schema?.tag === ElementTag.Cluster) {
            schema = base.schema;
        }
        if (!schema && namespace) {
            schema = (namespace as ClusterNamespace).schema;
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

    // Construct namespace from schema if not provided
    if (!namespace) {
        namespace = createNamespaceFromSchema(schema);
    }

    const useCache = name === undefined;

    if (useCache) {
        const cached = ClusterBehaviorCache.get(base, schema, forClient);
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

    // Compute supported features as a flags object for the instance getter
    const supportedFeatures = computeFeatureFlags(schema);

    const type = GeneratedClass({
        name,
        base,

        staticProperties: {
            State: createDerivedState(context),

            Events: createDerivedEvents(context),
        },

        staticDescriptors: {
            id: {
                value: schema.propertyName as Uncapitalize<string>,
                enumerable: true,
            },

            cluster: {
                value: namespace,
                enumerable: true,
            },

            features: {
                value: supportedFeatures,
                enumerable: true,
            },
        },

        instanceDescriptors: createDefaultCommandDescriptors(context),
    }) as ClusterBehavior.Type;

    // Decorate the class
    ClassSemantics.of(type).mutableModel = schema;

    // If the schema was overridden, it won't change with class semantics so override explicitly if necessary
    if (type.schema !== schema) {
        Object.defineProperty(type, "schema", { value: schema });
    }

    // Mutation of schema will almost certainly result in logic errors so ensure that can't happen
    schema.finalize();

    if (useCache) {
        ClusterBehaviorCache.set(base, schema, type);
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
        (name: string): (this: ClusterBehavior, fields?: {}) => unknown;
    }
}

interface DerivationContext {
    namespace: object;
    scope: Scope;
    base: Behavior.Type;
    newProps: Record<string, ValueModel>;
    forClient?: boolean;
    commandFactory?: ClusterBehaviorType.CommandFactory;
}

const KNOWN_DEFAULTS = Symbol("knownDefaults");

/**
 * This is an internal utility used to track default values that we've erased due to conformance.  We reuse in
 * derivatives if the property is once again enabled.
 *
 * We cast the state constructor to this type so [KNOWN_DEFAULTS] becomes a static field on the state class.
 */
interface HasKnownDefaults {
    [KNOWN_DEFAULTS]?: Val.Struct;
}

/**
 * Create a new state subclass that inherits relevant default values from a base Behavior.Type and adds new default
 * values from cluster attributes.
 *
 * Note - we only use the schema for default values, not the cluster
 */
function createDerivedState({ scope, base, newProps }: DerivationContext) {
    const BaseState = base["State"];
    if (BaseState === undefined) {
        throw new ImplementationError(`No state class defined for behavior class ${base.name}`);
    }

    const schema = scope.owner as Schema.Cluster;

    const oldDefaults = new BaseState() as Record<string, any>;
    let knownDefaults = (BaseState as HasKnownDefaults)[KNOWN_DEFAULTS];

    // Index schema members by name
    const props = {} as Record<string, ValueModel[]>;
    for (const member of scope.membersOf(scope.owner, { conformance: "deconflicted" })) {
        const name = member.propertyName;
        if (props[name]) {
            props[name].push(member as ValueModel);
        } else {
            props[name] = [member as ValueModel];
        }
    }

    // For each new attribute, inject the attribute's default if we don't already have a value, then inject a descriptor
    const defaults = {} as Record<string, any>;
    for (const name in props) {
        // Determine whether attribute applies based on conformance.  If it doesn't, make sure to overwrite any existing
        // value from previous configurations as otherwise conformance may not pass
        const attrs = props[name];
        let propSchema: ValueModel | undefined;

        // Determine whether the attribute applies
        for (const attr of attrs) {
            // Ignore if inapplicable
            if (!attr.effectiveConformance.applicabilityFor(scope)) {
                continue;
            }

            // Use this model for the property
            propSchema = attr;
            break;
        }

        // If the attribute doesn't apply, erase any previous default unless conditionally applicable
        if (!propSchema) {
            // Inapplicable; ensure no default is present
            if (oldDefaults[name] !== undefined) {
                // Save the default value so we can recreate it if a future derivative re-enables this element
                if (!knownDefaults) {
                    knownDefaults = {};
                } else if (knownDefaults === (BaseState as HasKnownDefaults)[KNOWN_DEFAULTS]) {
                    knownDefaults = { ...knownDefaults };
                }
                knownDefaults[name] = oldDefaults[name];

                // Now clear the default value
                defaults[name] = undefined;
            }

            continue;
        }

        // Attribute applies
        newProps[name] = propSchema;

        // The feature map value requires a special case because it's encoded in the schema's supportedFeatures
        if (propSchema.id === FeatureMap.id) {
            defaults[name] = computeFeatureFlags(schema as ClusterModel);
            continue;
        }

        // Make sure a default value is present if mandatory or marked as supported (note that the default value may
        // be "undefined" to indicate that an attribute is available optionally)
        defaults[name] = selectDefaultValue(
            scope,
            oldDefaults[name] === undefined ? knownDefaults?.[name] : oldDefaults[name],
            propSchema,
        );
    }

    const StateType = DerivedState({
        name: `${schema.name}$State`,
        base: base.State,
        values: defaults,
    });

    if (knownDefaults) {
        (StateType as HasKnownDefaults)[KNOWN_DEFAULTS] = knownDefaults;
    }

    return StateType;
}

/**
 * Extend events with additional implementations.
 */
function createDerivedEvents({ scope, base, newProps, forClient }: DerivationContext) {
    const instanceDescriptors = {} as PropertyDescriptorMap;

    const baseInstance = new base.Events() as unknown as Record<string, unknown>;

    const eventNames = new Set<string>();

    // Events are generally OnlineEvent except in the case of server-side elements marked Q
    const quieterImplementation = forClient ? OnlineEvent : QuietEvent;

    // Add events that are mandatory or marked as supported and not present in the base class
    const applicableClusterEvents = new Set();
    for (const event of scope.membersOf(scope.owner as Schema, {
        conformance: "conformant",
        tags: [ElementTag.Event],
    })) {
        const name = event.propertyName;
        applicableClusterEvents.add(name);

        // Do not implement if already supported
        if (baseInstance[name] !== undefined) {
            continue;
        }

        // For clients we implement all events because we can't know what's supported now that EventList is gone.  For
        // servers we only add events that are explicitly
        if (!forClient && !scope.hasOperationalSupport(event)) {
            continue;
        }

        // Add the event
        eventNames.add(name);
        instanceDescriptors[name] = createEventDescriptor(
            name,
            event,
            event.quality.quieter ? quieterImplementation : OnlineEvent,
        );
    }

    // Add events for mandatory attributes that are not present in the base class
    for (const attrName in newProps) {
        const changing = `${attrName}$Changing`;
        const prop = newProps[attrName];
        if (baseInstance[changing] === undefined) {
            eventNames.add(changing);
            instanceDescriptors[changing] = createEventDescriptor(changing, prop, OfflineEvent);
        }

        const changed = `${attrName}$Changed`;
        if (baseInstance[changed] === undefined) {
            eventNames.add(changed);

            instanceDescriptors[changed] = createEventDescriptor(
                changed,
                prop,
                prop.quality.quieter ? quieterImplementation : OnlineEvent,
            );
        }
    }

    // TODO - if necessary, mask out (set to undefined) events present in base cluster but not derived cluster

    return GeneratedClass({
        name: `${base.name}$Events`,
        base: base.Events,

        instanceDescriptors,

        initialize(this: EventEmitter) {
            for (const name of eventNames) {
                this.addEvent(name);
            }
        },
    });
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
const configuredSchemaCache = new Map<Schema.Cluster, Record<string, Schema.Cluster>>();

/**
 * Ensure the supported features enumerated by schema align with a namespace's feature selection.
 */
function syncFeatures(schema: Schema.Cluster, namespace: object | undefined) {
    // Determine features from namespace's supportedFeatures or schema
    let incomingFeatures: FeatureSet;

    const nsSupportedFeatures = (namespace as { supportedFeatures?: Record<string, boolean> } | undefined)
        ?.supportedFeatures;
    if (nsSupportedFeatures) {
        incomingFeatures = new FeatureSet(nsSupportedFeatures);
    } else {
        // No feature override — use schema's defaults
        return schema;
    }

    if (incomingFeatures.is(schema.supportedFeatures)) {
        return schema;
    }

    // If we have cached this version of the cluster, return the cached schema
    const featureKey = [...incomingFeatures].sort().join(",");
    let schemaBucket = configuredSchemaCache.get(schema);
    if (schemaBucket === undefined) {
        schemaBucket = {};
        configuredSchemaCache.set(schema, schemaBucket);
    } else {
        if (featureKey in schemaBucket) {
            return schemaBucket[featureKey];
        }
    }

    // New schema
    schema = schema.clone();
    schema.supportedFeatures = incomingFeatures;

    // Cache
    schemaBucket[featureKey] = schema;

    return schema;
}

/**
 * Apply a feature selection to a schema.  If `features` is `true`, all elements are included regardless of
 * conformance ("complete" mode).  Otherwise, maps feature names to the schema's FeatureSet short codes.
 */
function applyFeatureSelection(schema: Schema.Cluster, features: readonly string[] | true): Schema.Cluster {
    if (features === true) {
        // "Complete" mode — clone schema and mark all features as supported
        const featureSet = new FeatureSet();
        for (const feature of (schema as ClusterModel).features) {
            featureSet.add(feature.name);
        }
        return syncFeaturesFromSet(schema, featureSet);
    }

    // Map user-facing feature names to schema short codes
    const featureSet = new FeatureSet();
    const model = schema as ClusterModel;
    for (const name of features) {
        for (const feature of model.features) {
            if ((feature.title ?? feature.name) === name || feature.name === name) {
                featureSet.add(feature.name);
                break;
            }
        }
    }

    return syncFeaturesFromSet(schema, featureSet);
}

/**
 * Apply a FeatureSet to a schema, using the cache.
 */
function syncFeaturesFromSet(schema: Schema.Cluster, featureSet: FeatureSet): Schema.Cluster {
    if (featureSet.is(schema.supportedFeatures)) {
        return schema;
    }

    const featureKey = [...featureSet].sort().join(",");
    let schemaBucket = configuredSchemaCache.get(schema);
    if (schemaBucket === undefined) {
        schemaBucket = {};
        configuredSchemaCache.set(schema, schemaBucket);
    } else if (featureKey in schemaBucket) {
        return schemaBucket[featureKey];
    }

    schema = schema.clone();
    schema.supportedFeatures = featureSet;
    schemaBucket[featureKey] = schema;

    return schema;
}

/**
 * Create a minimal namespace-like object from a schema for use as the `cluster` property.
 */
function createNamespaceFromSchema(schema: Schema.Cluster): object {
    const ns = { schema: schema as ClusterModel } as Record<string, unknown>;
    const model = schema as ClusterModel;

    if (model.id !== undefined) {
        ns.id = model.id;
    }
    ns.name = model.name;
    ns.revision = model.revision;

    ClusterNamespace.define(ns);

    return ns;
}

/**
 * Compute the feature flags object from a schema's supported features.
 */
function computeFeatureFlags(schema: ClusterModel): Record<string, boolean> {
    const flags: Record<string, boolean> = {};
    for (const child of schema.featureMap.children) {
        const key = camelize(child.title ?? child.name);
        flags[key] = schema.supportedFeatures.has(child.name);
    }
    return flags;
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
    const names = new Set(
        scope.membersOf(scope.owner, { tags: [ElementTag.Command] }).map(command => command.propertyName),
    );

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

            implementation = commandFactory(name);

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

function selectDefaultValue(scope: Scope, oldDefault: Val, member: ValueModel) {
    if (oldDefault !== undefined) {
        return oldDefault;
    }

    // No default unless mandatory or explicitly marked as implemented
    if (!scope.hasOperationalSupport(member)) {
        return;
    }

    // If there's an explicit default, use that
    const effectiveDefault = DefaultValue(scope, member);
    if (effectiveDefault !== undefined) {
        if (member.effectiveMetatype === "bitmap") {
            return DecodedBitmap(member, effectiveDefault);
        }
        return effectiveDefault;
    }

    // Default for nullable is null
    if (member.nullable) {
        return null;
    }

    switch (member.effectiveMetatype) {
        case Metatype.integer:
        case Metatype.float:
            return 0;

        case Metatype.boolean:
            return false;

        case Metatype.bitmap:
        case Metatype.object:
            // This is not a very good default but it is better than undefined
            return {};

        case Metatype.array:
            // Same
            return [];
    }
}

/**
 * Create a descriptor that lazily creates the {@link Observable} on the "Events" class.
 */
function createEventDescriptor(
    name: string,
    schema: ValueModel,
    constructor: new <T extends any[]>(schema: ValueModel, owner: Events) => AsyncObservable<T>,
) {
    return {
        get(this: EventEmitter) {
            if (this.hasEvent(name, true)) {
                return this.getEvent(name);
            }

            const event = new constructor(schema, this as unknown as Events);
            this.addEvent(name, event);

            return event;
        },
        enumerable: true,
    };
}
