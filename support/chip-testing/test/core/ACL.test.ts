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
});
