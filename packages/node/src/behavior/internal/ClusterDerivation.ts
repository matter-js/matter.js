/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementEvent, Events, OfflineEvent, OnlineEvent, QuietEvent } from "#behavior/Events.js";
import { AsyncObservable, camelize, EventEmitter, GeneratedClass, ImplementationError } from "@matter/general";
import { ClusterModel, ElementTag, FeatureMap, Schema, Scope, SelectDefaultValue, ValueModel } from "@matter/model";
import { Val } from "@matter/protocol";
import { ClusterType } from "@matter/types";
import type { Behavior } from "../Behavior.js";
import type { ClusterBehaviorType } from "../cluster/ClusterBehaviorType.js";
import { DerivedState } from "../state/StateType.js";

/**
 * The input of a cluster behavior derivation.
 */
export interface DerivationContext {
    namespace: object;
    scope: Scope;
    base: Behavior.Type;
    newProps: Record<string, ValueModel>;
    forClient?: boolean;
    commandFactory?: ClusterBehaviorType.CommandFactory;
}

/**
 * The class-level properties of a cluster behavior that derive from its schema: State and Events extending the base's
 * with the schema's defaults and events, and the feature flags.
 */
export function deriveStatics(context: DerivationContext, schema: ClusterModel) {
    return {
        State: createDerivedState(context),
        Events: createDerivedEvents(context),
        features: computeFeatureFlags(schema),
    };
}

/**
 * The class-level properties of a server behavior `type` whose own final `schema` defines its cluster: its namespace,
 * and State, Events and features as {@link deriveStatics} derives them with `type` as the base.  A subclass is never a
 * client class, because the client marker is checked with `hasOwn`.
 */
export function deriveOwnClusterStatics(type: Behavior.Type, schema: ClusterModel) {
    const namespace = ClusterType(schema);
    return {
        cluster: namespace,
        ...deriveStatics({ scope: Scope(schema), namespace, base: type, newProps: {}, forClient: false }, schema),
    };
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
        const oldDefault = oldDefaults[name] === undefined ? knownDefaults?.[name] : oldDefaults[name];
        defaults[name] = oldDefault === undefined ? SelectDefaultValue(scope, propSchema) : oldDefault;
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
    const plainEventFields = new Set<string>();

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
        const Implementation = event.effectiveQuality.quieter ? quieterImplementation : OnlineEvent;

        // An own field holding a plain observable, as a decorated Events class declares for its events, neither records
        // nor reports, so an element event replaces it; the field counts as the class's support for the event.  An
        // inherited value is internal to the base, such as the "stateChanged" observable every Events class has
        const declared = baseInstance[name];
        const isPlain =
            Object.hasOwn(baseInstance, name) && declared !== undefined && !(declared instanceof ElementEvent);

        // Do not implement if already supported
        if (!isPlain && isImplementedBy(declared, Implementation)) {
            continue;
        }

        // For clients we implement all events because we can't know what's supported now that EventList is gone.  For
        // servers we only add events that are explicitly
        if (!forClient && !isPlain && !scope.hasOperationalSupport(event)) {
            continue;
        }

        // Add the event
        eventNames.add(name);
        instanceDescriptors[name] = createEventDescriptor(name, event, Implementation);
        if (isPlain) {
            plainEventFields.add(name);

            // Code compiled without useDefineForClassFields assigns the field in the base constructor; the element
            // event takes the place of the assigned value
            instanceDescriptors[name].set = () => {};
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
        const Implementation = prop.effectiveQuality.quieter ? quieterImplementation : OnlineEvent;
        if (!isImplementedBy(baseInstance[changed], Implementation)) {
            eventNames.add(changed);
            instanceDescriptors[changed] = createEventDescriptor(changed, prop, Implementation);
        }
    }

    // TODO - if necessary, mask out (set to undefined) events present in base cluster but not derived cluster

    return GeneratedClass({
        name: `${base.name}$Events`,
        base: base.Events,

        instanceDescriptors,

        initialize(this: EventEmitter) {
            // Own fields shadow the prototype getters these events use
            for (const name of plainEventFields) {
                Reflect.deleteProperty(this, name);
            }
            for (const name of eventNames) {
                this.addEvent(name);
            }
        },
    });
}

/**
 * Compute the feature flags object from a schema's supported features.
 */
export function computeFeatureFlags(schema: ClusterModel): Record<string, boolean> {
    const flags: Record<string, boolean> = {};
    const supported = schema.supportedFeatures;
    for (const child of schema.featureMap.children) {
        const key = camelize(child.title ?? child.name);
        flags[key] = supported.has(child.name);
    }
    return flags;
}

/**
 * Whether an event the base class provides is the implementation the schema requires.
 *
 * Reporting treats a quieter element as quiet by its schema, so a base event of the other kind must be replaced even
 * though one exists.
 */
function isImplementedBy(event: unknown, Implementation: abstract new (...args: any[]) => unknown) {
    return event !== undefined && event instanceof QuietEvent === (Implementation === QuietEvent);
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
