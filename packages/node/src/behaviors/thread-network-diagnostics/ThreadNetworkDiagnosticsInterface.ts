/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";

export namespace ThreadNetworkDiagnosticsInterface {
    export interface ErrorCounts {
        /**
         * This command is used to reset the count attributes.
         *
         * Reception of this command shall reset the following attributes to 0:
         *
         *   • OverrunCount
         *
         * Upon completion, this command shall send a status code of SUCCESS back to the initiator.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.7.1
         */
        resetCounts(): MaybePromise;
    }
}

export type ThreadNetworkDiagnosticsInterface = {
    components: [{ flags: { errorCounts: true }, methods: ThreadNetworkDiagnosticsInterface.ErrorCounts }]
};
