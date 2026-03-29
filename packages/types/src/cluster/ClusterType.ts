/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, capitalize, decamelize } from "@matter/general";
import type { AttributeModel, CommandModel, EventModel } from "@matter/model";
import { ClusterModel, ClusterModifier, GeneratorScope, GLOBAL_IDS, Metatype, ValueModel } from "@matter/model";
import { StatusResponseError } from "../common/StatusResponseError.js";
import type { AttributeId } from "../datatype/AttributeId.js";
import { ClusterId } from "../datatype/ClusterId.js";
import type { CommandId } from "../datatype/CommandId.js";
import type { EventId } from "../datatype/EventId.js";
import { Status } from "../globals/Status.js";
import type { BitSchema, TypeFromPartialBitSchema } from "../schema/BitmapSchema.js";
import { ClassForValueModel } from "./ClassForValueModel.js";
import { EnumForValueModel } from "./EnumForValueModel.js";
import { RetiredClusterType } from "./RetiredClusterType.js";

/**
 * Describes the shape of generated namespace objects for standard Matter clusters (`typeof OnOff`).
 *
 * For many standard clusters, API varies based on configuration such as cluster features.  Matter.js generates this API
 * dynamically based on information stored in these namespaces.  The namespace also conveys compile-time type
 * information.
 *
 * For hand-crafted clusters, decorated classes may be preferable to replicating matter.js's code generation.
 *
 * ## Namespace layout
 *
 * Generated cluster namespaces contain:
 *
 *   - **Per-component attribute interfaces** (`BaseAttributes`, `LightingAttributes`, etc.) — each feature component
 *     gets its own interface with mandatory attributes required and optional attributes using `?`.  These carry full
 *     JSDoc and are what the IDE navigates to for go-to-definition and hover.
 *
 *   - **Attributes** — flat interface listing every attribute the cluster defines with its value type.  All properties
 *     are required (no `?`).  This is used by `ClusterEvents` for `$Changed`/`$Changing` observable key generation
 *     where value types must be read via `A[K]` without `undefined` contamination.
 *
 *   - **Per-component command interfaces** (`BaseCommands`, `FrequencyCommands`, etc.) — method signatures per feature
 *     component.  Each feature's commands live in a separate interface so that users clicking through to a command see
 *     a normal, readable interface.
 *
 *   - **Commands** — flat interface extending all per-component command interfaces.
 *
 *   - **Events** — flat interface, same design as Attributes (all required, string-union optionality in Components).
 *
 *   - **Components** — tuple of `{ flags, attributes?, commands?, events? }` entries.  `attributes` references a
 *     per-component attribute interface.  `commands` references a per-component command interface.  `events` uses
 *     `{ mandatory?, optional? }` string-union maps.
 */
export interface ClusterType {
    readonly Typing: ClusterTyping;
    readonly schema: ClusterModel;
    readonly id?: ClusterId;
    readonly name: string;
    readonly revision?: number;
    readonly attributes?: Record<string, ClusterType.Attribute>;
    readonly commands?: Record<string, ClusterType.Command>;
    readonly events?: Record<string, ClusterType.Event>;
    readonly features?: Record<string, ClusterType.Feature>;
}

/**
 * Describes the shape of types matter.js uses for compile-time generation of Matter cluster-related APIs.
 *
 * This does not represent an actual object.  It only exists to convey type information that is input to matter.js's
 * type system.  For standard clusters this information has no other compile-time representation as matter.js generates
 * related classes at runtime.
 */
export interface ClusterTyping {
    Attributes?: {};
    Commands?: {};
    Events?: {};
    Features?: {};
    Components?: {};
    SupportedFeatures?: {};
    readonly schema?: ClusterModel;
}

const cache = new WeakMap<ClusterModel, object>();

/**
 * Create or retrieve the runtime namespace object for a cluster model.
 *
 * The result is cached per model instance via a {@link WeakMap}, so repeated calls with the same model return the
 * identical object.  The object carries all runtime properties: `id`, `name`, `revision`, `schema`, enum values,
 * feature enum, error classes, plus lazy getters for `attributes`, `commands`, `events`, `features`, `Cluster`,
 * and `Complete`.
 *
 * @deprecated Use ClusterType with a ClusterModel instead.
 */
export function ClusterType<const T extends RetiredClusterType.Options>(
    options: T,
): ClusterType.Concrete & { Typing: RetiredClusterType.TypingOfOptions<T> };

export function ClusterType(model: ClusterModel): object;

