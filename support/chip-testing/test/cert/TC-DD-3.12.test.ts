/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { defineFlowQrTest } from "./tc-dd-flow-support.js";
import { COMMISSIONING_GIVE_UP, USER_INTENT_FLOW } from "./tc-dd-support.js";

defineFlowQrTest(
    certTest("TC-DD-3.12", {
        plan: "devicediscovery.adoc",
        pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING", "MCORE.DD.USER_INTENT_COMM_FLOW"],
        app: "all-clusters",

        // The case's commissioning steps rest on step 0's discriminator probe, which needs a give-up
        controllerCapabilities: COMMISSIONING_GIVE_UP,
    }),
    USER_INTENT_FLOW,
);
