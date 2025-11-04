/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { OperationalState } from "#clusters/operational-state";

export namespace OperationalStateInterface {
    export interface Base {
        /**
         * This command shall be supported if the device supports remotely pausing the operation. If this command is
         * supported, the Resume command shall also be supported.
         *
         * On receipt of this command, the device shall pause its operation if it is possible based on the current
         * function of the server. For example, if it is at a point where it is safe to do so and/or permitted, but can
         * be restarted from the point at which pause occurred.
         *
         * If this command is received when already in the Paused state the device shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of NoError but take no further action.
         *
         * A device that receives this command in any state which is not Pause-compatible shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState and shall take no further
         * action.
         *
         * States are defined as Pause-compatible as follows:
         *
         *   • For states defined in this cluster specification, in Table 3, “Pause Compatibility”.
         *
         *   • For states defined by derived cluster specifications, in the corresponding specifications.
         *
         *   • For manufacturer-specific states, by the manufacturer.
         *
         * A device that is unable to honor the Pause command for whatever reason shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState but take no further action.
         *
         * Otherwise, on success:
         *
         *   • The OperationalState attribute shall be set to Paused.
         *
         *   • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of NoError.
         *
         * The following table defines the compatibility of this cluster’s states with the Pause command.
         *
         * ### Table 3. Pause Compatibility
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.14.6.1
         */
        pause(): MaybePromise<OperationalState.OperationalCommandResponse>;

        /**
         * This command shall be supported if the device supports remotely stopping the operation.
         *
         * On receipt of this command, the device shall stop its operation if it is at a position where it is safe to do
         * so and/or permitted. Restart of the device following the receipt of the Stop command shall require attended
         * operation unless remote start is allowed by the device type and any jurisdiction governing remote operation
         * of the device.
         *
         * If this command is received when already in the Stopped state the device shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of NoError but take no further action.
         *
         * A device that is unable to honor the Stop command for whatever reason shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState but take no further action.
         *
         * Otherwise, on success:
         *
         *   • The OperationalState attribute shall be set to Stopped.
         *
         *   • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of NoError.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.14.6.2
         */
        stop(): MaybePromise<OperationalState.OperationalCommandResponse>;

        /**
         * This command shall be supported if the device supports remotely starting the operation. If this command is
         * supported, the 'Stop command shall also be supported.
         *
         * On receipt of this command, the device shall start its operation if it is safe to do so and the device is in
         * an operational state from which it can be started. There may be either regulatory or manufacturer-imposed
         * safety and security requirements that first necessitate some specific action at the device before a Start
         * command can be honored. In such instances, a device shall respond with a status code of CommandInvalidInState
         * if a Start command is received prior to the required on-device action.
         *
         * If this command is received when already in the Running state the device shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of NoError but take no further action.
         *
         * A device that is unable to honor the Start command for whatever reason shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of UnableToStartOrResume but take no further action.
         *
         * Otherwise, on success:
         *
         *   • The OperationalState attribute shall be set to Running.
         *
         *   • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of NoError.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.14.6.3
         */
        start(): MaybePromise<OperationalState.OperationalCommandResponse>;

        /**
         * This command shall be supported if the device supports remotely resuming the operation. If this command is
         * supported, the Pause command shall also be supported.
         *
         * On receipt of this command, the device shall resume its operation from the point it was at when it received
         * the Pause command, or from the point when it was paused by means outside of this cluster (for example by
         * manual button press).
         *
         * If this command is received when already in the Running state the device shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of NoError but take no further action.
         *
         * A device that receives this command in any state which is not Resume-compatible shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of CommandInvalidInState and shall take no further
         * action.
         *
         * States are defined as Resume-compatible as follows:
         *
         *   • For states defined in this cluster specification, in Table 4, “Resume Compatibility”.
         *
         *   • For states defined by derived cluster specifications, in the corresponding specifications.
         *
         *   • For manufacturer-specific states, by the manufacturer.
         *
         * The following table defines the compatibility of this cluster’s states with the Resume command.
         *
         * ### Table 4. Resume Compatibility
         *
         * A device that is unable to honor the Resume command for any other reason shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of UnableToStartOrResume but take no further action.
         *
         * Otherwise, on success:
         *
         *   • The OperationalState attribute shall be set to the most recent non-Error operational state prior to
         *     entering the Paused state.
         *
         *   • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of NoError.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.14.6.4
         */
        resume(): MaybePromise<OperationalState.OperationalCommandResponse>;
    }
}

export type OperationalStateInterface = { components: [{ flags: {}, methods: OperationalStateInterface.Base }] };
