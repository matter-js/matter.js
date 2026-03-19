/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "OccupancySensorTypeEnum", xref: "cluster§2.7.5.3",
    details: "> [!NOTE]" +
        "\n" +
        "> This enum is as defined in ClusterRevision 4 and its definition shall NOT be extended; the feature " +
        "flags provide the sensor modality (or modalities) for later cluster revisions. See Backward " +
        "Compatibility section.",

    children: [
        { tag: "field", name: "Pir", description: "Indicates a passive infrared sensor." },
        { tag: "field", name: "Ultrasonic", description: "Indicates a ultrasonic sensor." },
        { tag: "field", name: "PirAndUltrasonic", description: "Indicates a passive infrared and ultrasonic sensor." },
        { tag: "field", name: "PhysicalContact", description: "Indicates a physical contact sensor." }
    ]
});
