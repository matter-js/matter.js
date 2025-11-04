/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { TemperatureControl } from "#clusters/temperature-control";

export namespace TemperatureControlInterface {
    export interface Base {
        /**
         * This command is used to set the temperature setpoint.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.2.6.1
         */
        setTemperature(request: TemperatureControl.SetTemperatureRequest): MaybePromise;
    }
}

export type TemperatureControlInterface = { components: [{ flags: {}, methods: TemperatureControlInterface.Base }] };
