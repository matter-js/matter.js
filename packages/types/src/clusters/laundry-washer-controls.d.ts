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
 * Definitions for the LaundryWasherControls cluster.
 *
 * This cluster provides a way to access options associated with the operation of a laundry washer device type.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 8.6
 */
export declare namespace LaundryWasherControls {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0053;

    /**
     * Textual cluster identifier.
     */
    export const name: "LaundryWasherControls";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the LaundryWasherControls cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link LaundryWasherControls} supports these elements if it supports feature "Spin".
     */
    export interface SpinAttributes {
        /**
         * Indicates the list of spin speeds available to the appliance in the currently selected mode. The spin speed
         * values are determined by the manufacturer. At least one spin speed value shall be provided in the SpinSpeeds
         * list. The list of spin speeds may change depending on the currently selected Laundry Washer mode. For
         * example, Quick mode might have a completely different list of SpinSpeeds than Delicates mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.6.1
         */
        spinSpeeds: string[];

        /**
         * Indicates the currently selected spin speed. It is the index into the SpinSpeeds list of the selected spin
         * speed, as such, this attribute can be an integer between 0 and the number of entries in SpinSpeeds - 1. If a
         * value is received that is outside of the defined constraints, a CONSTRAINT_ERROR shall be sent as the
         * response. If a value is attempted to be written that doesn’t match a valid index (e.g. an index of 5 when the
         * list has 4 values), a CONSTRAINT_ERROR shall be sent as the response. If null is written to this attribute,
         * there will be no spin speed for the selected cycle. If the value is null, there will be no spin speed on the
         * current mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.6.2
         */
        spinSpeedCurrent: number | null;
    }

    /**
     * {@link LaundryWasherControls} supports these elements if it supports feature "Rinse".
     */
    export interface RinseAttributes {
        /**
         * Indicates how many times a rinse cycle shall be performed on a device for the current mode of operation. A
         * value of None shall indicate that no rinse cycle will be performed. This value may be set by the client to
         * adjust the number of rinses that are performed for the current mode of operation. If the device is not in a
         * compatible state to accept the provided value, an INVALID_IN_STATE error shall be sent as the response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.6.3
         */
        numberOfRinses: NumberOfRinses;

        /**
         * Indicates the amount of rinses allowed for a specific mode. Each entry shall indicate a NumberOfRinsesEnum
         * value that is possible in the selected mode on the device. The value of this attribute may change at runtime
         * based on the currently selected mode. Each entry shall be distinct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.6.4
         */
        supportedRinses: NumberOfRinses[];
    }

    /**
     * Attributes that may appear in {@link LaundryWasherControls}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the list of spin speeds available to the appliance in the currently selected mode. The spin speed
         * values are determined by the manufacturer. At least one spin speed value shall be provided in the SpinSpeeds
         * list. The list of spin speeds may change depending on the currently selected Laundry Washer mode. For
         * example, Quick mode might have a completely different list of SpinSpeeds than Delicates mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.6.1
         */
        spinSpeeds: string[];

        /**
         * Indicates the currently selected spin speed. It is the index into the SpinSpeeds list of the selected spin
         * speed, as such, this attribute can be an integer between 0 and the number of entries in SpinSpeeds - 1. If a
         * value is received that is outside of the defined constraints, a CONSTRAINT_ERROR shall be sent as the
         * response. If a value is attempted to be written that doesn’t match a valid index (e.g. an index of 5 when the
         * list has 4 values), a CONSTRAINT_ERROR shall be sent as the response. If null is written to this attribute,
         * there will be no spin speed for the selected cycle. If the value is null, there will be no spin speed on the
         * current mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.6.2
         */
        spinSpeedCurrent: number | null;

        /**
         * Indicates how many times a rinse cycle shall be performed on a device for the current mode of operation. A
         * value of None shall indicate that no rinse cycle will be performed. This value may be set by the client to
         * adjust the number of rinses that are performed for the current mode of operation. If the device is not in a
         * compatible state to accept the provided value, an INVALID_IN_STATE error shall be sent as the response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.6.3
         */
        numberOfRinses: NumberOfRinses;

        /**
         * Indicates the amount of rinses allowed for a specific mode. Each entry shall indicate a NumberOfRinsesEnum
         * value that is possible in the selected mode on the device. The value of this attribute may change at runtime
         * based on the currently selected mode. Each entry shall be distinct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.6.4
         */
        supportedRinses: NumberOfRinses[];
    }

    export type Components = [
        { flags: { spin: true }, attributes: SpinAttributes },
        { flags: { rinse: true }, attributes: RinseAttributes }
    ];
    export type Features = "Spin" | "Rinse";

    /**
     * These are optional features supported by LaundryWasherControlsCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.6.4
     */
    export enum Feature {
        /**
         * Spin (SPIN)
         *
         * This feature indicates multiple spin speeds are supported in at least one supported mode. Note that some
         * modes may not support multiple spin speeds even if this feature is supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.4.1
         */
        Spin = "Spin",

        /**
         * Rinse (RINSE)
         *
         * This feature indicates multiple rinse cycles are supported in at least one supported mode. Note that some
         * modes may not support selection of the number of rinse cycles even if this feature is supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.6.4.2
         */
        Rinse = "Rinse"
    }

    /**
     * The NumberOfRinsesEnum provides a representation of the number of rinses that will be performed for a selected
     * mode. NumberOfRinsesEnum is derived from enum8. It is up to the device manufacturer to determine the mapping
     * between the enum values and the corresponding numbers of rinses.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.6.5.1
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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link LaundryWasherControls}.
     */
    export const Cluster: ClusterType.WithCompat<typeof LaundryWasherControls, LaundryWasherControls>;

    /**
     * @deprecated Use {@link LaundryWasherControls}.
     */
    export const Complete: typeof LaundryWasherControls;

    export const Typing: LaundryWasherControls;
}

/**
 * @deprecated Use {@link LaundryWasherControls}.
 */
export declare const LaundryWasherControlsCluster: typeof LaundryWasherControls;

export interface LaundryWasherControls extends ClusterTyping {
    Attributes: LaundryWasherControls.Attributes;
    Features: LaundryWasherControls.Features;
    Components: LaundryWasherControls.Components;
}
