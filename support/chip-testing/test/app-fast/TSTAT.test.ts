/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

describe("TSTAT", () => {
    before(async () => {
        // Patches can be removed when https://github.com/project-chip/connectedhomeip/pull/41639 was merged and image rebuilt
        await chip.testFor("TSTAT/2.2").edit(
            edit.sed(
                // Current tests do not respect updated Deadband limits, which now allow values up to 127, so tweak test
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
        // Patch can be removed when https://github.com/project-chip/connectedhomeip/pull/41636 was merged and image rebuilt
        await chip.testFor("TSTAT/4.2").edit(
            edit.sed(
                // Current tests do not respect updated Deadband limits, which now allow values up to 127, so tweak test
                "s/test_presets = list(preset for preset in current_presets if preset.presetHandle is not activePresetHandle)/test_presets = list(preset for preset in current_presets if preset.presetHandle != activePresetHandle)/",
            ),
        );
    });

    chip("TSTAT/*")
        // TSTAT/4.3 is Thermostat suggestions
        .exclude("TSTAT/4.3");
});
