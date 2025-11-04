/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { BridgedDeviceBasicInformation } from "#clusters/bridged-device-basic-information";

export namespace BridgedDeviceBasicInformationInterface {
    export interface BridgedIcdSupport {
        /**
         * Upon receipt, the server shall attempt to keep the bridged device active for the duration specified by the
         * command, when the device is next active.
         *
         * The implementation of this is best-effort since it may interact with non-native protocols. However, several
         * specific protocol requirements are:
         *
         *   • If the bridged device is a Matter Intermittently Connected Device, then the server shall send a
         *     StayActiveRequest command with the StayActiveDuration field set to value of the StayActiveDuration field
         *     in the received command to the bridged device when the bridged device next sends a checks-in message or
         *     subscription report. See Intermittently Connected Devices Behavior for details on ICD state management.
         *
         * When the bridge detects that the bridged device goes into an active state, an ActiveChanged event shall be
         * generated.
         *
         * In order to avoid unnecessary power consumption in the bridged device:
         *
         *   • The server shall enter a "pending active" state for the associated device when the KeepActive command is
         *     received. The server "pending active" state shall expire after the amount of time defined by the
         *     TimeoutMs field, in milliseconds, if no subsequent KeepActive command is received. When a KeepActive
         *     command is received, the "pending active" state is set, the StayActiveDuration is updated to the greater
         *     of the new value and the previously stored value, and the TimeoutMs is updated to the greater of the new
         *     value and the remaining time until the prior "pending active" state expires.
         *
         *   • The server shall only keep the bridged device active once for a request. (The server shall only consider
         *     the operation performed if an associated ActiveChanged event was generated.)
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.6.1
         */
        keepActive(request: BridgedDeviceBasicInformation.KeepActiveRequest): MaybePromise;
    }
}

export type BridgedDeviceBasicInformationInterface = {
    components: [
        { flags: { bridgedIcdSupport: true }, methods: BridgedDeviceBasicInformationInterface.BridgedIcdSupport }
    ]
};
