/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { FanControl } from "#clusters/fan-control";

export namespace FanControlInterface {
    export interface Step {
        /**
         * This command indirectly changes the speed-oriented attributes of the fan in steps rather than using the
         * speed-oriented attributes, FanMode, PercentSetting, or SpeedSetting, directly. This command supports, for
         * example, a user-operated and wall-mounted toggle switch that can be used to increase or decrease the speed of
         * the fan by pressing the toggle switch up or down until the desired fan speed is reached. How this command is
         * interpreted by the server and how it affects the values of the speed-oriented attributes is implementation
         * specific.
         *
         * For example, a fan supports this command, and the value of the FanModeSequence attribute is 0. The current
         * value of the FanMode attribute is 2, or Medium. This command is received with the Direction field set to
         * Increase. As per it’s specific implementation, the server reacts to the command by setting the value of the
         * FanMode attribute to 3, or High, which in turn sets the PercentSetting and SpeedSetting (if present)
         * attributes to appropriate values, as defined by Section 4.4.6.3.1, “Percent Rules” and Section 4.4.6.6.1,
         * “Speed Rules” respectively.
         *
         * This command supports these fields:
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.4.7.1
         */
        step(request: FanControl.StepRequest): MaybePromise;
    }
}

export type FanControlInterface = { components: [{ flags: { step: true }, methods: FanControlInterface.Step }] };
