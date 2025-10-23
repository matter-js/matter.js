/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

describe("TSTAT", () => {
    before(async () => {
        await chip.testFor("TSTAT/2.2").edit(
            edit.sed(
                // Current tests do not respect updated Deadband limits ... now allowed up to 127
                "s/status = await self.write_single_attribute(attribute_value=cluster.Attributes.MinSetpointDeadBand(30), endpoint_id=endpoint, expect_success=False)/status = await self.write_single_attribute(attribute_value=cluster.Attributes.MinSetpointDeadBand(128), endpoint_id=endpoint, expect_success=False)/",
            ),
            edit.region(
                // Wrong checks on MinSetpointDeadBand: still checks old constrains with <=25 and tests writability, exclude
                {
                    after: '        self.step("11a")',
                    before: '        self.step("11b")',
                    replacement: "        disabled: true",
                },
            ),
        );
    });

    chip("TSTAT/*")
        // Presets not yet supported
        .exclude("TSTAT/4.2");
});
