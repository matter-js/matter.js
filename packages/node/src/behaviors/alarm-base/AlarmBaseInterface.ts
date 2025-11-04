/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { AlarmBase } from "#clusters/alarm-base";

export namespace AlarmBaseInterface {
    export interface Base {
        /**
         * This command allows a client to request that an alarm be enabled or suppressed at the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.2
         */
        modifyEnabledAlarms(request: AlarmBase.ModifyEnabledAlarmsRequest): MaybePromise;
    }

    export interface Reset {
        /**
         * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields
         * that represent the state of the server after the command has been processed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
         */
        reset(request: AlarmBase.ResetRequest): MaybePromise;
    }
}

export type AlarmBaseInterface = {
    components: [
        { flags: {}, methods: AlarmBaseInterface.Base },
        { flags: { reset: true }, methods: AlarmBaseInterface.Reset }
    ]
};
