/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Events } from "#behavior/Events.js";
import type { Agent } from "#endpoint/Agent.js";
import { ImplementationError, MaybePromise } from "@matter/general";
import { ClusterModifier, type Schema } from "@matter/model";
import { ClusterType, type ClusterTyping } from "@matter/types";
import { Behavior } from "../Behavior.js";
import type { BehaviorBacking } from "../internal/BehaviorBacking.js";
import type { RootSupervisor } from "../supervision/RootSupervisor.js";
import { NetworkBehavior } from "../system/network/NetworkBehavior.js";
import { ExtensionInterfaceOf, isClientBehavior } from "./cluster-behavior-utils.js";
import { ClusterBehaviorType } from "./ClusterBehaviorType.js";
import type { ClusterEvents } from "./ClusterEvents.js";
import { ClusterInterface } from "./ClusterInterface.js";
import type { ClusterState } from "./ClusterState.js";

/**
 * A {@link Behavior} with specialization for a specific cluster.
 *
 * To implement cluster functionality you should use a subclass provided by {@link ClusterBehavior.for} with the
 * cluster namespace you are implementing.  Most commonly you would use one of the predefined implementations
 * matter.js includes.
 *
 * Subclasses can be modified using the static builder methods or extended like a normal class.
 *
 * Behaviors should store all mutable state in their {@link Behavior.state} property.  Other fields will be transient
 * and may not be retained across invocations.
 *
 * ClusterBehaviors may be instantiated with unsupported mandatory commands and attributes.  This is currently results
 * in a runtime error, but it will not cause a type error during development.
 */
export class ClusterBehavior extends Behavior {
    declare static readonly schema: Schema.Cluster;

    /**
     * The ID of ClusterBehavior implementations is the uncapitalized cluster name.
     */
    static override id: Uncapitalize<string>;

    /**
     * The cluster namespace associated with this behavior.
     */
    get cluster() {
        return (this.constructor as typeof ClusterBehavior).cluster;
    }

    /**
     * Supported features as a flag object.
     */
    get features() {
        return (this.constructor as ClusterBehavior.Type).features;
    }

    override get type() {
        return this.constructor as ClusterBehavior.Type;
    }

    /**
     * Every cluster behavior has an associated cluster namespace defined statically.
     */
    static readonly cluster: ClusterType.Concrete = ClusterType.Unknown;

    /**
     * Supported features as a flag object.
     */
    static readonly features: Record<string, boolean> = {};

    /**
     * Method definitions.
     */
    static readonly Interface = ClusterInterface.Empty;

    /**
     * All ClusterBehavior initialization currently runs as part of {@link Endpoint} initialization.
     */
    static override readonly early = true;

    /**
     * Keep networking alive until I'm destroyed.
     */
    static override readonly dependencies = [NetworkBehavior];

    /**
     * Automatically lock state on command invoke.
     */
    static readonly lockOnInvoke = true;

    constructor(agent: Agent, backing: BehaviorBacking) {
        super(agent, backing);

        const cluster = (this.constructor as typeof ClusterBehavior).cluster;
        if (!cluster) {
            throw new ImplementationError("ClusterBehavior class has no cluster defined");
        }
    }

    /**
     * Create a new behavior for a specific cluster namespace.
     *
     * If you invoke directly on {@link ClusterBehavior} you will receive a new implementation that reports all commands
     * as unimplemented.
     *
     * If you invoke on an existing subclass, you will receive a new implementation with the cluster in the subclass
     * replaced.  You should generally only do this with a namespace with the same cluster ID.
     */
    static for<This extends ClusterBehavior.Type, const NS extends ClusterType>(
        this: This,
        ns: NS,
        schema?: Schema.Cluster,
        name?: string,
    ): ClusterBehavior.Type<This, NS["Typing"], NS> & {
        readonly id: Uncapitalize<NS["name"] & string>;
    };

    static for(this: ClusterBehavior.Type, ns: ClusterType, schema?: Schema.Cluster, name?: string) {
        return ClusterBehaviorType({
            namespace: ns,
            base: this,
            schema,
            name,
        });
    }

    /**
     * Create a new behavior with different cluster features.
     */
    static withFeatures<
        This extends ClusterBehavior.Type,
        const FeaturesT extends ClusterType.FeatureSelection<ClusterInterface.InterfaceOf<This>>,
    >(this: This, ...features: FeaturesT) {
        return ClusterBehaviorType({
            namespace: this.cluster,
            base: this,
            features,
        }) as unknown as ClusterBehavior.Type<
            This,
            ClusterType.WithSupportedFeatures<
                ClusterInterface.InterfaceOf<This>,
                ClusterType.FeaturesAsFlags<ClusterInterface.InterfaceOf<This>, FeaturesT>
            >
        >;
    }

