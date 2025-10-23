/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute, OptionalWritableAttribute } from "../cluster/Cluster.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { AccessLevel } from "#model";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ThermostatUserInterfaceConfiguration {
    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.5.5.1
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
     * @see {@link MatterSpecification.v141.Cluster} § 4.5.5.2
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
     * @see {@link MatterSpecification.v141.Cluster} § 4.5.5.3
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
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x204,
        name: "ThermostatUserInterfaceConfiguration",
        revision: 2,

        attributes: {
            /**
             * Indicates the units of the temperature displayed on the thermostat screen.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.5.6.1
             */
            temperatureDisplayMode: WritableAttribute(0x0, TlvEnum<TemperatureDisplayMode>()),

            /**
             * Indicates the level of functionality that is available to the user via the keypad.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.5.6.2
             */
            keypadLockout: WritableAttribute(0x1, TlvEnum<KeypadLockout>(), { writeAcl: AccessLevel.Manage }),

            /**
             * This attribute is used to hide the weekly schedule programming functionality or menu on a thermostat from
             * a user to prevent local user programming of the weekly schedule. The schedule programming may still be
             * performed via a remote interface, and the thermostat may operate in schedule programming mode.
             *
             * This attribute is designed to prevent local tampering with or disabling of schedules that may have been
             * programmed by users or service providers via a more capable remote interface. The programming schedule
             * shall continue to run even though it is not visible to the user locally at the thermostat.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.5.6.3
             */
            scheduleProgrammingVisibility: OptionalWritableAttribute(
                0x2,
                TlvEnum<ScheduleProgrammingVisibility>(),
                { default: ScheduleProgrammingVisibility.ScheduleProgrammingPermitted, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * This cluster provides an interface to allow configuration of the user interface for a thermostat, or a thermostat
     * controller device, that supports a keypad and LCD screen.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.5
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type ThermostatUserInterfaceConfigurationCluster = ThermostatUserInterfaceConfiguration.Cluster;
export const ThermostatUserInterfaceConfigurationCluster = ThermostatUserInterfaceConfiguration.Cluster;
ClusterRegistry.register(ThermostatUserInterfaceConfiguration.Complete);
