/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("CNET", () => {
    chip("CNET/*")
        // These test Wifi Commissioning, but there's no PICS or other check to skip when not relevant
        .exclude(
            "CNET/4.1",
            "CNET/4.9",
            "CNET/4.11",
            "CNET/4.15",
            "CNET/4.16",
            "CNET/4.23",

            // Also per-device credentials, but it does not even reach the skip: the runner passes no
            // --endpoint, which its own endpoint matcher requires
            "CNET/4.29",
        );
});
