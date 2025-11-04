/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ModeSelect } from "#clusters/mode-select";

export namespace ModeSelectInterface {
    export interface Base {
        /**
         * On receipt of this command, if the NewMode field indicates a valid mode transition within the supported list,
         * the server shall set the CurrentMode attribute to the NewMode value, otherwise, the server shall respond with
         * an INVALID_COMMAND status response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.9.7.1
         */
        changeToMode(request: ModeSelect.ChangeToModeRequest): MaybePromise;
    }
}

export type ModeSelectInterface = { components: [{ flags: {}, methods: ModeSelectInterface.Base }] };
