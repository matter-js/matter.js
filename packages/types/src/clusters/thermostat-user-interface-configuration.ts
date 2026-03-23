/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ThermostatUserInterfaceConfiguration as ThermostatUserInterfaceConfigurationModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ThermostatUserInterfaceConfiguration cluster.
 */
export namespace ThermostatUserInterfaceConfiguration {
    /**
     * {@link ThermostatUserInterfaceConfiguration} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the units of the temperature displayed on the thermostat screen.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.5.6.1
             */
            temperatureDisplayMode: TemperatureDisplayMode;

            /**
             * Indicates the level of functionality that is available to the user via the keypad.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.5.6.2
             */
            keypadLockout: KeypadLockout;

            /**
             * This attribute is used to hide the weekly schedule programming functionality or menu on a thermostat from
             * a user to prevent local user programming of the weekly schedule. The schedule programming may still be
             * performed via a remote interface, and the thermostat may operate in schedule programming mode.
             *
             * This attribute is designed to prevent local tampering with or disabling of schedules that may have been
             * programmed by users or service providers via a more capable remote interface. The programming schedule
             * shall continue to run even though it is not visible to the user locally at the thermostat.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.5.6.3
             */
            scheduleProgrammingVisibility?: ScheduleProgrammingVisibility;
        }
    }

    /**
     * Attributes that may appear in {@link ThermostatUserInterfaceConfiguration}.
     *
     * Optional properties represent attributes that devices are not required to support.
     */
    export interface Attributes {
        /**
         * Indicates the units of the temperature displayed on the thermostat screen.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.5.6.1
         */
        temperatureDisplayMode: TemperatureDisplayMode;

        /**
         * Indicates the level of functionality that is available to the user via the keypad.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.5.6.2
         */
        keypadLockout: KeypadLockout;

        /**
         * This attribute is used to hide the weekly schedule programming functionality or menu on a thermostat from a
         * user to prevent local user programming of the weekly schedule. The schedule programming may still be
         * performed via a remote interface, and the thermostat may operate in schedule programming mode.
         *
         * This attribute is designed to prevent local tampering with or disabling of schedules that may have been
         * programmed by users or service providers via a more capable remote interface. The programming schedule shall
         * continue to run even though it is not visible to the user locally at the thermostat.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.5.6.3
         */
        scheduleProgrammingVisibility: ScheduleProgrammingVisibility;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.5.5.1
     */
    export enum TemperatureDisplayMode {
        /**
         * Temperature displayed in °C
         */
        Celsius = 0,

        /**
         * Temperature displayed in °F
         */
        Fahrenheit = 1
    }

    /**
     * The interpretation of the various levels is device-dependent.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.5.5.2
     */
    export enum KeypadLockout {
        /**
         * All functionality available to the user
         */
        NoLockout = 0,

        /**
         * Level 1 reduced functionality
         */
        Lockout1 = 1,

        /**
         * Level 2 reduced functionality
         */
        Lockout2 = 2,

        /**
         * Level 3 reduced functionality
         */
        Lockout3 = 3,

        /**
         * Level 4 reduced functionality
         */
        Lockout4 = 4,

        /**
         * Least functionality available to the user
         */
        Lockout5 = 5
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.5.5.3
     */
    export enum ScheduleProgrammingVisibility {
        /**
         * Local schedule programming functionality is enabled at the thermostat
         */
        ScheduleProgrammingPermitted = 0,

        /**
         * Local schedule programming functionality is disabled at the thermostat
         */
        ScheduleProgrammingDenied = 1
    }

    export const id = ClusterId(0x204);
    export const name = "ThermostatUserInterfaceConfiguration" as const;
    export const revision = 2;
    export const schema = ThermostatUserInterfaceConfigurationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof ThermostatUserInterfaceConfiguration;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ThermostatUserInterfaceConfiguration` instead of
     * `ThermostatUserInterfaceConfiguration.Complete`)
     */
    export type Complete = typeof ThermostatUserInterfaceConfiguration;

    export declare const Complete: Complete;
    export declare const Typing: ThermostatUserInterfaceConfiguration;
}

ClusterNamespace.define(ThermostatUserInterfaceConfiguration);
export type ThermostatUserInterfaceConfigurationCluster = ThermostatUserInterfaceConfiguration.Cluster;
export const ThermostatUserInterfaceConfigurationCluster = ThermostatUserInterfaceConfiguration.Cluster;
export interface ThermostatUserInterfaceConfiguration extends ClusterTyping { Attributes: ThermostatUserInterfaceConfiguration.Attributes; Components: ThermostatUserInterfaceConfiguration.Components }
