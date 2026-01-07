/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, MatterError, serialize } from "#general";
import { FeatureSet } from "#model";
import { BitFlags } from "../../schema/BitmapSchema.js";
import { ClusterType } from "../ClusterType.js";

export class IllegalClusterError extends MatterError {}

/**
 * To save memory we cache clusters with specific feature variants.  Otherwise code that configures clusters dynamically
 * may create multiple redundant copies.
 */
const featureSelectionCache = new WeakMap<ClusterType, Record<string, WeakRef<ClusterType>>>();

/**
 * A "cluster composer" manages cluster configuration based on feature selection.
 */
export class ClusterComposer<const T extends ClusterType> {
    #allowInvalidFeatureCombinations: boolean;

    constructor(
        public cluster: T,
        allowInvalidFeatures = false,
    ) {
        this.#allowInvalidFeatureCombinations = allowInvalidFeatures;
    }

    /**
     * Build a cluster using selected feature flags.
     *
     * @param selection the name(s) of optional features to support
     * @throws {IllegalClusterError} if the feature combination is disallowed by the Matter specification
     */
    compose<const SelectionT extends ClusterComposer.FeatureSelection<T>>(selection: SelectionT) {
        this.#validateFeatureSelection(selection);

        const extensions = this.cluster.extensions;
        let cluster: ClusterType | undefined;

        // First check cache
        const cacheKey = [...selection].sort().join("␜");
        cluster = featureSelectionCache.get(this.cluster)?.[cacheKey]?.deref();

        // Next check whether feature set remains unchanged
        if (!cluster) {
            const currentCacheKey = [...new FeatureSet(this.cluster.supportedFeatures)].sort().join("␜");
            if (currentCacheKey === cacheKey) {
                cluster = featureSelectionCache.get(this.cluster)?.[cacheKey]?.deref();
            }
        }

        // Done if either optimization above succeeded
        if (cluster) {
            return cluster as ClusterComposer.Of<T, SelectionT>;
        }

        // Modify feature selection
        if (extensions) {
            // Feature selection modifies elements
            const base = this.cluster.base ?? this.cluster;

            const baseElements = (type: "attributes" | "commands" | "events") => {
                const elements = {} as Record<string, any>;
                const clusterElements = this.cluster[type];
                for (const name in base[type]) {
                    elements[name] = clusterElements[name] ?? base[type][name];
                }
                return elements;
            };

            cluster = ClusterType({
                ...base,
                attributes: baseElements("attributes"),
                commands: baseElements("commands"),
                events: baseElements("events"),
                supportedFeatures: BitFlags(this.cluster.features, ...selection),
                base,
            });

            for (const selector of extensions) {
                if (selector.component) {
                    this.#accept(cluster, selector.component, this.cluster, selector.flags);
                } else {
                    this.reject(cluster, selector.flags);
                }
            }
        } else {
            // Feature selection does not modify elements
            const supportedFeatures = BitFlags(this.cluster.features, ...selection);
            cluster = ClusterType({
                ...this.cluster,
                supportedFeatures,
                base: this.cluster.base ?? this.cluster,
            });
        }

        // Update cache
        const baseVariants = featureSelectionCache.get(this.cluster);
        if (baseVariants === undefined) {
            featureSelectionCache.set(this.cluster, { [cacheKey]: new WeakRef(cluster) });
        } else {
            baseVariants[cacheKey] = new WeakRef(cluster);
        }

        return cluster as ClusterComposer.Of<T, SelectionT>;
    }

    /**
     * Validates a set of feature flags against the features supported by a cluster.
     */
    #validateFeatureSelection(features: ClusterComposer.FeatureSelection<any>) {
        // Note that if features are defined they must exist; #ignoreInvalidFeatureCombinations does NOT apply here

        for (const f of features) {
            if (!this.cluster.features[camelize(f)]) {
                throw new IllegalClusterError(`"${f}" is not a valid feature identifier`);
            }
        }
    }

    /**
     * Injects a component into a cluster if the cluster supports the specified features.  Uses matching element from
     * "original" if present.  This allows for component insertion without overwrite of other changes to the named
     * element.
     */
    #accept(
        definition: ClusterComposer.WritableDefinition,
        component: Partial<ClusterType.Elements>,
        original: Partial<ClusterType> | undefined,
        flags: ClusterComposer.FeatureFlags,
    ) {
        for (const k in flags) {
            if (!!definition.supportedFeatures[k] !== !!flags[k]) {
                return;
            }
        }

        ClusterComposer.injectElements(definition, component, original);
    }

    static injectElements(
        definition: Partial<ClusterType.Options>,
        component: Partial<ClusterType.Options>,
        original?: Partial<ClusterType>,
    ) {
        function installElements(name: "attributes" | "commands" | "events") {
            const src = component[name];
            if (!src) {
                return;
            }

            let dest = definition[name] as Record<string, unknown> | undefined;
            if (dest) {
                dest = { ...dest } as Record<string, unknown>;
            } else {
                dest = {};
            }
            (definition as Record<string, unknown>)[name] = dest;

            for (const key in src) {
                const orig = original?.[name]?.[key];
                if (orig) {
                    dest[key] = orig;
                } else {
                    dest[key] = src[key];
                }
            }
        }

        installElements("attributes");
        installElements("commands");
        installElements("events");
    }

    /**
     * Throws an error if a feature combination is illegal per the Matter specification.
     */
    private reject(definition: ClusterType, flags: ClusterComposer.FeatureFlags) {
        if (this.#allowInvalidFeatureCombinations) {
            return;
        }

        for (const k in flags) {
            if (!!definition.supportedFeatures[k] !== !!flags[k]) {
                return;
            }
        }
        throw new IllegalClusterError(
            `Feature combination ${serialize(flags)} is disallowed by the Matter specification`,
        );
    }
}

