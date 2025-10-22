/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterType } from "../ClusterType.js";

/**
 * An "cluster type modifier" mutates {@link ClusterType} elements based on a predefined set of alterations described in
 * the Matter device library.
 */
export class ClusterTypeModifier<const T extends ClusterType> {
    constructor(public cluster: T) {}

    /**
     * Create a new cluster with modified elements.
     */
    alter<const AlterationsT extends ClusterTypeModifier.Alterations<T>>(alterations: AlterationsT) {
        return modifyElements(this.cluster, alterations, (element, alteration: any) => {
            for (const property in alteration) {
                element[property] = alteration[property];
            }
        }) as ClusterTypeModifier.WithAlterations<T, AlterationsT>;
    }

    /**
     * Create a new cluster with different attribute defaults.
     *
     * This "sets" the values of attributes when the cluster is created
     * for the first time with no persistent state.
     */
    set<const ValuesT extends Partial<ClusterType.AttributeValues<T>>>(values: ValuesT) {
        return modifyElements(this.cluster, { attributes: values }, (element, defaultValue) => {
            element.default = defaultValue;
        }) as ClusterTypeModifier.WithValues<T, ValuesT>;
    }

    /**
     * Create a new cluster with additional features marked "mandatory".
     *
     * This informs matter.js that an application supports these elements.
     */
    enable<const FlagsT extends ClusterTypeModifier.ElementFlags<T>>(flags: FlagsT) {
        return modifyElements(this.cluster, flags, (element, flag) => {
            if (flag === true) {
                element.optional = false;
            } else if (flag === false) {
                element.optional = true;
            }
        }) as ClusterTypeModifier.WithAlterations<T, ClusterTypeModifier.ElementFlagAlterations<FlagsT>>;
    }
}

export namespace ClusterTypeModifier {
    /**
     * A set of modifications to cluster elements of a specific type.
     */
    export type ElementSetAlterations<AlterationT extends ElementAlteration, ElementSetT> = {
        [name in keyof ElementSetT]?: AlterationT;
    };

    export interface ElementAlteration {
        optional?: boolean;
    }

    export interface AttributeAlteration extends ElementAlteration {
        default?: any;
        min?: any;
        max?: any;
    }

    /**
     * A set of modifications to a cluster's elements.
     *
     * Note - cannot specify ElementsT as extending ClusterElements because it
     * triggers a bug in TS 5.2 declaration generation
     */
    export type Alterations<OriginalT extends ClusterType> = {
        attributes?: ElementSetAlterations<AttributeAlteration, OriginalT["attributes"]>;
        commands?: ElementSetAlterations<ElementAlteration, OriginalT["commands"]>;
        events?: ElementSetAlterations<ElementAlteration, OriginalT["events"]>;
    };

    /**
     * Alterations applied to a specific element set, element or element field.
     */
    export type AlteredElements<OriginalT, ElementT, AlterationT> = {
        [name in keyof OriginalT]: OriginalT[name] extends infer OrigT extends ElementT
            ? AlterationT extends { [n in name]: { optional: infer O extends boolean } }
                ? Omit<OrigT, "optional"> & { optional: O }
                : OrigT
            : never;
    };

    /**
     * A definition with alterations applied.
     */
    export type WithAlterations<T extends ClusterType, AlterationsT extends Alterations<any>> = Omit<
        T,
        "attributes" | "commands" | "events"
    > & {
        attributes: AlteredElements<T["attributes"], ClusterType.Attribute, AlterationsT["attributes"]>;
        commands: AlteredElements<T["commands"], ClusterType.Command, AlterationsT["commands"]>;
        events: AlteredElements<T["events"], ClusterType.Event, AlterationsT["events"]>;
    };

    /**
     * A definition with attribute defaults updated.
     */
    export type WithValues<
        T extends ClusterType,
        ValuesT extends Partial<ClusterType.AttributeValues<T>>,
    > = WithAlterations<T, AttributeValueAlterations<ValuesT>>;

    /**
     * A definition with elements enabled.
     */
    export type WithFlags<T extends ClusterType, FlagsT extends ElementFlags<T>> = WithAlterations<
        T,
        ElementFlagAlterations<FlagsT>
    >;

    /**
     * Alterations implied by AttributeValues.
     */
    export type AttributeValueAlterations<ValuesT extends Partial<ClusterType.AttributeValues<any>>> = {
        attributes: {
            [K in keyof ValuesT]: { default: ValuesT[K] };
        };
    };

    export type ElementSetFlags<ElementsT extends ClusterType.ElementSet<any> | undefined> = {
        [key in keyof ElementsT]?: boolean;
    };

    /**
     * Flags indicating elements to enable.
     */
    export type ElementFlags<ClusterT extends ClusterType> = {
        attributes?: ElementSetFlags<ClusterType.AttributesOf<ClusterT>>;
        commands?: ElementSetFlags<ClusterType.CommandsOf<ClusterT>>;
        events?: ElementSetFlags<ClusterType.EventsOf<ClusterT>>;
    };

    export type ElementSetFlagAlterations<ElementsT extends ElementSetFlags<any> | undefined> = ElementsT extends {}
        ? { [key in keyof ElementsT]: { optional: ElementsT[key] extends true ? false : true } }
        : undefined;

    /**
     * Alterations implied by ElementFlags.
     */
    export type ElementFlagAlterations<T extends ElementFlags<any>> = {
        [K in keyof T]: T[K] extends ElementSetFlags<any> ? ElementSetFlagAlterations<T[K]> : never;
    };

    /**
     * An "extender" is a function that creates a cluster with specific
     * features enabled.
     */
    export type Extender = (...features: any) => ClusterType;
}

/**
 * Helper routine used by alteration builder methods.
 */
function modifyElements(
    definition: ClusterType,
    modifications: Record<string, Record<string, any> | undefined>,
    modifier: (element: any, modification: any) => any,
) {
    const result = { ...definition };

    for (const elementType of ["attributes", "commands", "events"] as const) {
        const mods = modifications[elementType];
        if (mods === undefined) {
            continue;
        }

        let elements = result[elementType];
        if (elements === undefined) {
            continue;
        }

        let replaced = false;

        for (const elementName in mods) {
            const mod = mods[elementName];
            if (mod === undefined) {
                continue;
            }

            const element = elements[elementName];
            if (!element) {
                continue;
            }

            if (!replaced) {
                elements = result[elementType] = { ...result[elementType] } as {};
                replaced = true;
            }

            elements[elementName] = { ...element };

            modifier(elements[elementName], mod);
        }
    }

    return result;
}
