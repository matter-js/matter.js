/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, WritableAttribute, OptionalEvent } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvEpochS, TlvInt16, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ElectricalGridConditions {
    /**
     * These are optional features supported by ElectricalGridConditionsCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.13.4
     */
    export enum Feature {
        /**
         * Forecasting (FORE)
         *
         * The feature indicates the server is capable of providing a forecast of grid and local conditions for several
         * hours in the future.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.13.4.1
         */
        Forecasting = "Forecasting"
    }

    /**
     * This data type is derived from enum8 and is used for indicating three levels: Low, Medium, High.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.1
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
     * This represents the greenhouse gas carbon intensity over a given period.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.2
     */
    export const TlvElectricalGridConditionsStruct = TlvObject({
        /**
         * This field shall indicate the beginning timestamp in UTC of the period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.2.1
         */
        periodStart: TlvField(0, TlvEpochS),

        /**
         * This field shall indicate the ending timestamp in UTC of the period. This shall be greater than PeriodStart.
         * If this field is null, then the period has no definite end.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.2.2
         */
        periodEnd: TlvField(1, TlvNullable(TlvEpochS)),

        /**
         * This field shall indicate the estimated carbon intensity in grams of CO2 equivalent per kWh of the grid. This
         * is not impacted by any local generation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.2.3
         */
        gridCarbonIntensity: TlvField(2, TlvInt16),

        /**
         * This field shall indicate the relative level of carbon intensity of the grid. This is not impacted by any
         * local generation.
         *
         * It is up to the cluster server to determine the thresholds of High, Medium or Low based upon typical grid
         * carbon levels for this region or market, since this can vary significantly between countries across the
         * world.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.2.4
         */
        gridCarbonLevel: TlvField(3, TlvEnum<ThreeLevel>()),

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
         * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.2.5
         */
        localCarbonIntensity: TlvField(4, TlvInt16),

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
         * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.2.6
         */
        localCarbonLevel: TlvField(5, TlvEnum<ThreeLevel>())
    });

    /**
     * This represents the greenhouse gas carbon intensity over a given period.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.13.5.2
     */
    export interface ElectricalGridConditionsStruct extends TypeFromSchema<typeof TlvElectricalGridConditionsStruct> {}

    /**
     * Body of the ElectricalGridConditions currentConditionsChanged event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.13.7.1
     */
    export const TlvCurrentConditionsChangedEvent = TlvObject({
        /**
         * This field shall be the new value of the CurrentConditions attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.13.7.1.1
         */
        currentConditions: TlvField(0, TlvNullable(TlvElectricalGridConditionsStruct))
    });

    /**
     * Body of the ElectricalGridConditions currentConditionsChanged event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.13.7.1
     */
    export interface CurrentConditionsChangedEvent extends TypeFromSchema<typeof TlvCurrentConditionsChangedEvent> {}

    /**
     * A ElectricalGridConditionsCluster supports these elements if it supports feature Forecasting.
     */
    export const ForecastingComponent = MutableCluster.Component({
        attributes: {
            /**
             * This shall indicate the forecast of upcoming electricity supply conditions. If the forecast is unable to
             * be determined, this list shall be empty.
             *
             * The list entries shall be in time order:
             *
             *   - All entries except the last one shall have a non-null PeriodEnd.
             *
             *   - For all entries except the first one, PeriodStart shall be greater than the previous entry’s
             *     PeriodEnd.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.13.6.3
             */
            forecastConditions: Attribute(
                0x2,
                TlvArray(TlvElectricalGridConditionsStruct, { maxLength: 56 }),
                { default: [] }
            )
        }
    });

    /**
     * These elements and properties are present in all ElectricalGridConditions clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0xa0,
        name: "ElectricalGridConditions",
        revision: 1,

        features: {
            /**
             * The feature indicates the server is capable of providing a forecast of grid and local conditions for
             * several hours in the future.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.13.4.1
             */
            forecasting: BitFlag(0)
        },

        attributes: {
            /**
             * This shall indicate if there is known to be local generation (for example Solar PV or Battery Storage) at
             * the premises.
             *
             * If the presence of any local generation is unknown, or cannot be determined, the value shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.13.6.1
             */
            localGenerationAvailable: WritableAttribute(0x0, TlvNullable(TlvBoolean)),

            /**
             * This shall indicate the current electricity supply conditions. If the current conditions are unknown, or
             * cannot be determined, the value shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.13.6.2
             */
            currentConditions: Attribute(0x1, TlvNullable(TlvElectricalGridConditionsStruct))
        },

        events: {
            /**
             * This event shall be generated when the value of the CurrentConditions attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.13.7.1
             */
            currentConditionsChanged: OptionalEvent(0x0, Priority.Info, TlvCurrentConditionsChangedEvent)
        },

        /**
         * This metadata controls which ElectricalGridConditionsCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { forecasting: true }, component: ForecastingComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The Electrical Grid Conditions Cluster provides the mechanism for communicating electricity grid carbon intensity
     * to devices within the premises in units of Grams of CO2e per kWh.
     *
     * This is an important mechanism to allow energy appliances decide when to operate to help consumers reduce their
     * carbon footprint, when the pricing may be the same throughout the day.
     *
     * When homes have local generation (for example Solar PV) this may mean that the premises at the local grid
     * connection point has effectively no green house gas emissions, and so this cluster allows devices to understand
     * both the grid and local conditions.
     *
     * ElectricalGridConditionsCluster supports optional features that you can enable with the
     * ElectricalGridConditionsCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.13
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const FORE = { forecasting: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            forecastConditions: MutableCluster.AsConditional(
                ForecastingComponent.attributes.forecastConditions,
                { mandatoryIf: [FORE] }
            )
        },

        events: Cluster.events
    });

    /**
     * This cluster supports all ElectricalGridConditions features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ElectricalGridConditionsCluster = ElectricalGridConditions.Cluster;
export const ElectricalGridConditionsCluster = ElectricalGridConditions.Cluster;
ClusterRegistry.register(ElectricalGridConditions.Complete);
