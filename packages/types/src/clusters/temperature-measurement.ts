/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute } from "../cluster/Cluster.js";
import { TlvInt16, TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace TemperatureMeasurement {
    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x402,
        name: "TemperatureMeasurement",
        revision: 4,

        attributes: {
            /**
             * Indicates the measured temperature. The null value indicates that the temperature is unknown.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.1
             */
            measuredValue: Attribute(0x0, TlvNullable(TlvInt16)),

            /**
             * Indicates the minimum value of MeasuredValue that is capable of being measured. See Measured Value for
             * more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.2
             */
            minMeasuredValue: Attribute(0x1, TlvNullable(TlvInt16.bound({ min: -27315 })), { default: -27315 }),

            /**
             * This attribute indicates the maximum value of MeasuredValue that is capable of being measured. See
             * Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.3
             */
            maxMeasuredValue: Attribute(0x2, TlvNullable(TlvInt16.bound({ max: 32767 })), { default: 32767 }),

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.4
             */
            tolerance: OptionalAttribute(0x3, TlvUInt16.bound({ max: 2048 }), { default: 0 })
        }
    });

    /**
     * This cluster provides an interface to temperature measurement functionality, including configuration and
     * provision of notifications of temperature measurements.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type TemperatureMeasurementCluster = TemperatureMeasurement.Cluster;
export const TemperatureMeasurementCluster = TemperatureMeasurement.Cluster;
ClusterRegistry.register(TemperatureMeasurement.Complete);