export function ClusterType(input: ClusterModel | RetiredClusterType.Options): object {
    const model = input instanceof ClusterModel ? input : RetiredClusterType.ModelForOptions(input);

    let ns = cache.get(model);
    if (ns !== undefined) {
        return ns;
    }

    ns = Object.create(null) as Record<string, unknown>;
    cache.set(model, ns);

    const props = ns as Record<string, unknown>;

    // Core identity
    if (model.id !== undefined) {
        props.id = ClusterId(model.id);
    }
    props.name = model.name;
    props.revision = model.revision;
    props.schema = model;

    // Install lazy getters for element maps, self-references, enums, error classes, and Feature
    installLazyProperties(ns, model);

    return ns;
}

/**
 * Install all lazy getters on a namespace object.
 */
function installLazyProperties(ns: object, model: ClusterModel) {
    const lazy = (name: string, factory: () => unknown) => {
        Object.defineProperty(ns, name, {
            get() {
                const value = factory();
                Object.defineProperty(ns, name, { value, enumerable: true, configurable: true });
                return value;
            },
            enumerable: true,
            configurable: true,
        });
    };

    // Element maps
    lazy("attributes", () => ClusterType.attributes(model));
    lazy("commands", () => ClusterType.commands(model));
    lazy("events", () => ClusterType.events(model));
    lazy("features", () => ClusterType.features(model));

    // Self-references
    if (!Object.hasOwn(ns, "Cluster")) {
        lazy("Cluster", () => ns);
    }
    lazy("Complete", () => ns);

    // Feature enum (identity-mapped string → string)
    if (model.features.length) {
        lazy("Feature", () => {
            const result: Record<string, string> = {};
            for (const f of model.features) {
                const name = camelize(f.title ?? f.name, true);
                result[name] = name;
            }
            return Object.freeze(result);
        });
    }

    // Enum values, error classes, struct/bitmap classes from all datatypes in the cluster
    installDatatypeGetters(model, lazy);
}

/**
 * Use {@link GeneratorScope} to discover all named types in the cluster, then install lazy getters for enums (with
 * schema), struct/bitmap classes (via {@link ClassForDatatype}), and error classes.
 *
 * This ensures the factory uses identical naming to what codegen emits in `.d.ts` files.
 */
function installDatatypeGetters(model: ClusterModel, lazy: (name: string, factory: () => unknown) => void) {
    const scope = GeneratorScope(model);

    for (const [definer, name, location] of scope.namedModels()) {
        if (!location.isLocal || !(definer instanceof ValueModel)) {
            continue;
        }

        const metatype = definer.effectiveMetatype;

        if (metatype === Metatype.enum) {
            if (!definer.children.length) {
                continue;
            }

            lazy(name, () => EnumForValueModel(definer as ValueModel));

            // Error classes for cluster status code enums
            if (definer.name === "StatusEnum" || definer.name === "StatusCodeEnum") {
                for (const field of definer.children) {
                    if (field.name === "Success") {
                        continue;
                    }

                    let errName = field.name;
                    if (!errName.endsWith("Error")) {
                        errName = `${errName}Error`;
                    }

                    lazy(errName, () => {
                        let message = field.description;
                        if (message === undefined) {
                            message = capitalize(decamelize(field.name, " "));
                        }
                        if (message.endsWith(".")) {
                            message = message.slice(0, message.length - 1);
                        }

                        const clusterCode = typeof field.id === "number" ? field.id : undefined;
                        const defaultMessage = message;

                        // Computed property pattern so V8 infers the correct class name
                        return {
                            [errName]: class extends StatusResponseError {
                                constructor(
                                    message = defaultMessage,
                                    code: Status = Status.Failure,
                                    clusterCode2 = clusterCode,
                                ) {
                                    super(message, code, clusterCode2);
                                }
                            },
                        }[errName];
                    });
                }
            }
        } else if (metatype === Metatype.object || metatype === Metatype.bitmap) {
            lazy(name, () => ClassForValueModel(definer as ValueModel));
        }
    }
}

export namespace ClusterType {
    export interface Component<F extends BitSchema = {}> {
        flags: TypeFromPartialBitSchema<F>;
        attributes?: {};
        commands?: {};
        events?: {};
    }

    export interface Attribute<T = unknown> {
        id: AttributeId;
        name: string;
        schema: AttributeModel;
        readonly __phantom?: T;
    }

    export interface Command<T extends (...args: unknown[]) => unknown = (...args: unknown[]) => unknown> {
        id: CommandId;
        name: string;
        schema: CommandModel;
        readonly __phantom?: T;
    }

