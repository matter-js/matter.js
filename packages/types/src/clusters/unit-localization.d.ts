/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the UnitLocalization cluster.
 *
 * Nodes should be expected to be deployed to any and all regions of the world. These global regions may have differing
 * preferences for the units in which values are conveyed in communication to a user. As such, Nodes that visually or
 * audibly convey measurable values to the user need a mechanism by which they can be configured to use a user’s
 * preferred unit.
 *
 * This cluster supports an interface to a Node. It provides attributes for determining and configuring the units that a
 * Node shall utilize when conveying values in communication to a user.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.5
 */
export declare namespace UnitLocalization {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x002d;

    /**
     * Textual cluster identifier.
     */
    export const name: "UnitLocalization";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the UnitLocalization cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link UnitLocalization} supports these elements if it supports feature "TemperatureUnit".
     */
    export interface TemperatureUnitAttributes {
        /**
         * Indicates the unit for the Node to use only when conveying temperature in communication to the user, for
         * example such as via a user interface on the device. If provided, this value shall take priority over any unit
         * implied through the ActiveLocale Attribute.
         *
         * An attempt to write to this attribute with a value not included in the SupportedTemperatureUnits attribute
         * list shall result in a CONSTRAINT_ERROR.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.5.6.1
         */
        temperatureUnit: TempUnit;

        /**
         * Indicates a list of units supported by the Node to be used when writing the TemperatureUnit attribute of this
         * cluster. Each entry in the list shall be unique.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.5.6.2
         */
        supportedTemperatureUnits: TempUnit[];
    }

    /**
     * Attributes that may appear in {@link UnitLocalization}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the unit for the Node to use only when conveying temperature in communication to the user, for
         * example such as via a user interface on the device. If provided, this value shall take priority over any unit
         * implied through the ActiveLocale Attribute.
         *
         * An attempt to write to this attribute with a value not included in the SupportedTemperatureUnits attribute
         * list shall result in a CONSTRAINT_ERROR.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.5.6.1
         */
        temperatureUnit: TempUnit;

        /**
         * Indicates a list of units supported by the Node to be used when writing the TemperatureUnit attribute of this
         * cluster. Each entry in the list shall be unique.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.5.6.2
         */
        supportedTemperatureUnits: TempUnit[];
    }

    export type Components = [{ flags: { temperatureUnit: true }, attributes: TemperatureUnitAttributes }];
    export type Features = "TemperatureUnit";

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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterNamespace.Features<Features>;

    /**
     * @deprecated Use {@link UnitLocalization}.
     */
    export const Cluster: typeof UnitLocalization;

    /**
     * @deprecated Use {@link UnitLocalization}.
     */
    export const Complete: typeof UnitLocalization;

    export const Typing: UnitLocalization;
}

/**
 * @deprecated Use {@link UnitLocalization}.
 */
export declare const UnitLocalizationCluster: typeof UnitLocalization;

export interface UnitLocalization extends ClusterTyping {
    Attributes: UnitLocalization.Attributes;
    Features: UnitLocalization.Features;
    Components: UnitLocalization.Components;
}
