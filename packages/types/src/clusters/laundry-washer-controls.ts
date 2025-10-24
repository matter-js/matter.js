/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, WritableAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvUInt8, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace LaundryWasherControls {
    /**
     * These are optional features supported by LaundryWasherControlsCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.6.4
     */
    export enum Feature {
        /**
         * Spin (SPIN)
         *
         * This feature indicates multiple spin speeds are supported in at least one supported mode. Note that some
         * modes may not support multiple spin speeds even if this feature is supported.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.6.4.1
         */
        Spin = "Spin",

        /**
         * Rinse (RINSE)
         *
         * This feature indicates multiple rinse cycles are supported in at least one supported mode. Note that some
         * modes may not support selection of the number of rinse cycles even if this feature is supported.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.6.4.2
         */
        Rinse = "Rinse"
    }

    /**
     * The NumberOfRinsesEnum provides a representation of the number of rinses that will be performed for a selected
     * mode. NumberOfRinsesEnum is derived from enum8. It is up to the device manufacturer to determine the mapping
     * between the enum values and the corresponding numbers of rinses.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.6.5.1
     */
    export enum NumberOfRinses {
        /**
         * This laundry washer mode does not perform rinse cycles
         */
        None = 0,

        /**
         * This laundry washer mode performs normal rinse cycles determined by the manufacturer
         */
        Normal = 1,

        /**
         * This laundry washer mode performs an extra rinse cycle
         */
        Extra = 2,

        /**
         * This laundry washer mode performs the maximum number of rinse cycles determined by the manufacturer
         */
        Max = 3
    }

    /**
     * A LaundryWasherControlsCluster supports these elements if it supports feature Spin.
     */
    export const SpinComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the list of spin speeds available to the appliance in the currently selected mode. The spin
             * speed values are determined by the manufacturer. At least one spin speed value shall be provided in the
             * SpinSpeeds list. The list of spin speeds may change depending on the currently selected Laundry Washer
             * mode. For example, Quick mode might have a completely different list of SpinSpeeds than Delicates mode.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.6.6.1
             */
            spinSpeeds: Attribute(0x0, TlvArray(TlvString, { maxLength: 16 }), { default: [] }),

            /**
             * Indicates the currently selected spin speed. It is the index into the SpinSpeeds list of the selected
             * spin speed, as such, this attribute can be an integer between 0 and the number of entries in SpinSpeeds -
             * 1. If a value is received that is outside of the defined constraints, a CONSTRAINT_ERROR shall be sent as
             * the response. If a value is attempted to be written that doesn’t match a valid index (e.g. an index of 5
             * when the list has 4 values), a CONSTRAINT_ERROR shall be
             *
             * sent as the response. If null is written to this attribute, there will be no spin speed for the selected
             * cycle. If the value is null, there will be no spin speed on the current mode.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.6.6.2
             */
            spinSpeedCurrent: WritableAttribute(0x1, TlvNullable(TlvUInt8.bound({ max: 15 })))
        }
    });

    /**
     * A LaundryWasherControlsCluster supports these elements if it supports feature Rinse.
     */
    export const RinseComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates how many times a rinse cycle shall be performed on a device for the current mode of operation.
             * A value of None shall indicate that no rinse cycle will be performed. This value may be set by the client
             * to adjust the number of rinses that are performed for the current mode of operation. If the device is not
             * in a compatible state to accept the provided value, an INVALID_IN_STATE error shall be sent as the
             * response.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.6.6.3
             */
            numberOfRinses: WritableAttribute(0x2, TlvEnum<NumberOfRinses>()),

            /**
             * Indicates the amount of rinses allowed for a specific mode. Each entry shall indicate a
             * NumberOfRinsesEnum value that is possible in the selected mode on the device. The value of this attribute
             * may change at runtime based on the currently selected mode. Each entry shall be distinct.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.6.6.4
             */
            supportedRinses: Attribute(0x3, TlvArray(TlvEnum<NumberOfRinses>(), { maxLength: 4 }), { default: [] })
        }
    });

    /**
     * These elements and properties are present in all LaundryWasherControls clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x53,
        name: "LaundryWasherControls",
        revision: 2,

        features: {
            /**
             * This feature indicates multiple spin speeds are supported in at least one supported mode. Note that some
             * modes may not support multiple spin speeds even if this feature is supported.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.6.4.1
             */
            spin: BitFlag(0),

            /**
             * This feature indicates multiple rinse cycles are supported in at least one supported mode. Note that some
             * modes may not support selection of the number of rinse cycles even if this feature is supported.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.6.4.2
             */
            rinse: BitFlag(1)
        },

        /**
         * This metadata controls which LaundryWasherControlsCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { spin: true }, component: SpinComponent },
            { flags: { rinse: true }, component: RinseComponent },
            { flags: { spin: false, rinse: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster provides a way to access options associated with the operation of a laundry washer device type.
     *
     * Per the Matter specification you cannot use {@link LaundryWasherControlsCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.6
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const SPIN = { spin: true };
    const RINSE = { rinse: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            spinSpeeds: MutableCluster.AsConditional(SpinComponent.attributes.spinSpeeds, { mandatoryIf: [SPIN] }),
            spinSpeedCurrent: MutableCluster.AsConditional(
                SpinComponent.attributes.spinSpeedCurrent,
                { mandatoryIf: [SPIN] }
            ),
            numberOfRinses: MutableCluster.AsConditional(
                RinseComponent.attributes.numberOfRinses,
                { mandatoryIf: [RINSE] }
            ),
            supportedRinses: MutableCluster.AsConditional(
                RinseComponent.attributes.supportedRinses,
                { mandatoryIf: [RINSE] }
            )
        }
    });

    /**
     * This cluster supports all LaundryWasherControls features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type LaundryWasherControlsCluster = LaundryWasherControls.Cluster;
export const LaundryWasherControlsCluster = LaundryWasherControls.Cluster;
ClusterRegistry.register(LaundryWasherControls.Complete);
