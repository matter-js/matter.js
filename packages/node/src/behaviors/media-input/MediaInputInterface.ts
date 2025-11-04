/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { MediaInput } from "#clusters/media-input";

export namespace MediaInputInterface {
    export interface Base {
        /**
         * Upon receipt, this command shall change the media input on the device to the input at a specific index in the
         * Input List.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.1
         */
        selectInput(request: MediaInput.SelectInputRequest): MaybePromise;

        /**
         * Upon receipt, this command shall display the active status of the input list on screen.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.2
         */
        showInputStatus(): MaybePromise;

        /**
         * Upon receipt, this command shall hide the input list from the screen.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.3
         */
        hideInputStatus(): MaybePromise;
    }

    export interface NameUpdates {
        /**
         * Upon receipt, this command shall rename the input at a specific index in the Input List. Updates to the input
         * name shall appear in the device’s settings menus.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.4
         */
        renameInput(request: MediaInput.RenameInputRequest): MaybePromise;
    }
}

export type MediaInputInterface = {
    components: [
        { flags: {}, methods: MediaInputInterface.Base },
        { flags: { nameUpdates: true }, methods: MediaInputInterface.NameUpdates }
    ]
};
