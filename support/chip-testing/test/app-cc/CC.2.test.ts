/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("CC", () => {
    chip("CC/5.*/*", "CC/6.*/*", "CC/7.*/*", "CC/8.*/*").exclude(
        // Reads ColorMode after a reboot and cross-checks it against the value the TH's subscription last saw.  The
        // TH expires its own sessions to trigger the reboot, our node drops the subscription rather than resuming it,
        // and the TH does not resubscribe, so it compares a fresh read against a pre-reboot cache
        "CC/6.5/run3",
    );
});
