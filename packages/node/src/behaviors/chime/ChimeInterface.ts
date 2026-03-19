/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";

export namespace ChimeInterface {
    export interface Base {
        /**
         * This command will play the currently selected chime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.6.1
         */
        playChimeSound(): MaybePromise;
    }
}

export type ChimeInterface = { components: [{ flags: {}, methods: ChimeInterface.Base }] };
