/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("ACL", () => {
    chip("ACL/*").exclude(
        // Requires ARLs which we don't implement
        "ACL/2.11",

        // These do not test Matter but rather the CHIP implementation of Matter
        // TODO - re-enable once tests are fixed or we've updated our CHIP emulation
        "ACL/2.6",
        "ACL/2.8",
    );
    // Selects the runs of multi-run tests, which "ACL/*" does not
    chip("ACL/*/run*").exclude("ACL/2.11/*", "ACL/2.6/*", "ACL/2.8/*").exclude(
        // Runs for the CHIP camera app, which matter.js has no test subject for
        "ACL/2.2/run2",
        "ACL/2.4/run2",
        "ACL/2.9/run3",
        "ACL/2.10/run3",
    );
});