    export interface Event<T = unknown> {
        id: EventId;
        name: string;
        schema: EventModel;
        readonly __phantom?: T;
    }

    export interface Feature {
        id: number;
        name: string;
    }

    /**
     * A {@link ClusterType} with a concrete cluster ID.  Used for behavior types that are known to be associated
     * with a non-abstract cluster.
     */
    export interface Concrete extends ClusterType {
        readonly id: ClusterId;
    }

    /**
     * Default namespace used before a real cluster is assigned.
     */
    export const Unknown: Concrete = {
        Typing: {} as ClusterTyping,
        id: ClusterId(0),
        name: "Unknown",
        schema: new ClusterModel({ name: "Unknown" }),
    };

    export type Attributes<A> = { [K in keyof A]: Attribute };
    export type Commands<C> = { [K in keyof C]: Command };
    export type Events<E> = { [K in keyof E]: Event };
    export type Features<F extends string> = { [K in F]: Feature };

    export type AttributeObjects<A> = { [K in keyof A]-?: Attribute<Exclude<A[K], undefined>> };
    export type CommandObjects<C> = {
        [K in keyof C]: C[K] extends (...args: unknown[]) => unknown ? Command<C[K]> : Command;
    };
    export type EventObjects<E> = { [K in keyof E]-?: Event<Exclude<E[K], undefined>> };

    /**
     * Set supported feature flags on a namespace, replacing any previous selection.
     */
    export type WithSupportedFeatures<N extends ClusterTyping, S> = Omit<N, "SupportedFeatures"> & {
        SupportedFeatures: S;
    };

    /**
     * Extract supported feature flags from a namespace, defaulting to {}.
     */
    export type SupportedFeaturesOf<N> = N extends { SupportedFeatures: infer S }
        ? S
        : N extends { Features: infer F extends string }
          ? { [K in Uncapitalize<F>]: false }
          : {};

    /**
     * Derive the feature flags object type from a namespace's Features string union.
     */
    export type FeaturesOf<N> = N extends { Features: infer F extends string }
        ? { [K in Uncapitalize<F>]: boolean }
        : Record<string, boolean>;

    /**
     * Extract the Components tuple from a namespace.
     */
    export type ComponentsOf<N> = N extends { Components: infer C extends Component[] } ? C : [];

    /**
     * Augment a namespace with attribute keys forced mandatory (e.g. via `enable()` or `alter()`).
     *
     * Injects a synthetic base component (`flags: {}`) with the enabled keys as mandatory.
     */
    export type WithEnabledAttributes<N extends ClusterTyping, K extends string> = Omit<N, "Components"> & {
        Components: [
            ...(N extends { Components: infer C extends Component[] } ? C : []),
            {
                flags: {};
                attributes: N extends { Attributes: infer A } ? { [P in K & keyof A]: A[P] } : never;
            },
        ];
    };

    /**
     * Extract attribute key names from ElementFlags (used by `enable()`).
     */
    export type EnabledAttributeKeysOf<F> = F extends { attributes: infer A } ? keyof A & string : never;

    /**
     * Extract attribute key names made mandatory by Alterations (used by `alter()`).
     */
    export type AlteredMandatoryAttributeKeysOf<A> = A extends { attributes: infer E }
        ? { [K in keyof E & string]: E[K] extends { optional: false } ? K : never }[keyof E & string]
        : never;

    /**
     * Augment a namespace with event keys forced mandatory (e.g. via `enable()`).
     *
     * Injects a synthetic base component (`flags: {}`) with the enabled keys as mandatory.
     */
    export type WithEnabledEvents<N extends ClusterTyping, K extends string> = Omit<N, "Components"> & {
        Components: [
            ...(N extends { Components: infer C extends Component[] } ? C : []),
            { flags: {}; events: N extends { Events: infer E } ? { [P in K & keyof E]: E[P] } : never },
        ];
    };

    /**
     * Extract event key names from ElementFlags (used by `enable()`).
     * Input shape: `{ events?: { eventName: true } }`
     */
    export type EnabledEventKeysOf<F> = F extends { events: infer E } ? keyof E & string : never;

    /**
     * Extract event key names made mandatory by Alterations (used by `alter()`).
     * Input shape: `{ events?: { eventName: { optional: false } } }`
     */
    export type AlteredMandatoryEventKeysOf<A> = A extends { events: infer E }
        ? { [K in keyof E & string]: E[K] extends { optional: false } ? K : never }[keyof E & string]
        : never;