export namespace ClusterComposer {
    export type Component = Partial<ClusterType.Elements>;

    /**
     * An array of names indicating features to be injected.
     */
    export type FeatureSelection<T extends ClusterType> = readonly Capitalize<string & keyof T["features"]>[];

    /**
     * A set of boolean values indicating whether a feature is enabled.
     */
    export type FeatureFlags = Record<string, boolean | undefined>;

    /**
     * Describes the output of {@link ClusterComposer.compose}.
     */
    export type Of<ClusterT extends ClusterType, FeaturesT extends FeatureSelection<ClusterT>> = WithFeatures<
        ClusterT,
        FeaturesT
    >;

    /**
     * The base of a cluster.
     */
    export type BaseOf<T extends ClusterType> = T["base"] extends ClusterType ? T["base"] : T;

    /**
     * The result of composition.
     */
    export type WithFeatures<ClusterT extends ClusterType, FeaturesT extends FeatureSelection<BaseOf<ClusterT>>> = Omit<
        BaseOf<ClusterT>,
        "supportedFeatures" | "base" | ElementType
    > & {
        supportedFeatures: FeaturesAsFlags<BaseOf<ClusterT>, FeaturesT>;
        base: BaseOf<ClusterT>;
    } & ExtendedElements<
            ClusterT,
            SelectedElements<
                FeaturesAsFlags<ClusterT, FeaturesT>,
                ClusterT["extensions"] extends object ? ClusterT["extensions"] : []
            >
        >;

    /**
     * Convert a {@link FeatureSelection} array into a {@link FeatureFlags} object.
     */
    export type FeaturesAsFlags<ClusterT extends ClusterType, FlagsT extends FeatureSelection<ClusterT>> = {
        [K in keyof ClusterT["features"]]: K extends string
            ? Capitalize<K> extends `${FlagsT[number]}`
                ? true
                : false
            : never;

        // Formerly we used this.  TS bugs (as of 5.4) caused this to fail to match in specific circumstances.  See
        // ClusterComposerTest "extends with default components"
        //[K in keyof ClusterT["features"]]: K extends Uncapitalize<FlagsT[number]> ? true : false;
    };

    /**
     * Choose elements from applicable extensions.
     */
    export type SelectedElements<
        FlagsT extends FeatureFlags,
        extensionsT extends readonly ClusterType.Extension[],
    > = extensionsT extends readonly [
        infer S extends ClusterType.Extension,
        ...infer R extends readonly ClusterType.Extension[],
    ]
        ? SelectorContribution<FlagsT, S> & SelectedElements<FlagsT, R>
        : {};

    /**
     * Determine the type contributed to feature selection by a specific selector.
     */
    export type SelectorContribution<
        FlagsT extends FeatureFlags,
        SelectorT extends ClusterType.Extension,
    > = FlagsT extends SelectorT["flags"]
        ? SelectorT["component"] extends false
            ? never
            : SelectorT["component"] & { attributes: {}; commands: {}; events: {} }
        : { attributes: {}; commands: {}; events: {} };

    /**
     * Cluster elements extended with .
     *
     * Note that we have to track the base separate from the originating cluster.  If we are removing features, we want
     * to maintain only those features present in the base or selected components.
     */
    export type ExtendedElements<ClusterT extends ClusterType, ComponentT extends Component> = [ComponentT] extends [
        never,
    ]
        ? never
        : {
              [TypeT in ElementType]: Pick<
                  // Include elements in current cluster if valid according to base and extensions
                  ClusterT[TypeT],
                  keyof ClusterT[TypeT] & (keyof BaseOf<ClusterT>[TypeT] | keyof ComponentT[TypeT])
              > &
                  // Include extension elements if not present in current cluster
                  Omit<ComponentT[TypeT], keyof ClusterT[TypeT]> &
                  // Include base elements if not present in current cluster or extensions
                  Omit<BaseOf<ClusterT>[TypeT], keyof ClusterT[TypeT] | keyof ComponentT[TypeT]>;
          };

    /**
     * A cluster extended by multiple components.
     */
    export type WithComponents<ClusterT extends ClusterType, RestT extends Component[]> = RestT extends [
        infer ComponentT extends Component,
        ...infer RestT extends Component[],
    ]
        ? WithComponents<Omit<ClusterT, ElementType> & ExtendedElements<ClusterT, ComponentT>, RestT>
        : ClusterT;

    /**
     * A "WritableDefinition" is a Cluster with fields that may be modified.
     */
    export type WritableDefinition = {
        -readonly [Key in keyof ClusterType]: ClusterType[Key];
    };

    export type ElementType = "attributes" | "commands" | "events";
}
