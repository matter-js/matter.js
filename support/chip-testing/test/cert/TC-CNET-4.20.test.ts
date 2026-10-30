/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { cnetClientCase, WIFI_CREDENTIALS, WIFI_SSID } from "./tc-cnet-support.js";

cnetClientCase({
    id: "TC-CNET-4.20",
    featurePics: "CNET.C.F00",
    app: "wifi-network",
    networkId: WIFI_SSID,
    add: {
        name: "AddOrUpdateWiFiNetwork",
        command: "addOrUpdateWiFiNetwork",
        pics: "CNET.C.C02.Tx",
        args: { ssid: WIFI_SSID, credentials: WIFI_CREDENTIALS },
    },
});
