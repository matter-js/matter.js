/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { BooleanStateConfiguration } from "#clusters/boolean-state-configuration";

export namespace BooleanStateConfigurationInterface {
    export interface VisualOrAudible {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.8.7.2
         */
        enableDisableAlarm(request: BooleanStateConfiguration.EnableDisableAlarmRequest): MaybePromise;
    }

    export interface AlarmSuppress {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.8.7.1
         */
        suppressAlarm(request: BooleanStateConfiguration.SuppressAlarmRequest): MaybePromise;
    }
}

export type BooleanStateConfigurationInterface = {
    components: [
        { flags: { visual: true }, methods: BooleanStateConfigurationInterface.VisualOrAudible },
        { flags: { audible: true }, methods: BooleanStateConfigurationInterface.VisualOrAudible },
        { flags: { alarmSuppress: true }, methods: BooleanStateConfigurationInterface.AlarmSuppress }
    ]
};
