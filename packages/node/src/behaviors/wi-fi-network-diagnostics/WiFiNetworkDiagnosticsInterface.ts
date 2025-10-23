/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";

export namespace WiFiNetworkDiagnosticsInterface {
    export interface ErrorCounts {
        /**
         * This command is used to reset the count attributes.
         *
         * Reception of this command shall reset the following attributes to 0:
         *
         *   • BeaconLostCount
         *
         *   • BeaconRxCount
         *
         *   • PacketMulticastRxCount
         *
         *   • PacketMulticastTxCount
         *
         *   • PacketUnicastRxCount
         *
         *   • PacketUnicastTxCount
         *
         * @see {@link MatterSpecification.v141.Core} § 11.15.7.1
         */
        resetCounts(): MaybePromise;
    }
}

export type WiFiNetworkDiagnosticsInterface = {
    components: [{ flags: { errorCounts: true }, methods: WiFiNetworkDiagnosticsInterface.ErrorCounts }]
};
