/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import { CommissionedRefs } from "./tc-support.js";
import { sendsTvCommand } from "./tc-tv-client-support.js";

const CONTENT_LAUNCHER = Matter.clusters.require("ContentLauncher");

/**
 * An `https` URL, which § 6.7.7.2 requires, and not one of the two URLs chip's tv-app answers with a failure status.
 * DisplayString and BrandingInformation are optional; sending them makes the step cover a struct field too.
 */
const ARGS = {
    contentUrl: "https://csa-iot.org/content",
    displayString: "Example content",
    brandingInformation: { providerName: "provider" },
};

const commissioned = new CommissionedRefs();

certTest("TC-CONTENTLAUNCHER-10.6", { plan: "media.adoc", pics: ["CONTENTLAUNCHER.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(1, "DUT sends LaunchURL command to TH", sendsTvCommand(commissioned, CONTENT_LAUNCHER, "launchUrl", ARGS), {
        pics: "CONTENTLAUNCHER.C.C01.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .finalize(cx => commissioned.decommissionAll(cx));
