/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { DishwasherAlarm } from "#clusters/dishwasher-alarm";

export namespace DishwasherAlarmInterface {
    export interface Base {
        /**
         * This command allows a client to request that an alarm be enabled or suppressed at the server.
         *
         * @see {@link MatterSpecification.v14.Cluster} § 1.15.7.2
         */
        modifyEnabledAlarms(request: DishwasherAlarm.ModifyEnabledAlarmsRequest): MaybePromise;
    }

    export interface Reset {
        /**
         * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields
         * that represent the state of the server after the command has been processed.
         *
         * @see {@link MatterSpecification.v14.Cluster} § 1.15.7.1
         */
        reset(request: DishwasherAlarm.ResetRequest): MaybePromise;
    }
}

export type DishwasherAlarmInterface = {
    components: [
        { flags: {}, methods: DishwasherAlarmInterface.Base },
        { flags: { reset: true }, methods: DishwasherAlarmInterface.Reset }
    ]
};
