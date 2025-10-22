/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterId } from "../../datatype/ClusterId.js";
import { ConditionalFeatureList } from "../Cluster.js";
import { ClusterType } from "../ClusterType.js";
import { ClusterComposer } from "./ClusterComposer.js";
import { ClusterTypeModifier } from "./ClusterTypeModifier.js";

/**
 * A "mutable cluster" is a {@link ClusterType} with builder methods that support a limited number of modifications as
 * defined by the Matter specification.
 */
export type MutableCluster<
    T extends ClusterType.Options = ClusterType.Options,
    C extends ClusterComposer.Component[] = [],
> = ClusterComposer.WithComponents<ClusterType.Of<T>, C> & MutableCluster.Methods<ClusterType.Of<T>>;

/**
 * Define a new {@link MutableCluster}.
 */
export function MutableCluster<const T extends ClusterType.Options, const C extends ClusterComposer.Component[]>(
    options: T,
    ...components: C
) {
    const cluster = ClusterType(options);

    for (const component of components) {
        ClusterComposer.injectElements(cluster, component);
    }

    Object.assign(cluster, {
        with(...features: ClusterComposer.FeatureSelection<typeof cluster>) {
            return new ClusterComposer(cluster).compose(features);
        },

        alter(alterations: ClusterTypeModifier.Alterations<typeof cluster>) {
            return new ClusterTypeModifier(cluster).alter(alterations);
        },

        set(values: Partial<ClusterType.AttributeValues<typeof cluster>>) {
            return new ClusterTypeModifier(cluster).set(values);
        },

        enable(flags: ClusterTypeModifier.ElementFlags<typeof cluster>) {
            return new ClusterTypeModifier(cluster).enable(flags);
        },
    });

    return cluster as MutableCluster<T, C>;
}

export namespace MutableCluster {
    /**
     * Define a component.
     */
    export function Component<const T extends Partial<ClusterType.Options>>(elements: T) {
        return elements;
    }

    /**
     * Define a cluster's extension set.
     */
    export function Extensions<const T extends readonly ClusterType.Extension[]>(...extensions: T) {
        return extensions;
    }

    export interface Methods<T extends ClusterType> {
        /**
         * Select features using {@link ClusterComposer.compose}.
         */
        with<const SelectionT extends ClusterComposer.FeatureSelection<T>>(
            ...selection: SelectionT
        ): ClusterComposer.Of<T, SelectionT>;

        /**
         * Modify elements using {@link ClusterTypeModifier.alter}.
         */
        alter<const AlterationsT extends ClusterTypeModifier.Alterations<T>>(
            alterations: AlterationsT,
        ): ClusterTypeModifier.WithAlterations<T, AlterationsT>;

        /**
         * Modify elements using {@link ClusterTypeModifier.set}.
         */
        set<const ValuesT extends Partial<ClusterType.AttributeValues<T>>>(
            values: ValuesT,
        ): ClusterTypeModifier.WithValues<T, ValuesT>;

        /**
         * Modify elements using {@link ClusterTypeModifier.enable}.
         */
        enable<const FlagsT extends ClusterTypeModifier.ElementFlags<T>>(
            flags: FlagsT,
        ): ClusterTypeModifier.WithFlags<T, FlagsT>;
    }

    /**
     * ExtensibleOnly creates a factory that produces a {@link MutableCluster} when the user selects features.
     *
     * We define clusters this way if the Matter specification defines a cluster with a set of features, one of which is
     * required, but none of which is required if others are enabled.
     */
    export interface ExtensibleOnly<T extends ClusterType.Options = ClusterType.Options> {
        id: ClusterId;
        name: string;

        with: Methods<ClusterType.Of<T>>["with"];
    }

    /**
     * Create a factory for clusters that require extension.
     */
    export function ExtensibleOnly<const T extends ClusterType.Options = ClusterType.Options>(options: T) {
        return {
            id: options.id,
            name: options.name,

            with(...features: ClusterComposer.FeatureSelection<ClusterType.Of<T>>) {
                return new ClusterComposer(ClusterType(options)).compose(features);
            },
        } as ExtensibleOnly<T>;
    }

    /**
     * Create a conditional version of an unconditional element definition.
     */
    export function AsConditional<
        const ClusterT extends ClusterType,
        const E extends ClusterType.Attribute | ClusterType.Command | ClusterType.Event,
        const OI extends ConditionalFeatureList<ClusterT["features"]>,
        const MI extends ConditionalFeatureList<ClusterT["features"]>,
    >(element: E, { optionalIf, mandatoryIf }: { optionalIf?: OI; mandatoryIf?: MI }) {
        return {
            ...element,
            optional: true,
            isConditional: true,
            optionalIf: optionalIf ?? [],
            mandatoryIf: mandatoryIf ?? [],
        } as const;
    }
}
