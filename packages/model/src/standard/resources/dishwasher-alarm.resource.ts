/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "DishwasherAlarm", pics: "DISHALM", xref: "cluster§8.4",
    details: "This cluster is a derived cluster of the Alarm Base cluster and provides the alarm definition " +
        "related to dishwasher devices.",

    children: [{
        tag: "datatype", name: "AlarmBitmap", xref: "cluster§8.4.4.1",

        children: [
            { tag: "field", name: "InflowError", description: "Water inflow is abnormal" },
            { tag: "field", name: "DrainError", description: "Water draining is abnormal" },
            { tag: "field", name: "DoorError", description: "Door or door lock is abnormal" },
            { tag: "field", name: "TempTooLow", description: "Unable to reach normal temperature" },
            { tag: "field", name: "TempTooHigh", description: "Temperature is too high" },
            { tag: "field", name: "WaterLevelError", description: "Water level is abnormal" }
        ]
    }]
});
