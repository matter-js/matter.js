/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, WritableAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Identity } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { LaundryDryerControls as LaundryDryerControlsModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the LaundryDryerControls cluster.
 */
export namespace LaundryDryerControls {
    /**
     * Attributes that may appear in {@link LaundryDryerControls}.
     */
    export interface Attributes {
        /**
         * Indicates the list of supported dryness levels available to the appliance in the currently selected mode. The
         * dryness level values are determined by the manufacturer. At least one dryness level value shall be provided
         * in the SupportedDrynessLevels list. The list of dryness levels may change depending on the currently-selected
         * Laundry Dryer mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.9.5.1
         */
        supportedDrynessLevels: DrynessLevel[];

        /**
         * Indicates the currently-selected dryness level and it shall be the index into the SupportedDrynessLevels list
         * of the selected dryness level.
         *
         * If an attempt is made to write this attribute with a value other than null or a value contained in
         * SupportedDrynessLevels, a CONSTRAINT_ERROR response shall be sent as the response. If an attempt is made to
         * write this attribute while the device is not in a state that supports modifying the dryness level, an
         * INVALID_IN_STATE error shall be sent as the response. A value of null shall indicate that there will be no
         * dryness level setting for the current mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.9.5.2
         */
        selectedDrynessLevel: DrynessLevel | null;
    }

    export namespace Attributes {
        export type Components = [{ flags: {}, mandatory: "supportedDrynessLevels" | "selectedDrynessLevel" }];
    }

    /**
     * This enum provides a representation of the level of dryness that will be used while drying in a selected mode.
     *
     * It is up to the device manufacturer to determine the mapping between the enum values and the corresponding
     * temperature level.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.9.4.1
     */
    export enum DrynessLevel {
        /**
         * Provides a low dryness level for the selected mode
         */
        Low = 0,

        /**
         * Provides the normal level of dryness for the selected mode
         */
        Normal = 1,

        /**
         * Provides an extra dryness level for the selected mode
         */
        Extra = 2,

        /**
         * Provides the max dryness level for the selected mode
         */
        Max = 3
    }

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x4a,
        name: "LaundryDryerControls",
        revision: 1,

        attributes: {
            /**
             * Indicates the list of supported dryness levels available to the appliance in the currently selected mode.
             * The dryness level values are determined by the manufacturer. At least one dryness level value shall be
             * provided in the SupportedDrynessLevels list. The list of dryness levels may change depending on the
             * currently-selected Laundry Dryer mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.9.5.1
             */
            supportedDrynessLevels: Attribute(0x0, TlvArray(TlvEnum<DrynessLevel>(), { minLength: 1, maxLength: 4 })),

            /**
             * Indicates the currently-selected dryness level and it shall be the index into the SupportedDrynessLevels
             * list of the selected dryness level.
             *
             * If an attempt is made to write this attribute with a value other than null or a value contained in
             * SupportedDrynessLevels, a CONSTRAINT_ERROR response shall be sent as the response. If an attempt is made
             * to write this attribute while the device is not in a state that supports modifying the dryness level, an
             * INVALID_IN_STATE error shall be sent as the response. A value of null shall indicate that there will be
             * no dryness level setting for the current mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.9.5.2
             */
            selectedDrynessLevel: WritableAttribute(0x1, TlvNullable(TlvEnum<DrynessLevel>()))
        }
    });

    /**
     * This cluster provides a way to access options associated with the operation of a laundry dryer device type.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.9
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
    export const id = ClusterId(0x4a);
    export const name = "LaundryDryerControls" as const;
    export const revision = 1;
    export const schema = LaundryDryerControlsModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const Typing: LaundryDryerControls;
}

export type LaundryDryerControlsCluster = LaundryDryerControls.Cluster;
export const LaundryDryerControlsCluster = LaundryDryerControls.Cluster;
ClusterNamespace.define(LaundryDryerControls);
export interface LaundryDryerControls extends ClusterTyping { Attributes: LaundryDryerControls.Attributes & { Components: LaundryDryerControls.Attributes.Components } }
