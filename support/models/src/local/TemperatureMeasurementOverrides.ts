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
        {
            tag: "attribute",
            id: 0x0,
            name: "MeasuredValue",
            constraint: "MinMeasuredValue to MaxMeasuredValue",
        },
        {
            tag: "attribute",
            id: 0x1,
            name: "MinMeasuredValue",
            default: -27315,
            constraint: "-27315 to MaxMeasuredValue-1",
        },
        {
            tag: "attribute",
            id: 0x2,
            name: "MaxMeasuredValue",
            default: 32767,
            constraint: "MinMeasuredValue+1 to 32767",
        },
    ],
});
