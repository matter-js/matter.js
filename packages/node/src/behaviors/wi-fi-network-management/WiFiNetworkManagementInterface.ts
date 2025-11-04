/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { WiFiNetworkManagement } from "#clusters/wi-fi-network-management";

export namespace WiFiNetworkManagementInterface {
    export interface Base {
        /**
         * This command is used to request the current WPA-Personal passphrase or PSK associated with the Wi-Fi network
         * provided by this device.
         *
         * If the command is not executed via a CASE session, the command shall be rejected with a status of
         * UNSUPPORTED_ACCESS.
         *
         * If no primary Wi-Fi network is available (the SSID attribute is null), the command shall be rejected with a
         * status of INVALID_IN_STATE.
         *
         * Otherwise a NetworkPassphraseResponse shall be generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.2.5.1
         */
        networkPassphraseRequest(): MaybePromise<WiFiNetworkManagement.NetworkPassphraseResponse>;
    }
}

export type WiFiNetworkManagementInterface = { components: [{ flags: {}, methods: WiFiNetworkManagementInterface.Base }] };
