/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { AudioOutput } from "#clusters/audio-output";

export namespace AudioOutputInterface {
    export interface Base {
        /**
         * Upon receipt, this shall change the output on the device to the output at a specific index in the Output
         * List.
         *
         * Note that when the current output is set to an output of type HDMI, adjustments to volume via a Speaker
         * endpoint on the same node may cause HDMI volume up/down commands to be sent to the given HDMI output.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.1
         */
        selectOutput(request: AudioOutput.SelectOutputRequest): MaybePromise;
    }

    export interface NameUpdates {
        /**
         * Upon receipt, this shall rename the output at a specific index in the Output List.
         *
         * Updates to the output name shall appear in the device’s settings menus. Name updates may automatically be
         * sent to the actual device to which the output connects.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.2
         */
        renameOutput(request: AudioOutput.RenameOutputRequest): MaybePromise;
    }
}

export type AudioOutputInterface = {
    components: [
        { flags: {}, methods: AudioOutputInterface.Base },
        { flags: { nameUpdates: true }, methods: AudioOutputInterface.NameUpdates }
    ]
};
