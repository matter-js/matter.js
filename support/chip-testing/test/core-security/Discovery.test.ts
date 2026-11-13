/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

describe("Discovery", () => {
    before(async () => {
        // We have our timeouts set artificially low (1 s.) so we need to reduce the timeout in the "discovery
        // window too short" test to be zero
        await chip.testFor("Discovery").edit(edit.sed("s/value: 120/value: 0/"));

        // Avahi sometimes reports commissioning records from previous runs to CHIP even though we've expired the
        // records.  The test is not discriminating and may fail due to these previous records
        //
        // We nuke Avahi to compensate
        await chip.clearMdns();
    }).timeout(10000);

    chip("Discovery");
});
