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
 * Definitions for the ThermostatUserInterfaceConfiguration cluster.
 *
 * This cluster provides an interface to allow configuration of the user interface for a thermostat, or a thermostat
 * controller device, that supports a keypad and LCD screen.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 4.5
 */
export declare namespace ThermostatUserInterfaceConfiguration {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0204;

    /**
     * Textual cluster identifier.
     */
    export const name: "ThermostatUserInterfaceConfiguration";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the ThermostatUserInterfaceConfiguration cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ThermostatUserInterfaceConfiguration} always supports these elements.
     */
    export interface BaseAttributes {
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
        scheduleProgrammingVisibility?: ScheduleProgrammingVisibility;
    }

    /**
     * Attributes that may appear in {@link ThermostatUserInterfaceConfiguration}.
     *
     * Some properties may be optional if device support is not mandatory.
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

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

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

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link ThermostatUserInterfaceConfiguration}.
     */
    export const Cluster: typeof ThermostatUserInterfaceConfiguration;

    /**
     * @deprecated Use {@link ThermostatUserInterfaceConfiguration}.
     */
    export const Complete: typeof ThermostatUserInterfaceConfiguration;

    export const Typing: ThermostatUserInterfaceConfiguration;
}

/**
 * @deprecated Use {@link ThermostatUserInterfaceConfiguration}.
 */
export declare const ThermostatUserInterfaceConfigurationCluster: typeof ThermostatUserInterfaceConfiguration;

export interface ThermostatUserInterfaceConfiguration extends ClusterTyping {
    Attributes: ThermostatUserInterfaceConfiguration.Attributes;
    Components: ThermostatUserInterfaceConfiguration.Components;
}
