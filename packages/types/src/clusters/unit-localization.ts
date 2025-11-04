/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute, FixedAttribute } from "../cluster/Cluster.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { AccessLevel } from "#model";
import { TlvArray } from "../tlv/TlvArray.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace UnitLocalization {
    /**
     * These are optional features supported by UnitLocalizationCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.5.4
     */
    export enum Feature {
        /**
         * TemperatureUnit (TEMP)
         *
         * The Node can be configured to use different units of temperature when conveying values to a user.
         */
        TemperatureUnit = "TemperatureUnit"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.5.5.1
     */
    export enum TempUnit {
        /**
         * Temperature conveyed in Fahrenheit
         */
        Fahrenheit = 0,

        /**
         * Temperature conveyed in Celsius
         */
        Celsius = 1,

        /**
         * Temperature conveyed in Kelvin
         */
        Kelvin = 2
    }

    /**
     * A UnitLocalizationCluster supports these elements if it supports feature TemperatureUnit.
     */
    export const TemperatureUnitComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the unit for the Node to use only when conveying temperature in communication to the user, for
             * example such as via a user interface on the device. If provided, this value shall take priority over any
             * unit implied through the ActiveLocale Attribute.
             *
             * An attempt to write to this attribute with a value not included in the SupportedTemperatureUnits
             * attribute list shall result in a CONSTRAINT_ERROR.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.5.6.1
             */
            temperatureUnit: WritableAttribute(
                0x0,
                TlvEnum<TempUnit>(),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates a list of units supported by the Node to be used when writing the TemperatureUnit attribute of
             * this cluster. Each entry in the list shall be unique.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.5.6.2
             */
            supportedTemperatureUnits: FixedAttribute(
                0x1,
                TlvArray(TlvEnum<TempUnit>(), { minLength: 2, maxLength: 3 })
            )
        }
    });

    /**
     * These elements and properties are present in all UnitLocalization clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x2d,
        name: "UnitLocalization",
        revision: 2,

        features: {
            /**
             * The Node can be configured to use different units of temperature when conveying values to a user.
             */
            temperatureUnit: BitFlag(0)
        },

        /**
         * This metadata controls which UnitLocalizationCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { temperatureUnit: true }, component: TemperatureUnitComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * Nodes should be expected to be deployed to any and all regions of the world. These global regions may have
     * differing preferences for the units in which values are conveyed in communication to a user. As such, Nodes that
     * visually or audibly convey measurable values to the user need a mechanism by which they can be configured to use
     * a user’s preferred unit.
     *
     * This cluster supports an interface to a Node. It provides attributes for determining and configuring the units
     * that a Node shall utilize when conveying values in communication to a user.
     *
     * UnitLocalizationCluster supports optional features that you can enable with the UnitLocalizationCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.5
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const TEMP = { temperatureUnit: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            temperatureUnit: MutableCluster.AsConditional(
                TemperatureUnitComponent.attributes.temperatureUnit,
                { mandatoryIf: [TEMP] }
            ),
            supportedTemperatureUnits: MutableCluster.AsConditional(
                TemperatureUnitComponent.attributes.supportedTemperatureUnits,
                { mandatoryIf: [TEMP] }
            )
        }
    });

    /**
     * This cluster supports all UnitLocalization features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type UnitLocalizationCluster = UnitLocalization.Cluster;
export const UnitLocalizationCluster = UnitLocalization.Cluster;
ClusterRegistry.register(UnitLocalization.Complete);
