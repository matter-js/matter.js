/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { LevelControl } from "@matter/types/clusters/level-control";

export namespace LevelControlInterface {
    export interface Base {
        /**
         * This command will move the device to the specified level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.1
         */
        moveToLevel(request: LevelControl.MoveToLevelRequest): MaybePromise;

        /**
         * This command will move the device using the specified values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2
         */
        move(request: LevelControl.MoveRequest): MaybePromise;

        /**
         * This command will do a relative step change of the device using the specified values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3
         */
        step(request: LevelControl.StepRequest): MaybePromise;

        /**
         * This command will stop the actions of various other commands that are still in progress.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.4
         */
        stop(request: LevelControl.StopRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
         */
        moveToLevelWithOnOff(request: LevelControl.MoveToLevelRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
         */
        moveWithOnOff(request: LevelControl.MoveRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
         */
        stepWithOnOff(request: LevelControl.StepRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
         */
        stopWithOnOff(request: LevelControl.StopRequest): MaybePromise;
    }

    export interface Frequency {
        /**
         * This command will cause the device to change the current frequency to the requested value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.5
         */
        moveToClosestFrequency(request: LevelControl.MoveToClosestFrequencyRequest): MaybePromise;
    }
}

export type LevelControlInterface = {
    components: [
        { flags: {}, methods: LevelControlInterface.Base },
        { flags: { frequency: true }, methods: LevelControlInterface.Frequency }
    ]
};
