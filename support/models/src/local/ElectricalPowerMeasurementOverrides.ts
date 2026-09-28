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
    until: "1.4.2",

    children: [
        {
            tag: "event",
            id: 0,
            name: "MeasurementPeriodRanges",
            children: [
                {
                    tag: "field",
                    name: "Ranges",

                    // Before 1.4.2 the field table labels its access column "Default", so the scrape reads the
                    // access "RV" as the default value
                    default: [],
                },
            ],
        },
    ],
});
