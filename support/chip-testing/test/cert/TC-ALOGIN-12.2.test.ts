/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { CHIP_TV_SETUP_PIN } from "../../src/cluster/TestAccountLoginServer.js";
import { commissionThStep } from "./tc-dd-support.js";
import { CommissionedRefs } from "./tc-support.js";
import { sendsTvCommand, TV_CONTENT_APP_ENDPOINT, TvCommandTarget } from "./tc-tv-client-support.js";

const ACCOUNT_LOGIN = Matter.clusters.require("AccountLogin");

/** All three commands are timed. GetSetupPIN and Login need Administer, which the DUT holds as the TH's commissioner. */
const CONTENT_APP: TvCommandTarget = {
    endpoint: TV_CONTENT_APP_ENDPOINT,
    options: { timedInteractionTimeoutMs: Seconds(2) },
};

/** The specification's minimum of 16 characters (§ 6.2.4.1.1). */
const TEMP_ACCOUNT_IDENTIFIER = "TempAccountId123";

const commissioned = new CommissionedRefs();

certTest("TC-ALOGIN-12.2", { plan: "media.adoc", pics: ["ALOGIN.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(
        1,
        "DUT sends GetSetupPIN command to TH",
        sendsTvCommand(
            commissioned,
            ACCOUNT_LOGIN,
            "getSetupPin",
            { tempAccountIdentifier: TEMP_ACCOUNT_IDENTIFIER },
            CONTENT_APP,
        ),
        { expected: "Verify command is successfully received by TH" },
    )
    .step(
        2,
        "DUT sends Login command to TH",
        sendsTvCommand(
            commissioned,
            ACCOUNT_LOGIN,
            "login",
            { tempAccountIdentifier: TEMP_ACCOUNT_IDENTIFIER, setupPin: CHIP_TV_SETUP_PIN },
            CONTENT_APP,
        ),
        { expected: "Verify command is successfully received by TH" },
    )
    .step(3, "DUT sends Logout command to TH", sendsTvCommand(commissioned, ACCOUNT_LOGIN, "logout", {}, CONTENT_APP), {
        expected: "Verify command is successfully received by TH",
    })
    .finalize(cx => commissioned.decommissionAll(cx));
