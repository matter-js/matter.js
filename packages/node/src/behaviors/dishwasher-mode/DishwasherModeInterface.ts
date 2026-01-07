/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ModeBase } from "#clusters/mode-base";

export namespace DishwasherModeInterface {
    export interface Base {
        /**
         * This command is used to change device modes.
         *
         * On receipt of this command the device shall respond with a ChangeToModeResponse command.
         *
         * @see {@link MatterSpecification.v14.Cluster} § 1.10.7.1
         */
        changeToMode(request: ModeBase.ChangeToModeRequest): MaybePromise<ModeBase.ChangeToModeResponse>;
    }
}

export type DishwasherModeInterface = { components: [{ flags: {}, methods: DishwasherModeInterface.Base }] };