    /**
     * Alias for {@link withFeatures}.
     */
    static with<
        This extends ClusterBehavior.Type,
        const FeaturesT extends ClusterType.FeatureSelection<ClusterInterface.InterfaceOf<This>>,
    >(this: This, ...features: FeaturesT) {
        return this.withFeatures<This, FeaturesT>(...features);
    }

    /**
     * Create a new behavior with modified cluster elements.
     */
    static alter<
        This extends ClusterBehavior.Type,
        const AlterationsT extends ClusterType.Alterations<ClusterInterface.InterfaceOf<This>>,
    >(this: This, alterations: AlterationsT) {
        const schema = ClusterModifier.applyRequirements(this.schema, alterations);
        return this.for(this.cluster, schema) as unknown as ClusterBehavior.Type<
            This,
            ClusterType.WithEnabledAttributes<
                ClusterType.WithEnabledEvents<
                    ClusterInterface.InterfaceOf<This>,
                    ClusterType.AlteredMandatoryEventKeysOf<AlterationsT>
                >,
                ClusterType.AlteredMandatoryAttributeKeysOf<AlterationsT>
            >
        >;
    }

    /**
     * Create a new behavior with additional cluster features marked "mandatory".
     *
     * This informs matter.js that an application supports these elements.
     */
    static enable<
        This extends ClusterBehavior.Type,
        const FlagsT extends ClusterType.ElementFlags<ClusterInterface.InterfaceOf<This>>,
    >(this: This, flags: FlagsT) {
        const schema = ClusterModifier.applyPresence(this.schema, flags);
        return this.for(this.cluster, schema) as unknown as ClusterBehavior.Type<
            This,
            ClusterType.WithEnabledAttributes<
                ClusterType.WithEnabledEvents<
                    ClusterInterface.InterfaceOf<This>,
                    ClusterType.EnabledEventKeysOf<FlagsT>
                >,
                ClusterType.EnabledAttributeKeysOf<FlagsT>
            >
        >;
    }

    /**
     * Returns this behavior type with all cluster elements present regardless of feature selection.
     *
     * This is type-only; at runtime the deconflicted conformance mode already includes all elements.
     */
    static get complete(): ClusterBehavior.Type {
        return this as any;
    }

    static isType(type: Behavior.Type): type is ClusterBehavior.Type {
        return typeof (type as ClusterBehavior.Type)?.withFeatures === "function";
    }

    static override supports(other: Behavior.Type) {
        if (!ClusterBehavior.isType(other)) {
            return false;
        }

        // Special case for "client" behaviors.  We implement these with the "complete" cluster so the interface offers
        // type-safe access to the entire cluster.  The only exception to this is for non-nullable mandatory state
        // values.  If the peer does not implement such a value then it will be undefined even though our type says it
        // won't be.  This however is not an issue specific to the complete cluster so we do not need to worry about it
        // here
        //
        // Further, we know the "Client" classes can have no extension methods or properties, so we don't need to do an
        // exact class match for type safety
        if (isClientBehavior(other) && other.schema.id === this.schema.id) {
            return true;
        }

        if (!Behavior.supports.call(this, other)) {
            return false;
        }

        const otherFeatures = other.schema.supportedFeatures;
        for (const name of otherFeatures) {
            if (!this.schema.supportedFeatures.has(name)) {
                return false;
            }
        }

        return true;
    }

    requireAttributeEnabled<This extends Behavior, K extends keyof This["state"]>(
        this: This,
        attributeName: K,
    ): Exclude<This["state"][K], undefined> {
        if ((this.state as any)[attributeName] === undefined) {
            throw new ImplementationError(
                `To use this feature, please enable attribute ${String(attributeName)} by setting the value during initialization`,
            );
        }
        return (this.state as any)[attributeName];
    }

    assertAttributeEnabled<This extends Behavior, K extends keyof This["state"]>(this: This, attributeName: K): void {
        if ((this.state as any)[attributeName] === undefined) {
            throw new ImplementationError(
                `To use this feature, please enable attribute ${String(attributeName)} by setting the value during initialization`,
            );
        }
    }

    static override Events = Events;
}

