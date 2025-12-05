/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

// Note - SC/4.3 fails intermittently (22 of 156 runs) on step 8, sometimes because of a name mismatch, sometimes
// because no name is found and the test doesn't check for None
//
// SC/4.1 seems to have a similar issue
//
// I believe this is because of other Matter devices on my local network.  Fixing will require coming up with an
// isolated networking solution...  Easiest might be to just create an Avahi MDNS implementation and run Avahi with no
// networking

describe("SC", () => {
    before(async () => {
        await chip.clearMdns();

        const sc71 = chip.testFor("SC/7.1");
        await sc71.edit(
            edit.sed(
                // AFAICT 7.1 is kind of pointless unless we run w/ multiple DUTs.  But we do run it and need to disable
                // the check for default discriminator since we do in fact use the default (and there's .01% chance of
                // test failing due to collision anyway)
                "s/, 3840,/, 0000,/",

                // Likewise, we use the default passcode.  Disable that check too
                "s/, 20202021,/, 00000000,/",
            ),
        );
    }).timeout(10000);

    chip("SC/*").exclude(
        // These require additional configuration below
        "SC/4.1/*",
        "SC/7.1",
    );

    // SC/4.1 needs MDNS cleared.  run1 has the wrong manual code; run2 has a pairing code that works.  Not sure what's
    // up with that.  run3 is LIT ICD so not relevant for us
    [chip("SC/4.1/run1").args("--manual-code", "34970112332"), chip("SC/4.1/run2")].forEach(builder =>
        builder.beforeStart(async () => {
            await chip.clearMdns();
        }),
    );

    // 7.1 must start factory fresh
    chip("SC/7.1").uncommissioned();
});
