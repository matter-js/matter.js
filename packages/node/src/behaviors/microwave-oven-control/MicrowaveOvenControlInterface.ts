/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { MicrowaveOvenControl } from "#clusters/microwave-oven-control";

export namespace MicrowaveOvenControlInterface {
    export interface Base {
        /**
         * This command is used to set the cooking parameters associated with the operation of the device. This command
         * supports the following fields:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.13.6.2
         */
        setCookingParameters(request: MicrowaveOvenControl.SetCookingParametersRequest): MaybePromise;

        /**
         * This command is used to add more time to the CookTime attribute of the server. This command supports these
         * fields:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 8.13.6.3
         */
        addMoreTime(request: MicrowaveOvenControl.AddMoreTimeRequest): MaybePromise;
    }
}

export type MicrowaveOvenControlInterface = { components: [{ flags: {}, methods: MicrowaveOvenControlInterface.Base }] };
