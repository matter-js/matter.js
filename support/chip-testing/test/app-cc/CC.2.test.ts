/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("CC", () => {
    chip("CC/5.*/*", "CC/6.*/*", "CC/7.*/*", "CC/8.*/*").exclude("CC/6.5/run3");

    // The harness compares every read against a background wildcard subscription, and the subscription does not survive
    // the reboot this run performs: the harness expires its own sessions to trigger the reboot and never subscribes
    // again, so a post-reboot read of a value the reboot changed is compared against a pre-reboot cache.  The flag
    // switches the comparison off and leaves the test's own assertions intact
    chip("CC/6.5/run3").args("--no-wildcard-subscription");
});
