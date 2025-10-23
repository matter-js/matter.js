/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute } from "../cluster/Cluster.js";
import { TlvInt16, TlvUInt16, TlvInt8 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace PressureMeasurement {
    /**
     * These are optional features supported by PressureMeasurementCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.4.4
     */
    export enum Feature {
        /**
         * Extended (EXT)
         *
         * Extended range and resolution
         */
        Extended = "Extended"
    }

    /**
     * A PressureMeasurementCluster supports these elements if it supports feature Extended.
     */
    export const ExtendedComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the pressure in Pascals as follows:
             *
             * ScaledValue = 10Scale x Pressure [Pa]
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.5
             */
            scaledValue: Attribute(0x10, TlvNullable(TlvInt16)),

            /**
             * Indicates the minimum value of ScaledValue that can be measured. The null value indicates that the value
             * is not available.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.6
             */
            minScaledValue: Attribute(0x11, TlvNullable(TlvInt16.bound({ max: 32766 }))),

            /**
             * Indicates the maximum value of ScaledValue that can be measured. The null value indicates that the value
             * is not available.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.7
             */
            maxScaledValue: Attribute(0x12, TlvNullable(TlvInt16)),

            /**
             * Indicates the magnitude of the possible error that is associated with Scaled
             *
             * ### Value. The true value is located in the range
             *
             * (ScaledValue – ScaledTolerance) to (ScaledValue + ScaledTolerance).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.8
             */
            scaledTolerance: OptionalAttribute(0x13, TlvUInt16.bound({ max: 2048 }), { default: 0 }),

            /**
             * Indicates the base 10 exponent used to obtain ScaledValue (see ScaledValue).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.9
             */
            scale: Attribute(0x14, TlvInt8.bound({ min: -127 }))
        }
    });

    /**
     * These elements and properties are present in all PressureMeasurement clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x403,
        name: "PressureMeasurement",
        revision: 3,

        features: {
            /**
             * Extended range and resolution
             */
            extended: BitFlag(0)
        },

        attributes: {
            /**
             * Indicates the pressure in kPa as follows:
             *
             * MeasuredValue = 10 x Pressure [kPa]
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.1
             */
            measuredValue: Attribute(0x0, TlvNullable(TlvInt16)),

            /**
             * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.2
             */
            minMeasuredValue: Attribute(0x1, TlvNullable(TlvInt16.bound({ max: 32766 }))),

            /**
             * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.3
             */
            maxMeasuredValue: Attribute(0x2, TlvNullable(TlvInt16)),

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 2.4.5.4
             */
            tolerance: OptionalAttribute(0x3, TlvUInt16.bound({ max: 2048 }), { default: 0 })
        },

        /**
         * This metadata controls which PressureMeasurementCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { extended: true }, component: ExtendedComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface to pressure measurement functionality, including configuration and provision
     * of notifications of pressure measurements.
     *
     * PressureMeasurementCluster supports optional features that you can enable with the
     * PressureMeasurementCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const EXT = { extended: true };

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
            scaledValue: MutableCluster.AsConditional(ExtendedComponent.attributes.scaledValue, { mandatoryIf: [EXT] }),
            minScaledValue: MutableCluster.AsConditional(
                ExtendedComponent.attributes.minScaledValue,
                { mandatoryIf: [EXT] }
            ),
            maxScaledValue: MutableCluster.AsConditional(
                ExtendedComponent.attributes.maxScaledValue,
                { mandatoryIf: [EXT] }
            ),
            scaledTolerance: MutableCluster.AsConditional(
                ExtendedComponent.attributes.scaledTolerance,
                { optionalIf: [EXT] }
            ),
            scale: MutableCluster.AsConditional(ExtendedComponent.attributes.scale, { mandatoryIf: [EXT] })
        }
    });

    /**
     * This cluster supports all PressureMeasurement features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type PressureMeasurementCluster = PressureMeasurement.Cluster;
export const PressureMeasurementCluster = PressureMeasurement.Cluster;
ClusterRegistry.register(PressureMeasurement.Complete);