    /**
     * Extract attribute key names from a namespace.
     */
    export type AttrKeysOf<N extends ClusterTyping> = N extends { Attributes: infer A } ? keyof A & string : never;

    /**
     * Extract command key names from a namespace.
     */
    export type CommandKeysOf<N extends ClusterTyping> = N extends { Commands: infer C } ? keyof C & string : never;

    /**
     * Extract event key names from a namespace.
     */
    export type EventKeysOf<N extends ClusterTyping> = N extends { Events: infer E } ? keyof E & string : never;

    /**
     * Produce a typing with all feature flags set to true.  Used by `complete` to make all component attributes
     * mandatory.
     */
    export type AllFeaturesAsFlags<N extends ClusterTyping> = N extends { Features: infer F extends string }
        ? { [K in Uncapitalize<F>]: true }
        : {};

    /**
     * Valid feature names for a namespace's feature selection.
     */
    export type FeatureSelection<N extends ClusterTyping> = N extends { Features: infer F extends string }
        ? readonly F[]
        : readonly string[];

    /**
     * Convert a feature name tuple to a feature flags object with explicit true/false for all features.
     *
     * Unselected features are explicitly `false` (not absent),
     * so that `S extends C["flags"]` matches components with `{ offOnly: false }` when offOnly is not selected.
     */
    export type FeaturesAsFlags<N extends ClusterTyping, F extends readonly string[]> = N extends {
        Features: infer All extends string;
    }
        ? { [K in Uncapitalize<All>]: Capitalize<K> extends `${F[number]}` ? true : false }
        : { [K in F[number] as Uncapitalize<K>]: true };

    /**
     * Constraint for `alter()` input based on namespace element keys.
     */
    export type Alterations<N extends ClusterTyping> = {
        attributes?: { [K in AttrKeysOf<N>]?: ClusterModifier.RequirementModification };
        commands?: { [K in CommandKeysOf<N>]?: ClusterModifier.RequirementModification };
        events?: { [K in EventKeysOf<N>]?: ClusterModifier.RequirementModification };
    };

    /**
     * Constraint for `enable()` input based on namespace element keys.
     */
    export type ElementFlags<N extends ClusterTyping> = {
        attributes?: { [K in AttrKeysOf<N>]?: true };
        commands?: { [K in CommandKeysOf<N>]?: true };
        events?: { [K in EventKeysOf<N>]?: true };
    };

    /**
     * Create a typed map of cluster attributes from a {@link ClusterModel}.
     */
    export function attributes(model: ClusterModel) {
        const result: Record<string, Attribute> = {};
        for (const attribute of model.attributes) {
            if (GLOBAL_IDS.has(attribute.id) || attribute.isDisallowed || attribute.effectiveMetatype === undefined) {
                continue;
            }
            const key = attribute.propertyName;
            result[key] = {
                id: attribute.id as AttributeId,
                name: key,
                schema: attribute,
            };
        }
        return result;
    }

    /**
     * Create a typed map of cluster commands from a {@link ClusterModel}.
     */
    export function commands(model: ClusterModel) {
        const result: Record<string, Command> = {};
        for (const command of model.commands) {
            if (!command.isRequest || command.isDisallowed) {
                continue;
            }
            const key = command.propertyName;
            result[key] = {
                id: command.id as CommandId,
                name: key,
                schema: command,
            };
        }
        return result;
    }

    /**
     * Create a typed map of cluster events from a {@link ClusterModel}.
     */
    export function events(model: ClusterModel) {
        const result: Record<string, Event> = {};
        for (const event of model.events) {
            if (event.isDisallowed) {
                continue;
            }
            const key = event.propertyName;
            result[key] = {
                id: event.id as EventId,
                name: key,
                schema: event,
            };
        }
        return result;
    }

    /**
     * Create a typed map of cluster features from a {@link ClusterModel}.
     */
    export function features(model: ClusterModel) {
        const result: Record<string, { id: number; name: string }> = {};
        for (const feature of model.features) {
            const key = camelize(feature.title ?? feature.name);
            if (typeof feature.constraint.value === "number") {
                result[key] = {
                    id: feature.constraint.value,
                    name: key,
                };
            }
        }
        return result;
    }

    /**
     * @deprecated Provided for compatibility with external consumers.
     */
    export type AttributeValues<T> = RetiredClusterType.AttributeValues<T>;

    /**
     * @deprecated Provided for compatibility with external consumers.
     */
    export type CommandsOf<T> = RetiredClusterType.CommandsOf<T>;
}
