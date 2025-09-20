/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

describe("OO", () => {
    before(async () => {
        await chip.testFor("OO/2.3").edit(
            // CHIP enforces a maximal value on OffWaitTime of 215.  AFAICT this doesn't come from the specification,
            // so maybe is based on latency estimates?  For now we just rewrite
            // TODO - ask CHIP folks?
            edit.sed("s/maxValue: 215/maxValue: 300/"),
            edit.sed("s/value: 30000/value: 30500/"),
        );
    });
    chip("OO/*").exclude(
        // TODO - we need proper OffWithEffect support for this test to succeed
        //"OO/2.3",

        // TODO - requires scenes management features we do not yet offer
        "OO/2.7",
    );
});
