/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { cnetClientCase, THREAD_DATASET, THREAD_NETWORK_ID } from "./tc-cnet-support.js";

cnetClientCase({
    id: "TC-CNET-4.21",
    featurePics: "CNET.C.F01",
    app: "thread-network",
    networkId: THREAD_NETWORK_ID,
    add: {
        name: "AddOrUpdateThreadNetwork",
        command: "addOrUpdateThreadNetwork",
        pics: "CNET.C.C03.Tx",
        args: { operationalDataset: THREAD_DATASET },
    },
});
