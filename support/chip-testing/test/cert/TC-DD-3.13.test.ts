/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { defineFlowQrTest } from "./tc-dd-flow-support.js";
import { CUSTOM_FLOW } from "./tc-dd-support.js";

defineFlowQrTest(
    certTest("TC-DD-3.13", {
        plan: "devicediscovery.adoc",
        pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING", "MCORE.DD.CUSTOM_COMM_FLOW"],
        app: "all-clusters",
    }),
    CUSTOM_FLOW,
    "Custom",
);
