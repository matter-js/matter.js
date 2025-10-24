/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";

export namespace EthernetNetworkDiagnosticsInterface {
    export interface PacketCountsOrErrorCounts {
        /**
         * This command is used to reset the count attributes.
         *
         * Reception of this command shall reset the following attributes to 0:
         *
         *   • PacketRxCount
         *
         *   • PacketTxCount
         *
         *   • TxErrCount
         *
         *   • CollisionCount
         *
         *   • OverrunCount
         *
         * @see {@link MatterSpecification.v141.Core} § 11.16.7.1
         */
        resetCounts(): MaybePromise;
    }
}

export type EthernetNetworkDiagnosticsInterface = {
    components: [
        { flags: { packetCounts: true }, methods: EthernetNetworkDiagnosticsInterface.PacketCountsOrErrorCounts },
        { flags: { errorCounts: true }, methods: EthernetNetworkDiagnosticsInterface.PacketCountsOrErrorCounts }
    ]
};
