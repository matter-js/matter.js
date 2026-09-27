/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OccupancySensor", xref: "device§7.3",

    details: "An Occupancy Sensor is a measurement and sensing device that is capable of measuring and reporting " +
        "the occupancy state in a designated area." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "#### Identify Cluster" +
        "\n" +
        "This is used to identify the endpoint." +
        "\n" +
        "#### Boolean State Configuration Cluster" +
        "\n" +
        "This is used to configure the sensor/detector (e.g. sensitivity) and is for this device type linked " +
        "to the configuration of the Occupancy Sensing cluster on the same endpoint." +
        "\n" +
        "#### Occupancy Sensing Cluster" +
        "\n" +
        "This is used to indicate occupancy as well as the type of occupancy sensor used for detection and " +
        "configuring the delays related to the occupied and unoccupied transitions." +
        "\n" +
        "### Multi-modality sensors" +
        "\n" +
        "The Occupancy Sensing cluster defines multiple modalities that can be employed to sense occupancy. A " +
        "device implementing multiple such modalities (exposed in the feature flags) can be implemented in " +
        "two ways:" +
        "\n" +
        "  - A single endpoint with an Occupancy Sensing cluster which has two or more of these feature bits " +
        "set to 1." +
        "\n" +
        "  - This requires reporting the combination the sensing results as a single bit in the Occupancy " +
        "attribute (and the OccupancyChanged event, when supported), with a single set of timing " +
        "parameters applied." +
        "\n" +
        "  - Sensitivity setting (via a Boolean State Configuration cluster on the same endpoint) applies to " +
        "all the sensing modalities together via a manufacturer-specific mapping." +
        "\n" +
        "  - Multiple endpoints each hosting an Occupancy Sensing cluster (each with one feature bit set):" +
        "\n" +
        "  - The sensing result of each modality is reported separately in the Occupancy attribute (and the " +
        "OccupancyChanged event, when supported) of each endpoint, governed by the set of timing " +
        "parameters provided in the cluster on that endpoint." +
        "\n" +
        "  - This implies some of these attributes can have a different values than their counterparts on " +
        "other endpoints and that a client may have to combine these values if it wants to derive a " +
        "single value." +
        "\n" +
        "  - Each modality can be provided with an independent sensitivity setting via a Boolean State " +
        "Configuration cluster located on one or more of the endpoints.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.3.4" },
        { tag: "requirement", name: "BooleanStateConfiguration", xref: "device§7.3.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§7.3.4" }
    ]
});