export namespace ClusterBehavior {
    /**
     * A ClusterBehavior specialized for a specific cluster namespace.
     */
    export interface Type<
        B extends Behavior.Type = Behavior.Type,
        N extends ClusterTyping = ClusterInterface.InterfaceOf<B>,
        NS extends ClusterType = ClusterType.Concrete,
        // I and ID are redundant — they duplicate information already derivable from B.  They exist because tsc < 6
        // deeply expands B's structure when it encounters indexed access (B["Internal"]) or infer...extends
        // (B extends { id: infer S extends ... }) during declaration emit.  This transitively triggers contravariant
        // checking on N, breaking `.with().alter()` chains with TS2684.  Pre-computing as separate parameters avoids
        // the expansion.  tsgo handles this correctly; tsc 6 has not been tested.  Once tsc < 6 is no longer
        // supported, these parameters can be inlined back into the property types.
        I = B["Internal"], // inline: B["Internal"]
        ID extends Uncapitalize<string> = B extends { readonly id: infer S extends Uncapitalize<string> } // inline: B extends { readonly id: infer S extends Uncapitalize<string> } ? S : Uncapitalize<string>
            ? S
            : Uncapitalize<string>,
    > {
        new (agent: Agent, backing: BehaviorBacking): Instance<B, N>;

        readonly name: string;

        /**
         * The behavior ID for ClusterBehaviors is the name of the cluster.
         */
        readonly id: ID;

        /**
         * The cluster namespace for this behavior.
         */
        readonly cluster: NS;

        /**
         * Supported features as a flag object.
         */
        readonly features: ClusterType.FeaturesOf<N>;

        readonly Events: ClusterEvents.Type<N, B>;
        readonly State: new () => ClusterState.Type<N, B>;
        readonly Internal: I;
        readonly Interface: N;

        readonly schema: Schema.Cluster;
        readonly early: boolean;
        readonly defaults: ClusterState.Type<N, B>;
        readonly supervisor: RootSupervisor;
        readonly dependencies?: Iterable<Behavior.Type>;
        supports: typeof ClusterBehavior.supports;
        readonly ExtensionInterface: ExtensionInterfaceOf<B>;
        readonly lockOnInvoke: boolean;

        /**
         * Create a new behavior for a specific cluster namespace.
         */
        for<This extends ClusterBehavior.Type, const NS extends ClusterType>(
            this: This,
            ns: NS,
            schema?: Schema,
            name?: string,
        ): ClusterBehavior.Type<This, NS["Typing"], NS> & {
            readonly id: Uncapitalize<NS["name"] & string>;
        };

        /**
         * Create a new behavior with different cluster features.
         */
        withFeatures<
            This extends ClusterBehavior.Type,
            const FeaturesT extends ClusterType.FeatureSelection<ClusterInterface.InterfaceOf<This>>,
        >(
            this: This,
            ...features: FeaturesT
        ): ClusterBehavior.Type<
            This,
            ClusterType.WithSupportedFeatures<
                ClusterInterface.InterfaceOf<This>,
                ClusterType.FeaturesAsFlags<ClusterInterface.InterfaceOf<This>, FeaturesT>
            >
        >;

        /**
         * Alias for {@link withFeatures}.
         */
        with<
            This extends ClusterBehavior.Type,
            const FeaturesT extends ClusterType.FeatureSelection<ClusterInterface.InterfaceOf<This>>,
        >(
            this: This,
            ...features: FeaturesT
        ): ClusterBehavior.Type<
            This,
            ClusterType.WithSupportedFeatures<
                ClusterInterface.InterfaceOf<This>,
                ClusterType.FeaturesAsFlags<ClusterInterface.InterfaceOf<This>, FeaturesT>
            >
        >;

        /**
         * Create a new behavior with modified cluster elements.
         */
        alter<
            This extends ClusterBehavior.Type,
            const AlterationsT extends ClusterType.Alterations<ClusterInterface.InterfaceOf<This>>,
        >(
            this: This,
            alterations: AlterationsT,
        ): ClusterBehavior.Type<
            This,
            ClusterType.WithEnabledAttributes<
                ClusterType.WithEnabledEvents<
                    ClusterInterface.InterfaceOf<This>,
                    ClusterType.AlteredMandatoryEventKeysOf<AlterationsT>
                >,
                ClusterType.AlteredMandatoryAttributeKeysOf<AlterationsT>
            >
        >;

        set<This extends Behavior.Type>(this: This, defaults: Behavior.InputStateOf<This>): This;

        enable<
            This extends ClusterBehavior.Type,
            const FlagsT extends ClusterType.ElementFlags<ClusterInterface.InterfaceOf<This>>,
        >(
            this: This,
            flags: FlagsT,
        ): ClusterBehavior.Type<
            This,
            ClusterType.WithEnabledAttributes<
                ClusterType.WithEnabledEvents<
                    ClusterInterface.InterfaceOf<This>,
                    ClusterType.EnabledEventKeysOf<FlagsT>
                >,
                ClusterType.EnabledAttributeKeysOf<FlagsT>
            >
        >;
    }

