/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("G", () => {
    chip("G/*").exclude(
        // Groups revision 4 takes the script's legacy branch, whose step 7a expects a GroupKeyMap write of
        // MaxGroupsPerFabric + 1 entries for one fabric to succeed; matter.js and CHIP both limit the entries per fabric
        "G/2.2/*",
    );
});
