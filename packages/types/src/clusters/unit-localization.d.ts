/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { UnitLocalization as UnitLocalizationModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the UnitLocalization cluster.
 */
export declare namespace UnitLocalization {
    /**
     * {@link UnitLocalization} supports these elements if it supports feature "TemperatureUnit".
     */
    export namespace TemperatureUnitComponent {
        export interface Attributes {
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
            temperatureUnit: TempUnit;

            /**
             * Indicates a list of units supported by the Node to be used when writing the TemperatureUnit attribute of
             * this cluster. Each entry in the list shall be unique.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.5.6.2
             */
            readonly supportedTemperatureUnits: TempUnit[];
        }
    }

    export interface Attributes extends Partial<TemperatureUnitComponent.Attributes> {}
    export type Components = [{ flags: { temperatureUnit: true }, attributes: TemperatureUnitComponent.Attributes }];
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

    export const id: ClusterId;
    export const name: "UnitLocalization";
    export const revision: 2;
    export const schema: typeof UnitLocalizationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof UnitLocalization;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `UnitLocalization` instead of `UnitLocalization.Complete`)
     */
    export const Complete: typeof UnitLocalization;

    export const Typing: UnitLocalization;
}

export declare const UnitLocalizationCluster: typeof UnitLocalization;
export interface UnitLocalization extends ClusterTyping { Attributes: UnitLocalization.Attributes; Features: UnitLocalization.Features; Components: UnitLocalization.Components }
