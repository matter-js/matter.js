/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the LaundryDryerControls cluster.
 *
 * This cluster provides a way to access options associated with the operation of a laundry dryer device type.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 8.9
 */
export declare namespace LaundryDryerControls {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x004a;

    /**
     * Textual cluster identifier.
     */
    export const name: "LaundryDryerControls";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the LaundryDryerControls cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link LaundryDryerControls} always supports these elements.
     */
    export interface BaseAttributes {
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

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link LaundryDryerControls}.
     */
    export const Cluster: typeof LaundryDryerControls;

    /**
     * @deprecated Use {@link LaundryDryerControls}.
     */
    export const Complete: typeof LaundryDryerControls;

    export const Typing: LaundryDryerControls;
}

/**
 * @deprecated Use {@link LaundryDryerControls}.
 */
export declare const LaundryDryerControlsCluster: typeof LaundryDryerControls;

export interface LaundryDryerControls extends ClusterTyping {
    Attributes: LaundryDryerControls.Attributes;
    Components: LaundryDryerControls.Components;
}
