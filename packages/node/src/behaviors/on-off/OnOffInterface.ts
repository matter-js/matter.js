/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { OnOff } from "#clusters/on-off";

export namespace OnOffInterface {
    export interface Base {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.5.7.1
         */
        off(): MaybePromise;
    }

    export interface Lighting {
        /**
         * The OffWithEffect command allows devices to be turned off using enhanced ways of fading.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.5.7.4
         */
        offWithEffect(request: OnOff.OffWithEffectRequest): MaybePromise;

        /**
         * This command allows the recall of the settings when the device was turned off.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.5.7.5
         */
        onWithRecallGlobalScene(): MaybePromise;

        /**
         * This command allows devices to be turned on for a specific duration with a guarded off duration so that
         * SHOULD the device be subsequently turned off, further OnWithTimedOff commands, received during this time, are
         * prevented from turning the devices back on. Further OnWithTimedOff commands received while the server is
         * turned on, will update the period that the device is turned on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.5.7.6
         */
        onWithTimedOff(request: OnOff.OnWithTimedOffRequest): MaybePromise;
    }

    export interface NotOffOnly {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.5.7.2
         */
        on(): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.5.7.3
         */
        toggle(): MaybePromise;
    }
}

export type OnOffInterface = {
    components: [
        { flags: {}, methods: OnOffInterface.Base },
        { flags: { lighting: true }, methods: OnOffInterface.Lighting },
        { flags: { offOnly: false }, methods: OnOffInterface.NotOffOnly }
    ]
};
