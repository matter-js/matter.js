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
 * Definitions for the TemperatureControl cluster.
 *
 * This cluster provides an interface to the setpoint temperature on devices such as washers, refrigerators, and water
 * heaters. The setpoint temperature is the temperature to which a device using this cluster would attempt to control
 * to. This cluster does not provide access to the actual or physical temperature associated with any device using this
 * cluster. Access to the physical temperature associated with a device using this cluster would be provided by other
 * clusters as part of that devices device type definition.
 *
 * The values and constraints of the attributes communicated to clients SHOULD match the controls on any physical
 * interface on a device implementing this server. For example, the value of the Step attribute SHOULD match the
 * incremental value by which the temperature setpoint can be changed on the physical device.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 8.2
 */
export declare namespace TemperatureControl {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0056;

    /**
     * Textual cluster identifier.
     */
    export const name: "TemperatureControl";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the TemperatureControl cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link TemperatureControl} supports these elements if it supports feature "TemperatureNumber".
     */
    export interface TemperatureNumberAttributes {
        /**
         * Indicates the desired Temperature Setpoint on the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.1
         */
        temperatureSetpoint: number;

        /**
         * Indicates the minimum temperature to which the TemperatureSetpoint attribute may be set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.2
         */
        minTemperature: number;

        /**
         * Indicates the maximum temperature to which the TemperatureSetpoint attribute may be set.
         *
         * If the Step attribute is supported, this attribute shall be such that MaxTemperature = MinTemperature + (Step
         * * n), where n is an integer and n > 0. If the Step attribute is not supported, this attribute shall be such
         * that MaxTemperature > MinTemperature.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.3
         */
        maxTemperature: number;
    }

    /**
     * {@link TemperatureControl} supports these elements if it supports feature "TemperatureStep".
     */
    export interface TemperatureStepAttributes {
        /**
         * Indicates the discrete value by which the TemperatureSetpoint attribute can be changed via the SetTemperature
         * command.
         *
         * For example, if the value of MinTemperature is 25.00C (2500) and the Step value is 0.50C (50), valid values
         * of the TargetTemperature field of the SetTemperature command would be 25.50C (2550), 26.00C (2600), 26.50C
         * (2650), etc.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.4
         */
        step: number;
    }

    /**
     * {@link TemperatureControl} supports these elements if it supports feature "TemperatureLevel".
     */
    export interface TemperatureLevelAttributes {
        /**
         * Indicates the currently selected temperature level setting of the server. This attribute shall be the
         * positional index of the list item in the SupportedTemperatureLevels list that represents the currently
         * selected temperature level setting of the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.5
         */
        selectedTemperatureLevel: number;

        /**
         * Indicates the list of supported temperature level settings that may be selected via the
         * TargetTemperatureLevel field in the SetTemperature command. Each string is readable text that describes each
         * temperature level setting in a way that can be easily understood by humans. For example, a washing machine
         * can have temperature levels like "Cold", "Warm", and "Hot". Each string is specified by the manufacturer.
         *
         * Each item in this list shall represent a unique temperature level. Each entry in this list shall have a
         * unique value. The entries in this list shall appear in order of increasing temperature level with list item 0
         * being the setting with the lowest temperature level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.6
         */
        supportedTemperatureLevels: string[];
    }

    /**
     * Attributes that may appear in {@link TemperatureControl}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the desired Temperature Setpoint on the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.1
         */
        temperatureSetpoint: number;

        /**
         * Indicates the minimum temperature to which the TemperatureSetpoint attribute may be set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.2
         */
        minTemperature: number;

        /**
         * Indicates the maximum temperature to which the TemperatureSetpoint attribute may be set.
         *
         * If the Step attribute is supported, this attribute shall be such that MaxTemperature = MinTemperature + (Step
         * * n), where n is an integer and n > 0. If the Step attribute is not supported, this attribute shall be such
         * that MaxTemperature > MinTemperature.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.3
         */
        maxTemperature: number;

        /**
         * Indicates the discrete value by which the TemperatureSetpoint attribute can be changed via the SetTemperature
         * command.
         *
         * For example, if the value of MinTemperature is 25.00C (2500) and the Step value is 0.50C (50), valid values
         * of the TargetTemperature field of the SetTemperature command would be 25.50C (2550), 26.00C (2600), 26.50C
         * (2650), etc.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.4
         */
        step: number;

        /**
         * Indicates the currently selected temperature level setting of the server. This attribute shall be the
         * positional index of the list item in the SupportedTemperatureLevels list that represents the currently
         * selected temperature level setting of the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.5
         */
        selectedTemperatureLevel: number;

        /**
         * Indicates the list of supported temperature level settings that may be selected via the
         * TargetTemperatureLevel field in the SetTemperature command. Each string is readable text that describes each
         * temperature level setting in a way that can be easily understood by humans. For example, a washing machine
         * can have temperature levels like "Cold", "Warm", and "Hot". Each string is specified by the manufacturer.
         *
         * Each item in this list shall represent a unique temperature level. Each entry in this list shall have a
         * unique value. The entries in this list shall appear in order of increasing temperature level with list item 0
         * being the setting with the lowest temperature level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.6
         */
        supportedTemperatureLevels: string[];
    }

    /**
     * {@link TemperatureControl} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to set the temperature setpoint.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.6.1
         */
        setTemperature(request: SetTemperatureRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link TemperatureControl}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [
        { flags: {}, commands: BaseCommands },
        { flags: { temperatureNumber: true }, attributes: TemperatureNumberAttributes },
        { flags: { temperatureStep: true }, attributes: TemperatureStepAttributes },
        { flags: { temperatureLevel: true }, attributes: TemperatureLevelAttributes }
    ];

    export type Features = "TemperatureNumber" | "TemperatureLevel" | "TemperatureStep";

    /**
     * These are optional features supported by TemperatureControlCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.2.4
     */
    export enum Feature {
        /**
         * TemperatureNumber (TN)
         *
         * For devices that use an actual temperature value for the temperature setpoint, such as some water heaters,
         * the feature TN shall be used. Note that this cluster provides and supports temperatures in degrees Celsius
         * via the temperature data type.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.4.1
         */
        TemperatureNumber = "TemperatureNumber",

        /**
         * TemperatureLevel (TL)
         *
         * For devices that use vendor-specific temperature levels for the temperature setpoint, such as some washers,
         * the feature TL shall be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.4.2
         */
        TemperatureLevel = "TemperatureLevel",

        /**
         * TemperatureStep (STEP)
         *
         * For devices that support discrete temperature setpoints that are larger than the temperature resolution
         * imposed via the temperature data type, the Step feature may be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.4.3
         */
        TemperatureStep = "TemperatureStep"
    }

    /**
     * This command is used to set the temperature setpoint.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.2.6.1
     */
    export declare class SetTemperatureRequest {
        constructor(values?: Partial<SetTemperatureRequest>);

        /**
         * This field shall specify the desired temperature setpoint that the server is to be set to.
         *
         * The TargetTemperature shall be from MinTemperature to MaxTemperature inclusive. If the Step attribute is
         * supported, TargetTemperature shall be such that (TargetTemperature - MinTemperature) % Step == 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.6.1.1
         */
        targetTemperature?: number;

        /**
         * This field shall specify the index of the list item in the SupportedTemperatureLevels list that represents
         * the desired temperature level setting of the server. The value of this field shall be between 0 and the
         * length of the SupportedTemperatureLevels list -1.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.6.1.2
         */
        targetTemperatureLevel?: number;
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
     * @deprecated Use {@link TemperatureControl}.
     */
    export const Cluster: typeof TemperatureControl;

    /**
     * @deprecated Use {@link TemperatureControl}.
     */
    export const Complete: typeof TemperatureControl;

    export const Typing: TemperatureControl;
}

/**
 * @deprecated Use {@link TemperatureControl}.
 */
export declare const TemperatureControlCluster: typeof TemperatureControl;

export interface TemperatureControl extends ClusterTyping {
    Attributes: TemperatureControl.Attributes;
    Commands: TemperatureControl.Commands;
    Features: TemperatureControl.Features;
    Components: TemperatureControl.Components;
}