    /**
     * A fully-typed ClusterBehavior.  This type is derived by combining properties of the base type with properties
     * contributed by the cluster.
     */
    export type Instance<B extends Behavior.Type, N extends ClusterTyping> =
        // Base class
        ClusterBehavior &
            // Bring extensions of old class forward
            Omit<
                InstanceType<B>,
                | "cluster"
                | "state"
                | "events"
                | "initialize"

                // Typescript 5.3 gets confused and thinks this is an instance property if we don't omit and then add
                // (as we do below)
                | typeof Symbol.asyncDispose

                // Omit command methods of old cluster
                | keyof ClusterInterface.MethodsOf<ClusterInterface.InterfaceOf<B>>

                // Omit methods defined in ExtensionInterface
                | keyof ExtensionInterfaceOf<B>
            > &
            // Add command methods
            ClusterInterface.MethodsOf<N> &
            // Add methods defined manually in ExtensionInterface
            ExtensionInterfaceOf<B> & {
                // Cluster-specific members
                /**
                 * The cluster namespace.
                 */
                cluster: ClusterType.Concrete;

                /**
                 * State values for the behavior.
                 */
                readonly state: ClusterState<N, B>;

                /**
                 * Observables for cluster events and attribute changes.
                 */
                readonly events: ClusterEvents<N, B>;

                /**
                 * Supported features as a flag object.
                 */
                readonly features: ClusterType.FeaturesOf<N>;

                [Symbol.asyncDispose](): MaybePromise<void>;
            };

    /**
     * A behavior type with all cluster elements exposed regardless of feature selection.
     *
     * Used by client behaviors to provide access to all commands, attributes, and events.
     */
    export interface Complete<
        B extends Behavior.Type = Behavior.Type,
        NS extends ClusterType = ClusterType.Concrete,
    > extends Omit<Type<B, NS["Typing"], NS>, "new" | "Events" | "State"> {
        new (agent: Agent, backing: BehaviorBacking): CompleteInstance<B, NS["Typing"]>;
        readonly Events: ClusterEvents.CompleteType<NS["Typing"], B>;
        readonly State: new () => ClusterState.Complete<NS["Typing"], B>;
    }

    /**
     * A fully-typed instance with all cluster elements present regardless of feature selection.
     */
    export type CompleteInstance<B extends Behavior.Type, N extends ClusterTyping> = ClusterBehavior &
        Omit<
            InstanceType<B>,
            | "cluster"
            | "state"
            | "events"
            | "initialize"
            | typeof Symbol.asyncDispose
            | keyof ClusterInterface.MethodsOf<ClusterInterface.InterfaceOf<B>>
            | keyof ExtensionInterfaceOf<B>
        > &
        ClusterInterface.AllMethodsOf<N> &
        ExtensionInterfaceOf<B> & {
            cluster: ClusterType.Concrete;
            readonly state: ClusterState.Complete<N, B>;
            readonly events: ClusterEvents.Complete<N, B>;
            readonly features: ClusterType.FeaturesOf<N>;
            [Symbol.asyncDispose](): MaybePromise<void>;
        };

    /**
     * This is an unfortunate kludge required to work around https://github.com/microsoft/TypeScript/issues/27965.  It
     * allows you to designate extension methods available on behavior instances.
     *
     * Methods designated in this way make it so you can override methods using the syntax:
     *
     *     override foo() {}
     *
     * rather than:
     *
     *     override foo: () => {}
     *
     * This is also required for protected properties because TypeScript doesn't include them in the mapped types our
     * typing system uses to define modified behaviors.
     *
     * See {@link ClusterInterface} for more details.
     */
    export declare const ExtensionInterface: {};

    export function is(type: Behavior.Type): type is ClusterBehavior.Type {
        return "cluster" in type;
    }
}
