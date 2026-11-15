/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("WHM", () => {
    chip("WHM/*").exclude(
        // All WHM runs start a water-heater device, and WaterHeaterManagementServer has no logic yet
        "WHM/1.2/*",
        "WHM/2.1/*",
    );
});
