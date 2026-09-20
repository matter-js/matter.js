/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "WaterFreezeDetector", xref: "device§7.11",

    details: "This defines conformance to the Water Freeze Detector device type." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "#### Identify Cluster" +
        "\n" +
        "This is used to identify the endpoint." +
        "\n" +
        "#### Boolean State Cluster" +
        "\n" +
        "This is used to indicate the state of the sensor/detector." +
        "\n" +
        "The state of the Boolean State cluster shall reflect the sensor detection using this scheme of:" +
        "\n" +
        "Due to the difficulty in quantifying the risk of freezing based on the dependency on external " +
        "factors such as temperature, humidity, pressure, etc, the actual triggering of a detector of this " +
        "type depends on the physical construction and characteristics of the device and is therefore " +
        "considered manufacturer specific." +
        "\n" +
        "#### Boolean State Configuration Cluster" +
        "\n" +
        "This is used to configure the sensor/detector and is for this device type linked to the " +
        "configuration of the Boolean State cluster.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.11.4" },

        {
            tag: "requirement", name: "BooleanState", xref: "device§7.11.4",
            children: [
                { tag: "requirement", name: "StateChange", xref: "device§7.11.5" },
                { tag: "requirement", name: "CHANGEEVENT", xref: "device§7.11.5" }
            ]
        },

        { tag: "requirement", name: "BooleanStateConfiguration", xref: "device§7.11.4" }
    ]
});
