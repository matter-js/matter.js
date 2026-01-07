/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

describe("SWTCH", () => {
    // We need to patch the test a bit
    before(async () => {
        await chip.testFor("SWTCH/2.1").edit(
            // Test steps are overlapping here currently, so add a reset in between
            // Remove when https://github.com/project-chip/connectedhomeip/pull/38262 was merged
            edit.region({
                after: / {8}self.step\("7b"\)/,
                before: / */,
                replacement: "        self._ask_for_switch_idle(endpoint_id)",
            }),
        );
    });

    chip("SWTCH/**");
}).timeout(120000);
