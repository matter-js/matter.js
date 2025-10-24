/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute } from "../cluster/Cluster.js";
import { TlvUInt16, TlvUInt8 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace IlluminanceMeasurement {
    /**
     * @see {@link MatterSpecification.v141.Cluster} § 2.2.4.1
     */
    export enum LightSensorType {
        /**
         * Indicates photodiode sensor type
         */
        Photodiode = 0,

        /**
         * Indicates CMOS sensor type
         */
        Cmos = 1
    }

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x400,
        name: "IlluminanceMeasurement",
        revision: 3,

        attributes: {
            /**
             * Indicates the illuminance in Lux (symbol lx) as follows:
             *
             *   • MeasuredValue = 10,000 x log10(illuminance) + 1,
             *
             * where 1 lx <= illuminance <= 3.576 Mlx, corresponding to a MeasuredValue in the range 1 to 0xFFFE. The
             * MeasuredValue attribute can take the following values:
             *
             *   • 0 indicates a value of illuminance that is too low to be measured,
             *
             *   • MinMeasuredValue <= MeasuredValue <= MaxMeasuredValue under normal circumstances,
             *
             *   • null indicates that the illuminance measurement is invalid.
             *
             * The MeasuredValue attribute is updated continuously as new measurements are made.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.2.5.1
             */
            measuredValue: Attribute(0x0, TlvNullable(TlvUInt16)),

            /**
             * Indicates the minimum value of MeasuredValue that can be measured. A value of null indicates that this
             * attribute is not defined. See Measured Value for more details.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.2.5.2
             */
            minMeasuredValue: Attribute(0x1, TlvNullable(TlvUInt16.bound({ min: 1, max: 65533 }))),

            /**
             * Indicates the maximum value of MeasuredValue that can be measured. A value of null indicates that this
             * attribute is not defined. See Measured Value for more details.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.2.5.3
             */
            maxMeasuredValue: Attribute(0x2, TlvNullable(TlvUInt16)),

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.2.5.4
             */
            tolerance: OptionalAttribute(0x3, TlvUInt16.bound({ max: 2048 })),

            /**
             * Indicates the electronic type of the light sensor. This attribute shall be set to one of the non-reserved
             * values listed in LightSensorTypeEnum or null in case the sensor type is unknown.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.2.5.5
             */
            lightSensorType: OptionalAttribute(0x4, TlvNullable(TlvUInt8), { default: null })
        }
    });

    /**
     * The Illuminance Measurement cluster provides an interface to illuminance measurement functionality, including
     * configuration and provision of notifications of illuminance measurements.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.2
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type IlluminanceMeasurementCluster = IlluminanceMeasurement.Cluster;
export const IlluminanceMeasurementCluster = IlluminanceMeasurement.Cluster;
ClusterRegistry.register(IlluminanceMeasurement.Complete);
