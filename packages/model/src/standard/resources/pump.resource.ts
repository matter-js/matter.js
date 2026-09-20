/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Pump", xref: "device§5.5",

    details: "A Pump device is a pump that may have variable speed. It may have optional built-in sensors and a " +
        "regulation mechanism. It is typically used for pumping fluids like water." +
        "\n" +
        "### Cluster Restrictions" +
        "\n" +
        "#### On/Off Cluster (Server) Clarifications" +
        "\n" +
        "The actions carried out by a Pump device on receipt of commands are shown in the following." +
        "\n" +
        "#### Level Control Cluster (Server) Clarifications" +
        "\n" +
        "The Level Control cluster shall allow controlling the pump setpoints. However, the transition time " +
        "is always ignored." +
        "\n" +
        "The setpoint of the pump is a percentage related to the level according to the following table.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.5.4" },
        { tag: "requirement", name: "Groups", xref: "device§5.5.4" },
        { tag: "requirement", name: "OnOff", xref: "device§5.5.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§5.5.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§5.5.4" },
        { tag: "requirement", name: "PumpConfigurationAndControl", xref: "device§5.5.4" },
        { tag: "requirement", name: "TemperatureMeasurement", discriminator: "O:serverCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "TemperatureMeasurement", discriminator: "O:clientCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "PressureMeasurement", discriminator: "O:serverCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "PressureMeasurement", discriminator: "O:clientCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:serverCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:clientCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§5.5.4" }
    ]
});
