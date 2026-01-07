/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

describe("access-control", () => {
    // CHIP uses FAILURE error code where spec mandates RESOURCE_EXHAUSTED.  Patch the test to conform
    before(() => chip.testFor("AccessControlCluster").edit(edit.sed("s/error: FAILURE/error: RESOURCE_EXHAUSTED/")));

    chip("AccessControlCluster", "AccessControlConstraints");
});
