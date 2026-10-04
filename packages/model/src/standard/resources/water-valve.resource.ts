/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "WaterValve", xref: "device§5.6",

    details: "This defines conformance to the Water Valve device type." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "#### Identify Cluster" +
        "\n" +
        "This cluster is used to identify the device." +
        "\n" +
        "#### Valve Configuration and Control Cluster" +
        "\n" +
        "This cluster is used to configure and control (Open/Close) the valve." +
        "\n" +
        "#### Flow Measurement Cluster" +
        "\n" +
        "The cluster server, if present, shall be used to report the measured flow through the valve." +
        "\n" +
        "The cluster client, if present, may be used via binding to close a control loop of flow through the " +
        "valve." +
        "\n" +
        "### Device implementation recommendations" +
        "\n" +
        "#### Start Up Behavior" +
        "\n" +
        "The start up behavior of a device with this device type, is currently not specified and is " +
        "considered manufacturer specific. This means that the start up behavior and what is considered the " +
        "\"safe state\", most suitable for the specific device, is defined by the manufacturer." +
        "\n" +
        "#### Firmware Update" +
        "\n" +
        "When a device with this device type needs to update its firmware (or restart for another reason), it " +
        "is strongly recommended to only perform the update/restart when the valve is in its closed state, as " +
        "well as ignoring any open request during this update/restart, given the chance a valve can " +
        "unintentionally be left in the open state, for longer periods of time.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.6.4" },
        { tag: "requirement", name: "ValveConfigurationAndControl", xref: "device§5.6.4" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:serverCluster", xref: "device§5.6.4" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:clientCluster", xref: "device§5.6.4" }
    ]
});
