/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { TemperatureControl as TemperatureControlModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the TemperatureControl cluster.
 */
export namespace TemperatureControl {
    /**
     * {@link TemperatureControl} always supports these elements.
     */
    export namespace Base {
        export interface Commands {
            /**
             * This command is used to set the temperature setpoint.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.2.6.1
             */
            setTemperature(request: SetTemperatureRequest): MaybePromise;
        }
    }

    /**
     * {@link TemperatureControl} supports these elements if it supports feature "TemperatureNumber".
     */
    export namespace TemperatureNumberComponent {
        export interface Attributes {
            /**
             * Indicates the desired Temperature Setpoint on the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.1
             */
            readonly temperatureSetpoint: number;

            /**
             * Indicates the minimum temperature to which the TemperatureSetpoint attribute may be set.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.2
             */
            readonly minTemperature: number;

            /**
             * Indicates the maximum temperature to which the TemperatureSetpoint attribute may be set.
             *
             * If the Step attribute is supported, this attribute shall be such that MaxTemperature = MinTemperature +
             * (Step * n), where n is an integer and n > 0. If the Step attribute is not supported, this attribute shall
             * be such that MaxTemperature > MinTemperature.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.3
             */
            readonly maxTemperature: number;
        }
    }

    /**
     * {@link TemperatureControl} supports these elements if it supports feature "TemperatureStep".
     */
    export namespace TemperatureStepComponent {
        export interface Attributes {
            /**
             * Indicates the discrete value by which the TemperatureSetpoint attribute can be changed via the
             * SetTemperature command.
             *
             * For example, if the value of MinTemperature is 25.00C (2500) and the Step value is 0.50C (50), valid
             * values of the TargetTemperature field of the SetTemperature command would be 25.50C (2550), 26.00C
             * (2600), 26.50C (2650), etc.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.4
             */
            readonly step: number;
        }
    }

    /**
     * {@link TemperatureControl} supports these elements if it supports feature "TemperatureLevel".
     */
    export namespace TemperatureLevelComponent {
        export interface Attributes {
            /**
             * Indicates the currently selected temperature level setting of the server. This attribute shall be the
             * positional index of the list item in the SupportedTemperatureLevels list that represents the currently
             * selected temperature level setting of the server.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.5
             */
            readonly selectedTemperatureLevel: number;

            /**
             * Indicates the list of supported temperature level settings that may be selected via the
             * TargetTemperatureLevel field in the SetTemperature command. Each string is readable text that describes
             * each temperature level setting in a way that can be easily understood by humans. For example, a washing
             * machine can have temperature levels like "Cold", "Warm", and "Hot". Each string is specified by the
             * manufacturer.
             *
             * Each item in this list shall represent a unique temperature level. Each entry in this list shall have a
             * unique value. The entries in this list shall appear in order of increasing temperature level with list
             * item 0 being the setting with the lowest temperature level.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.6
             */
            readonly supportedTemperatureLevels: string[];
        }
    }

    /**
     * Attributes that may appear in {@link TemperatureControl}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the desired Temperature Setpoint on the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.1
         */
        readonly temperatureSetpoint: number;

        /**
         * Indicates the minimum temperature to which the TemperatureSetpoint attribute may be set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.2
         */
        readonly minTemperature: number;

        /**
         * Indicates the maximum temperature to which the TemperatureSetpoint attribute may be set.
         *
         * If the Step attribute is supported, this attribute shall be such that MaxTemperature = MinTemperature + (Step
         * * n), where n is an integer and n > 0. If the Step attribute is not supported, this attribute shall be such
         * that MaxTemperature > MinTemperature.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.3
         */
        readonly maxTemperature: number;

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
        readonly step: number;

        /**
         * Indicates the currently selected temperature level setting of the server. This attribute shall be the
         * positional index of the list item in the SupportedTemperatureLevels list that represents the currently
         * selected temperature level setting of the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.5.5
         */
        readonly selectedTemperatureLevel: number;

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
        readonly supportedTemperatureLevels: string[];
    }

    export interface Commands extends Base.Commands {}

    export type Components = [
        { flags: {}, commands: Base.Commands },
        { flags: { temperatureNumber: true }, attributes: TemperatureNumberComponent.Attributes },
        { flags: { temperatureStep: true }, attributes: TemperatureStepComponent.Attributes },
        { flags: { temperatureLevel: true }, attributes: TemperatureLevelComponent.Attributes }
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
    export interface SetTemperatureRequest {
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
    }

    export const id = ClusterId(0x56);
    export const name = "TemperatureControl" as const;
    export const revision = 1;
    export const schema = TemperatureControlModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof TemperatureControl;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `TemperatureControl` instead of
     * `TemperatureControl.Complete`)
     */
    export type Complete = typeof TemperatureControl;

    export declare const Complete: Complete;
    export declare const Typing: TemperatureControl;
}

ClusterNamespace.define(TemperatureControl);
export type TemperatureControlCluster = TemperatureControl.Cluster;
export const TemperatureControlCluster = TemperatureControl.Cluster;
export interface TemperatureControl extends ClusterTyping { Attributes: TemperatureControl.Attributes; Commands: TemperatureControl.Commands; Features: TemperatureControl.Features; Components: TemperatureControl.Components }
