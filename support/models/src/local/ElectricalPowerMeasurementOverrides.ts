/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ElectricalPowerMeasurement",
    asOf: "1.3",

    children: [
        {
            tag: "event",
            id: 0,
            name: "MeasurementPeriodRanges",
            children: [
                {
                    tag: "field",
                    name: "Ranges",

                    // 1.3 spec mislabels the "access" column as "default" (still present in 1.4 as well)
                    default: [],
                    access: "R V",
                },
            ],
        },
    ],
});
