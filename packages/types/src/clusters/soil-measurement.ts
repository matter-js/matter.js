/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, Attribute } from "../cluster/Cluster.js";
import { TlvMeasurementAccuracy } from "../globals/MeasurementAccuracy.js";
import { TlvPercent } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace SoilMeasurement {
    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x430,
        name: "SoilMeasurement",
        revision: 1,

        attributes: {
            /**
             * Indicates the limits for the SoilMoistureMeasuredValue attribute.
             *
             * Given the measurements are in percentage, the MinMeasuredValue field in the SoilMoistureMeasurementLimits
             * attribute shall NOT be less than 0 and shall NOT be greater than 99. The MaxMeasuredValue field in the
             * SoilMoistureMeasurementLimits attribute shall NOT be less than (SoilMoistureMinMeasurableValue + 1) and
             * shall NOT be greater than 100. The MeasurementType field value shall be set to SoilMoisture.
             *
             * There shall only be a single entry in the AccuracyRanges list of the SoilMoistureMeasurementLimits
             * attribute. The entry shall cover the full measurement range, meaning that the value of the RangeMin field
             * shall be equal to the value of the MinMeasuredValue field and the value of the RangeMax field shall be
             * equal to the value of the MaxMeasuredValue field. The entry shall only indicate a PercentMax value and
             * the value shall NOT be greater than 10.00 percent.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.15.4.1
             */
            soilMoistureMeasurementLimits: FixedAttribute(0x0, TlvMeasurementAccuracy),

            /**
             * Indicates the water content of the soil in percentage.
             *
             * The null value indicates that the measurement is unknown e.g. no measurement has been performed yet.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.15.4.2
             */
            soilMoistureMeasuredValue: Attribute(0x1, TlvNullable(TlvPercent))
        }
    });

    /**
     * This cluster provides an interface to soil measurement functionality, including configuration and provision of
     * notifications of soil measurements.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.15
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type SoilMeasurementCluster = SoilMeasurement.Cluster;
export const SoilMeasurementCluster = SoilMeasurement.Cluster;
ClusterRegistry.register(SoilMeasurement.Complete);
