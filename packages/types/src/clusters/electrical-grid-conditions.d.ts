/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the ElectricalGridConditions cluster.
 *
 * The Electrical Grid Conditions Cluster provides the mechanism for communicating electricity grid carbon intensity to
 * devices within the premises in units of Grams of CO2e per kWh.
 *
 * This is an important mechanism to allow energy appliances decide when to operate to help consumers reduce their
 * carbon footprint, when the pricing may be the same throughout the day.
 *
 * When homes have local generation (for example Solar PV) this may mean that the premises at the local grid connection
 * point has effectively no green house gas emissions, and so this cluster allows devices to understand both the grid
 * and local conditions.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 9.13
 */
export declare namespace ElectricalGridConditions {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x00a0;

    /**
     * Textual cluster identifier.
     */
    export const name: "ElectricalGridConditions";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ElectricalGridConditions cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ElectricalGridConditions} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This shall indicate if there is known to be local generation (for example Solar PV or Battery Storage) at the
         * premises.
         *
         * If the presence of any local generation is unknown, or cannot be determined, the value shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.6.1
         */
        localGenerationAvailable: boolean | null;

        /**
         * This shall indicate the current electricity supply conditions. If the current conditions are unknown, or
         * cannot be determined, the value shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.6.2
         */
        currentConditions: ElectricalGridConditionsStruct | null;
    }

    /**
     * {@link ElectricalGridConditions} supports these elements if it supports feature "Forecasting".
     */
    export interface ForecastingAttributes {
        /**
         * This shall indicate the forecast of upcoming electricity supply conditions. If the forecast is unable to be
         * determined, this list shall be empty.
         *
         * The list entries shall be in time order:
         *
         *   - All entries except the last one shall have a non-null PeriodEnd.
         *
         *   - For all entries except the first one, PeriodStart shall be greater than the previous entry’s PeriodEnd.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.6.3
         */
        forecastConditions: ElectricalGridConditionsStruct[];
    }

    /**
     * Attributes that may appear in {@link ElectricalGridConditions}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This shall indicate if there is known to be local generation (for example Solar PV or Battery Storage) at the
         * premises.
         *
         * If the presence of any local generation is unknown, or cannot be determined, the value shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.6.1
         */
        localGenerationAvailable: boolean | null;

        /**
         * This shall indicate the current electricity supply conditions. If the current conditions are unknown, or
         * cannot be determined, the value shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.6.2
         */
        currentConditions: ElectricalGridConditionsStruct | null;

        /**
         * This shall indicate the forecast of upcoming electricity supply conditions. If the forecast is unable to be
         * determined, this list shall be empty.
         *
         * The list entries shall be in time order:
         *
         *   - All entries except the last one shall have a non-null PeriodEnd.
         *
         *   - For all entries except the first one, PeriodStart shall be greater than the previous entry’s PeriodEnd.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.6.3
         */
        forecastConditions: ElectricalGridConditionsStruct[];
    }

    /**
     * {@link ElectricalGridConditions} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when the value of the CurrentConditions attribute changes.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.7.1
         */
        currentConditionsChanged?: CurrentConditionsChangedEvent;
    }

    /**
     * Events that may appear in {@link ElectricalGridConditions}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when the value of the CurrentConditions attribute changes.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.7.1
         */
        currentConditionsChanged: CurrentConditionsChangedEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, events: BaseEvents },
        { flags: { forecasting: true }, attributes: ForecastingAttributes }
    ];
    export type Features = "Forecasting";

    /**
     * These are optional features supported by ElectricalGridConditionsCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.13.4
     */
    export enum Feature {
        /**
         * Forecasting (FORE)
         *
         * The feature indicates the server is capable of providing a forecast of grid and local conditions for several
         * hours in the future.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.4.1
         */
        Forecasting = "Forecasting"
    }

    /**
     * This represents the greenhouse gas carbon intensity over a given period.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.13.5.2
     */
    export declare class ElectricalGridConditionsStruct {
        constructor(values?: Partial<ElectricalGridConditionsStruct>);

        /**
         * This field shall indicate the beginning timestamp in UTC of the period.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.5.2.1
         */
        periodStart: number;

        /**
         * This field shall indicate the ending timestamp in UTC of the period. This shall be greater than PeriodStart.
         * If this field is null, then the period has no definite end.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.5.2.2
         */
        periodEnd: number | null;

        /**
         * This field shall indicate the estimated carbon intensity in grams of CO2 equivalent per kWh of the grid. This
         * is not impacted by any local generation.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.5.2.3
         */
        gridCarbonIntensity: number;

        /**
         * This field shall indicate the relative level of carbon intensity of the grid. This is not impacted by any
         * local generation.
         *
         * It is up to the cluster server to determine the thresholds of High, Medium or Low based upon typical grid
         * carbon levels for this region or market, since this can vary significantly between countries across the
         * world.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.5.2.4
         */
        gridCarbonLevel: ThreeLevel;

        /**
         * This field shall indicate the estimated carbon intensity in grams of CO2 equivalent per kWh of the premises
         * mains supply. This value shall take into account the impact of any local generation.
         *
         * For example, if an EMS can forecast that excess generation will occur in a period or the premises are
         * currently generating excess power to the grid, then this could assume a value of 0 grams CO2 equivalent per
         * kWh for this period.
         *
         * When solar PV is not being exported to the grid then this value is typically the same as the
         * GridCarbonIntensity.
         *
         * Clients are expected to use this value when computing or displaying the local premises carbon intensity to
         * users.
         *
         * If there is no local generation, this value shall be the same as the GridCarbonIntensity at all times.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.5.2.5
         */
        localCarbonIntensity: number;

        /**
         * This field shall indicate the relative level of carbon intensity of the premises mains supply. This level
         * shall take into account impact of any local generation.
         *
         * It is up to the cluster server to determine the thresholds of High, Medium or Low based upon typical grid
         * carbon levels for this region or market, since this can vary significantly between countries across the
         * world.
         *
         * When local power generation (for example from solar PV) is not being exported to the grid then this level is
         * the same as the GridCarbonLevel.
         *
         * Clients are expected to use this value when displaying the local premises carbon intensity to users.
         *
         * If there is no local generation, this value shall be the same as the GridCarbonLevel at all times.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.5.2.6
         */
        localCarbonLevel: ThreeLevel;
    };

    /**
     * This event shall be generated when the value of the CurrentConditions attribute changes.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.13.7.1
     */
    export declare class CurrentConditionsChangedEvent {
        constructor(values?: Partial<CurrentConditionsChangedEvent>);

        /**
         * This field shall be the new value of the CurrentConditions attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.13.7.1.1
         */
        currentConditions: ElectricalGridConditionsStruct | null;
    };

    /**
     * This data type is derived from enum8 and is used for indicating three levels: Low, Medium, High.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.13.5.1
     */
    export enum ThreeLevel {
        /**
         * Low
         */
        Low = 0,

        /**
         * Medium
         */
        Medium = 1,

        /**
         * High
         */
        High = 2
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link ElectricalGridConditions}.
     */
    export const Cluster: typeof ElectricalGridConditions;

    /**
     * @deprecated Use {@link ElectricalGridConditions}.
     */
    export const Complete: typeof ElectricalGridConditions;

    export const Typing: ElectricalGridConditions;
}

/**
 * @deprecated Use {@link ElectricalGridConditions}.
 */
export declare const ElectricalGridConditionsCluster: typeof ElectricalGridConditions;

export interface ElectricalGridConditions extends ClusterTyping {
    Attributes: ElectricalGridConditions.Attributes;
    Events: ElectricalGridConditions.Events;
    Features: ElectricalGridConditions.Features;
    Components: ElectricalGridConditions.Components;
}
