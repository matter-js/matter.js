/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "RefrigeratorAlarm", pics: "REFALM", xref: "cluster§8.8",
    details: "This cluster is a derived cluster of Alarm Base cluster and provides the alarm definition related to " +
        "refrigerator and temperature controlled cabinet devices.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§8.8.4",
            children: [{ tag: "field", name: "RESET", details: "Supports the ability to reset alarms" }]
        },
        { tag: "command", name: "ModifyEnabledAlarms", xref: "cluster§8.8.7" },

        {
            tag: "datatype", name: "AlarmBitmap", xref: "cluster§8.8.5.1",
            children: [{
                tag: "field", name: "DoorOpen",
                description: "The cabinet’s door has been open for a vendor defined amount of time."
            }]
        }
    ]
});
