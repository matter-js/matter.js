/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Events, OfflineEvent, OnlineEvent, QuietEvent } from "#behavior/Events.js";
import { camelize, EventEmitter, GeneratedClass, ImplementationError, Observable } from "#general";
import {
    ClassSemantics,
    ClusterModel,
    Conformance,
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
} from "#model";
import { Val } from "#protocol";
import { ClusterType } from "#types";
import { Behavior } from "../Behavior.js";
import { DerivedState } from "../state/StateType.js";
import type { ClusterBehavior } from "./ClusterBehavior.js";
import { ClusterBehaviorCache } from "./ClusterBehaviorCache.js";

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
 * Create a non-functional instance of a {@link Behavior} for introspection purposes.
 */
export function introspectionInstanceOf(type: Behavior.Type) {
    return new (type as unknown as new () => Record<string, (...args: any[]) => any>)();
}

/**
 * This is the actual implementation of ClusterBehavior.for().  The result must match {@link ClusterBehavior.Type}<C>.
 */
export function createType<const C extends ClusterType>(
    cluster: C,
    base: Behavior.Type,
    schema?: Schema,
    name?: string,
) {
    if (schema === undefined) {
        if (base.schema) {
            schema = base.schema;
        }
        if (!schema) {
            schema = schemaForCluster(cluster);
        }
    }

    schema = syncFeatures(schema, cluster);

    const useCache = name === undefined;

    // If we are provided a name, the caller is creating a specialized version of the behavior.  Disable caching and
    // do not create a name automatically
    if (useCache) {
        const cached = ClusterBehaviorCache.get(cluster, base, schema);
        if (cached) {
            return cached;
        }

        if (base.name.startsWith(cluster.name)) {
            name = base.name;
        } else {
            name = `${cluster.name}Behavior`;
        }
    }

    const context = DerivationContext(schema, cluster, base);

    const type = GeneratedClass({
        name,
        base,

        // These are really read-only but installing as getters on the prototype prevents us from overriding using
        // namespace overrides.  If we instead override as static properties then we lose the automatic interface type.
        // So just publish as static properties.
        staticProperties: {
            State: createDerivedState(context),

            Events: createDerivedEvents(context),
        },

        staticDescriptors: {
            id: {
                value: camelize(cluster.name) as Uncapitalize<string>,
                enumerable: true,
            },

            cluster: {
                value: cluster,
                enumerable: true,
            },
        },

        instanceDescriptors: createDefaultCommandDescriptors(cluster, base),
    }) as ClusterBehavior.Type;

    // Decorate the class
    ClassSemantics.of(type).mutableModel = schema;

    // Mutation of schema will almost certainly result in logic errors so ensure that can't happen
    schema.finalize();

    if (useCache) {
        ClusterBehaviorCache.set(cluster, base, schema, type);
    }

    return type;
}

/**
 * The cluster type for a behavior.
 */
export type ClusterOf<B extends Behavior.Type> = B extends { cluster: infer C extends ClusterType }
    ? C
    : ClusterType.Unknown;

/**
 * The extension interface for a behavior.
 */
export type ExtensionInterfaceOf<B extends Behavior.Type> = B extends { ExtensionInterface: infer I extends {} }
    ? I
    : {};

interface DerivationContext {
    cluster: ClusterType;
    scope: Scope;
    featuresAvailable: FeatureSet;
    featuresSupported: FeatureSet;
    base: Behavior.Type;
    newProps: Record<string, ValueModel>;
}

function DerivationContext(schema: Schema, cluster: ClusterType, base: Behavior.Type): DerivationContext {
    const scope = Scope(schema);
    // Determine the set of features so we can test element applicability
    let featuresAvailable, featuresSupported;
    if (scope.owner instanceof ClusterModel) {
        const normalized = FeatureSet.normalize(scope.owner.featureMap, scope.owner.supportedFeatures);
        featuresAvailable = normalized.featuresAvailable;
        featuresSupported = normalized.featuresSupported;
    } else {
        featuresAvailable = new FeatureSet();
        featuresSupported = new FeatureSet();
    }

    return {
        cluster,
        scope: Scope(schema),
        featuresAvailable,
        featuresSupported,
        base,
        newProps: {},
    };
}

/**
 * Create a new state subclass that inherits relevant default values from a base Behavior.Type and adds new default
 * values from cluster attributes.
 *
 * Note - we only use the cluster here for default values
 */
