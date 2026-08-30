/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "TemperatureMeasurement",

    children: [
        // The CHIP-derived model, merged for 1.1 only, states the int16 "invalid" sentinel 0x8000 as the default
        { tag: "attribute", id: 0x1, name: "MinMeasuredValue", default: -27315, until: "1.2" },
        { tag: "attribute", id: 0x2, name: "MaxMeasuredValue", default: 32767, until: "1.2" },

        // Through 1.3 the scraped constraint names the cross-referenced attribute as "maxMeasuredValue1" /
        // "minMeasuredValue1", which resolves to nothing
        {
            tag: "attribute",
            id: 0x1,
            name: "MinMeasuredValue",
            constraint: "-27315 to MaxMeasuredValue-1",
            until: "1.4",
        },
        {
            tag: "attribute",
            id: 0x2,
            name: "MaxMeasuredValue",
            constraint: "MinMeasuredValue+1 to 32767",
            until: "1.4",
        },
    ],
});
