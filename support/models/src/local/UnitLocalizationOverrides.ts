/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "UnitLocalization",

    children: [
        // Convenience override to have automatic validation for the value
        {
            tag: "attribute",
            name: "TemperatureUnit",
            id: 0,
            constraint: "in SupportedTemperatureUnits",
        },
    ],
});
