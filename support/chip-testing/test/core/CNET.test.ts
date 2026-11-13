/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("CNET", () => {
    chip("CNET/*").exclude(
        // These test Wifi Commissioning, but there's no PICS or other check to skip when not relevant
        "CNET/4.1",
        "CNET/4.9",
        "CNET/4.11",
        "CNET/4.15",
        "CNET/4.16",
        "CNET/4.23",

        // Registered below with the endpoint their matcher requires
        "CNET/4.25",
        "CNET/4.26",
        "CNET/4.27",
        "CNET/4.29",
    );

    // Per-device credentials, which our subjects do not support, so these skip themselves once their endpoint matcher
    // has an endpoint to check
    chip("CNET/4.25", "CNET/4.26", "CNET/4.27", "CNET/4.29").args("--endpoint", "0");
});
