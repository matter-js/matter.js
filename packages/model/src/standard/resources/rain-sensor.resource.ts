/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "RainSensor", xref: "device§7.13",

    details: "This defines conformance to the Rain Sensor device type." +
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
        "#### Boolean State Configuration Cluster" +
        "\n" +
        "This is used to configure the sensor/detector and is for this device type linked to the " +
        "configuration of the Boolean State cluster.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.13.4" },

        {
            tag: "requirement", name: "BooleanState", xref: "device§7.13.4",
            children: [
                { tag: "requirement", name: "StateChange", xref: "device§7.13.5" },
                { tag: "requirement", name: "CHANGEEVENT", xref: "device§7.13.5" }
            ]
        },

        { tag: "requirement", name: "BooleanStateConfiguration", xref: "device§7.13.4" }
    ]
});
