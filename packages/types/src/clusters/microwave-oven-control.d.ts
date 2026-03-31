/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the MicrowaveOvenControl cluster.
 *
 * This cluster defines the requirements for the Microwave Oven Control cluster.
 *
 * This cluster has dependencies with the Operational State and Microwave Oven Mode clusters. The Operational State
 * cluster and the Microwave Oven Mode clusters, or derivatives of those clusters shall appear on the same endpoint as
 * this cluster.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 8.13
 */
export declare namespace MicrowaveOvenControl {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x005f;

    /**
     * Textual cluster identifier.
     */
    export const name: "MicrowaveOvenControl";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the MicrowaveOvenControl cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link MicrowaveOvenControl} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the total cook time associated with the operation of the device.
         *
         * This attribute shall remain unchanged during the operation of the oven unless the value is changed via a
         * command or out-of-band action.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.1
         */
        cookTime: number;

        /**
         * Indicates the maximum value to which the CookTime attribute can be set.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.2
         */
        maxCookTime: number;

        /**
         * Indicates the rating, in Watts, of the microwave power of the oven.
         *
         * Supporting this attribute can assist clients in suggesting cooking settings for various foods and beverages.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.9
         */
        wattRating?: number;
    }

    /**
     * {@link MicrowaveOvenControl} supports these elements if it supports feature "PowerAsNumber".
     */
    export interface PowerAsNumberAttributes {
        /**
         * Indicates the power level associated with the operation of the device.
         *
         * If the MinPower, MaxPower, and PowerStep attributes are not supported:
         *
         *   - The minimum value of this attribute shall be 10,
         *
         *   - The maximum value of this attribute shall be 100,
         *
         *   - The value shall be in even multiples of 10,
         *
         *   - The default value shall be 100.
         *
         * If the MinPower, MaxPower, and PowerStep attributes are supported:
         *
         *   - The value of this attribute shall be between MinPower and MaxPower inclusive.
         *
         *   - The value of this attribute shall be such that (PowerSetting - MinPower) % PowerStep == 0
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.3
         */
        powerSetting: number;
    }

    /**
     * {@link MicrowaveOvenControl} supports these elements if it supports feature "PowerNumberLimits".
     */
    export interface PowerNumberLimitsAttributes {
        /**
         * Indicates the minimum value to which the PowerSetting attribute that can be set on the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.4
         */
        minPower: number;

        /**
         * Indicates the maximum value to which the PowerSetting attribute that can be set on the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.5
         */
        maxPower: number;

        /**
         * Indicates the increment of power that can be set on the server.
         *
         * The value of this attribute shall be between 1 and MaxPower inclusive.
         *
         * The value of this attribute shall be such that (MaxPower - MinPower) % PowerStep == 0
         *
         * For example, if MinPower is 1, MaxPower is 10, and PowerSetting can be set to any integer between MinPower
         * and MaxPower, PowerStep would be set to 1.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.6
         */
        powerStep: number;
    }

    /**
     * {@link MicrowaveOvenControl} supports these elements if it supports feature "PowerInWatts".
     */
    export interface PowerInWattsAttributes {
        /**
         * Indicates the list of power levels (in W) supported by the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.7
         */
        supportedWatts: number[];

        /**
         * Indicates the index into the list of SupportedWatts of the currently selected power setting.
         *
         * The index shall be a valid index into the SupportedWatts list.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.8
         */
        selectedWattIndex: number;
    }

    /**
     * Attributes that may appear in {@link MicrowaveOvenControl}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the total cook time associated with the operation of the device.
         *
         * This attribute shall remain unchanged during the operation of the oven unless the value is changed via a
         * command or out-of-band action.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.1
         */
        cookTime: number;

        /**
         * Indicates the maximum value to which the CookTime attribute can be set.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.2
         */
        maxCookTime: number;

        /**
         * Indicates the rating, in Watts, of the microwave power of the oven.
         *
         * Supporting this attribute can assist clients in suggesting cooking settings for various foods and beverages.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.9
         */
        wattRating: number;

        /**
         * Indicates the power level associated with the operation of the device.
         *
         * If the MinPower, MaxPower, and PowerStep attributes are not supported:
         *
         *   - The minimum value of this attribute shall be 10,
         *
         *   - The maximum value of this attribute shall be 100,
         *
         *   - The value shall be in even multiples of 10,
         *
         *   - The default value shall be 100.
         *
         * If the MinPower, MaxPower, and PowerStep attributes are supported:
         *
         *   - The value of this attribute shall be between MinPower and MaxPower inclusive.
         *
         *   - The value of this attribute shall be such that (PowerSetting - MinPower) % PowerStep == 0
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.3
         */
        powerSetting: number;

        /**
         * Indicates the minimum value to which the PowerSetting attribute that can be set on the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.4
         */
        minPower: number;

        /**
         * Indicates the maximum value to which the PowerSetting attribute that can be set on the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.5
         */
        maxPower: number;

        /**
         * Indicates the increment of power that can be set on the server.
         *
         * The value of this attribute shall be between 1 and MaxPower inclusive.
         *
         * The value of this attribute shall be such that (MaxPower - MinPower) % PowerStep == 0
         *
         * For example, if MinPower is 1, MaxPower is 10, and PowerSetting can be set to any integer between MinPower
         * and MaxPower, PowerStep would be set to 1.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.6
         */
        powerStep: number;

        /**
         * Indicates the list of power levels (in W) supported by the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.7
         */
        supportedWatts: number[];

        /**
         * Indicates the index into the list of SupportedWatts of the currently selected power setting.
         *
         * The index shall be a valid index into the SupportedWatts list.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.5.8
         */
        selectedWattIndex: number;
    }

    /**
     * {@link MicrowaveOvenControl} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to set the cooking parameters associated with the operation of the device. This command
         * supports the following fields:
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.2
         */
        setCookingParameters(request: SetCookingParametersRequest): MaybePromise;

        /**
         * This command is used to add more time to the CookTime attribute of the server.
         *
         * This command supports these fields:
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.3
         */
        addMoreTime(request: AddMoreTimeRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link MicrowaveOvenControl}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { powerAsNumber: true }, attributes: PowerAsNumberAttributes },
        { flags: { powerNumberLimits: true }, attributes: PowerNumberLimitsAttributes },
        { flags: { powerInWatts: true }, attributes: PowerInWattsAttributes }
    ];

    export type Features = "PowerAsNumber" | "PowerInWatts" | "PowerNumberLimits";

    /**
     * These are optional features supported by MicrowaveOvenControlCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 8.13.4
     */
    export enum Feature {
        /**
         * PowerAsNumber (PWRNUM)
         *
         * Power is specified as a unitless number or a percentage
         */
        PowerAsNumber = "PowerAsNumber",

        /**
         * PowerInWatts (WATTS)
         *
         * Power is specified in Watts
         */
        PowerInWatts = "PowerInWatts",

        /**
         * PowerNumberLimits (PWRLMTS)
         *
         * Supports the limit attributes used with the PWRNUM feature
         */
        PowerNumberLimits = "PowerNumberLimits"
    }

    /**
     * This command is used to set the cooking parameters associated with the operation of the device. This command
     * supports the following fields:
     *
     * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.2
     */
    export declare class SetCookingParametersRequest {
        constructor(values?: Partial<SetCookingParametersRequest>);

        /**
         * This field shall indicate the value to which the CurrentMode attribute of the Microwave Oven Mode cluster
         * should be set. The value of this field shall be one from the list of SupportedModes from the Microwave Oven
         * Mode cluster.
         *
         * If this field is missing, the CurrentMode attribute shall be set to a mode having the Normal mode tag.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.2.1
         */
        cookMode?: number;

        /**
         * This field shall indicate the CookTime associated with the operation of the device. The value of this field
         * shall be subject to the constraints of the CookTime attribute of this cluster.
         *
         * If this field is missing, the CookTime attribute shall be set to 30 seconds by the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.2.2
         */
        cookTime?: number;

        /**
         * This field shall indicate the PowerSetting associated with the operation of the device. The value of this
         * field shall be subject to the constraints of the PowerSetting attribute of this cluster. If the PowerSetting
         * field does not conform to the constraints of the PowerSetting attribute, the server shall return a
         * CONSTRAINT_ERROR status.
         *
         * If this field is missing, the PowerSetting attribute shall be set to 100 if MaxPower is not supported by the
         * server, otherwise it shall be set to MaxPower if the MaxPower attribute is supported by the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.2.3
         */
        powerSetting?: number;

        /**
         * This field shall indicate the value to which the SelectedWattIndex attribute is set. If the value of this
         * field is greater than or equal to the length of the SupportedWatts attribute list, the server shall return a
         * CONSTRAINT_ERROR status and the value of the SelectedWattIndex attribute shall be unchanged.
         *
         * If this field is missing, the SelectedWattIndex attribute shall be set by the server to the index associated
         * with the highest Watt setting for the selected CookMode.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.2.4
         */
        wattSettingIndex?: number;

        /**
         * This field shall indicate whether or not oven operation shall be started when the command is received.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.2.5
         */
        startAfterSetting?: boolean;
    };

    /**
     * This command is used to add more time to the CookTime attribute of the server.
     *
     * This command supports these fields:
     *
     * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.3
     */
    export declare class AddMoreTimeRequest {
        constructor(values?: Partial<AddMoreTimeRequest>);

        /**
         * This field shall indicate the number of seconds to be added to the CookTime attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 8.13.6.3.1
         */
        timeToAdd: number;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link MicrowaveOvenControl}.
     */
    export const Cluster: typeof MicrowaveOvenControl;

    /**
     * @deprecated Use {@link MicrowaveOvenControl}.
     */
    export const Complete: typeof MicrowaveOvenControl;

    export const Typing: MicrowaveOvenControl;
}

/**
 * @deprecated Use {@link MicrowaveOvenControl}.
 */
export declare const MicrowaveOvenControlCluster: typeof MicrowaveOvenControl;

export interface MicrowaveOvenControl extends ClusterTyping {
    Attributes: MicrowaveOvenControl.Attributes;
    Commands: MicrowaveOvenControl.Commands;
    Features: MicrowaveOvenControl.Features;
    Components: MicrowaveOvenControl.Components;
}
