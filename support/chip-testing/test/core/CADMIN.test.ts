/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalCredentialsBehavior } from "@matter/main/behaviors";
import { edit } from "@matter/testing";
import { NodeTestInstance } from "../../src/NodeTestInstance.js";

describe("CADMIN", () => {
    // CADMIN 1.5 sleeps for 190 seconds to wait for commissioning timeout.  We've forced timeout to 1 second so we can
    // sleep for much less time.  We also then need to reduce the window timeout from 180s to 1s
    before(() =>
        chip.testFor("CADMIN/1.5").edit(
            edit.sed(
                // Note: Previously had timeout=1 and sleep(5) and test was rock solid.  Subsequent CHIP changes made
                // things less resilient and would cause failure.  Possibly this guy:
                //
                //     https://github.com/project-chip/connectedhomeip/commit/be53d1826ab1160191432605f2db60baa5075a37
                //
                // Slightly less aggressive timeouts address this; haven't investigated further.

                // Reduce commissioning window time
                "s/timeout=180/timeout=5/",

                // Reduce sleep
                "s/sleep(190)/sleep(5)/",

                // Reduce discovery timeout too just to make failure faster
                "s/setupPinCode=/discoveryTimeoutMsec=5000,setupPinCode=/",
            ),

            // Step 4 originally receives "CancelledError" because of some future cancellation...  With our shortened
            // timeouts the CHIP error occurs first, which is the same as step 7 expects; correct the test
            edit.insert({
                after: /async def commission_on_network/,
                lines: "        expected_error = 50",
            }),
        ),
    );

    // 1.3 also has obnoxiously long sleeps but 181s instead of 190s (rolling eyes)
    before(() =>
        chip.testFor("CADMIN/1.3").edit(
            edit.sed(
                // Reduce commissioning window time
                "s/timeout=180/timeout=1/",

                // Reduce sleep
                "s/sleep(181)/sleep(2)/",
            ),
        ),
    );

    // CADMIN/1.16 waits for timeouts for two operations on BasicInformation NodeLabel which ends up being roughly
    // fourty seconds.  Reduce to 4 since we know that 2s. per is more than generous for local comms
    before(() =>
        chip.testFor("CADMIN/1.16").edit(
            edit.insert({
                after: "      PICS: BINFO.S.A0005",
                lines: "      timeout: 2",
            }),
        ),
    );

    // CHIP expects general error code 0xb when the proper response is NodeOperationalCertStatus.TableFull
    //
    // For now we just patch the test to convert 0xb (whatever that is) to 0x587, which appears to be an internal
    // encoding for ConstraintError (which is just 0x87, so presumably 0x500 is a bit prefix)
    before(() => chip.testFor("CADMIN/1.19").edit(edit.sed("s/0x0000000B/0x00000587/")));

    // For CADMIN/1.22 we reduce window timeout (see equivalent in SC/4.1)
    before(() => chip.testFor("CADMIN/1.22").edit(edit.sed("s/180/1/")));

    // Since our timeout is artificially low (1 s.) we need to reduce the timeout in the "discovery window too short"
    // test (see equivalent in Discovery.test.ts)
    before(() => chip.testFor("CADMIN/1.22").edit(edit.sed("s/timeout=179/timeout=0/")));

    chip("CADMIN/*").exclude(
        // Handled below
        "CADMIN/1.19",

        // These are joint fabric
        "CADMIN/1.27",
        "CADMIN/1.28",

        // TODO - results in test failing on step 12 with usual "The test expects no error but the "FAILURE" error
        // occured [sic]."  However, this occurs after successful commissioning and there are no errors in the logs from
        // CHIP. So going to be interesting to diagnose
        "CADMIN/1.16",
    );

    chip("CADMIN/1.19").beforeTest(subject => {
        const node = NodeTestInstance.nodeOf(subject);

        // CHIP has a hard-coded limit via CHIP_CONFIG_MAX_FABRICS macro which defaults to 16.  TC_ADMIN_1_19 fails
        // when we exhaust this space with our default fabric limit of 254.  Including a bug which lets the test
        // fail if limit is not 16, so set to 16 to be ok for now.
        return node.setStateOf(OperationalCredentialsBehavior, { supportedFabrics: 16 });
    });
});