function createDerivedState({
    cluster,
    scope,
    base,
    newProps,
    featuresAvailable,
    featuresSupported,
}: DerivationContext) {
    const BaseState = base["State"];
    if (BaseState === undefined) {
        throw new ImplementationError(`No state class defined for behavior class ${base.name}`);
    }

    const oldDefaults = new BaseState() as Record<string, any>;
    let knownDefaults = (BaseState as HasKnownDefaults)[KNOWN_DEFAULTS];

    // Index schema members by name
    const props = {} as Record<string, ValueModel[]>;
    for (const member of scope.membersOf(scope.owner, { conformance: "deconflicted" })) {
        const name = camelize(member.name);
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
        let applicability;
        for (const attr of attrs) {
            applicability = attr.effectiveConformance.applicabilityOf(featuresAvailable, featuresSupported);

            // Inapplicable; ignore
            if (!applicability) {
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
        const attribute = cluster.attributes[name];

        // The feature map value requires a special case because it's encoded in the "supportedFeatures" cluster
        // property
        if (attribute?.id === FeatureMap.id) {
            defaults[name] = cluster.supportedFeatures;
            continue;
        }

        // Make sure a default value is present if mandatory or marked as supported (note that the default value may
        // be "undefined" to indicate that an attribute is available optionally)
        defaults[name] = selectDefaultValue(
            scope,
            oldDefaults[name] === undefined ? knownDefaults?.[name] : oldDefaults[name],
            propSchema,
            applicability,
        );
    }

    const StateType = DerivedState({
        name: `${cluster.name}$State`,
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
function createDerivedEvents({ scope, base, newProps, featuresAvailable, featuresSupported }: DerivationContext) {
    const instanceDescriptors = {} as PropertyDescriptorMap;

    const baseInstance = new base.Events() as unknown as Record<string, unknown>;

    const eventNames = new Set<string>();

    // Add events that are mandatory or marked as supported and not present in the base class
    const applicableClusterEvents = new Set();
    for (const event of scope.membersOf(scope.owner as Schema, {
        conformance: "conformant",
        tags: [ElementTag.Event],
    })) {
        const name = camelize(event.name);
        applicableClusterEvents.add(name);
        if (
            (event.conformance.applicabilityOf(featuresAvailable, featuresSupported) ===
                Conformance.Applicability.Mandatory ||
                event.isSupported) &&
            baseInstance[name] === undefined
        ) {
            eventNames.add(name);
            instanceDescriptors[name] = createEventDescriptor(
                name,
                event,
                event.quality.quieter ? QuietEvent : OnlineEvent,
            );
        }
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
                prop.quality.quieter ? QuietEvent : OnlineEvent,
            );
        }
    }

    // TODO - if necessary, mask out (set to undefined) events present in base cluster but not derived cluster

    return GeneratedClass({
        name: `${base.name}$Events`,
        base: base.Events,

        instanceDescriptors,

        initialize(this: EventEmitter) {
            (this as unknown as Record<string, Observable>).interactionBegin = new Observable();
            (this as unknown as Record<string, Observable>).interactionEnd = new Observable();
            (this as unknown as Record<string, Observable>).stateChanged = new Observable();

            for (const name of eventNames) {
                this.addEvent(name);
            }
        },
    });
}

/**
 * Obtain schema for a particular cluster.
 *
 * Currently we model TLV and TypeScript types with ClusterType and use ClusterModel for logical operations.  This dual
 * mode could probably be improved but we will continue to need a source for type information (ClusterType) and more
 * exhaustive operational metadata (ClusterModel).
 *
 * This acts as an adapter to load the appropriate {@link ClusterModel} for a {@link ClusterType}.
 */
function schemaForCluster(cluster: ClusterType) {
    let schema: ClusterModel | undefined;

    for (const child of Matter.children) {
        if (child.tag === ElementTag.Cluster && child.id === cluster.id) {
            schema = child;
            break;
        }
    }

    if (schema === undefined) {
        throw new ImplementationError(`Cannot locate schema for cluster ${cluster.id}, please supply manually`);
    }

    return schema;
}

/**
 * We cache schema for clusters configured for certain features.  This in turn enables the RootSupervisor cache which
 * keys off of the schema.
 */
const configuredSchemaCache = new Map<Schema, Record<string, Schema>>();

/**
 * Ensure the supported features enumerated by schema align with a cluster definition.
 */
function syncFeatures(schema: Schema, cluster: ClusterType) {
    if (!(schema instanceof ClusterModel)) {
        return schema;
    }

    // If features are unchanged, return original schema
    const incomingFeatures = new FeatureSet(cluster.supportedFeatures);
    if (new FeatureSet(cluster.supportedFeatures).is(schema.supportedFeatures)) {
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

function createDefaultCommandDescriptors(cluster: ClusterType, base: Behavior.Type) {
    const result = {} as Record<string, PropertyDescriptor>;
    const instance = introspectionInstanceOf(base);

    for (const name in cluster.commands) {
        if (!instance[name]) {
            result[name] = {
                value: Behavior.unimplemented,
                writable: true,
            };
        }
    }

    return result;
}

function selectDefaultValue(
    scope: Scope,
    oldDefault: Val,
    member: ValueModel,
    applicability?: Conformance.Applicability,
) {
    if (oldDefault !== undefined) {
        return oldDefault;
    }

    // No default unless mandatory or explicitly marked as implemented
    if (applicability !== Conformance.Applicability.Mandatory && !member.isSupported) {
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

function createEventDescriptor(
    name: string,
    schema: ValueModel,
    constructor: new <T extends any[]>(schema: ValueModel, owner: Events) => Observable<T>,
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
