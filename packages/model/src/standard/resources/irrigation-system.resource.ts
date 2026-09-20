/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "IrrigationSystem", xref: "device§5.7",

    details: "This defines conformance to the Irrigation System device type. An irrigation system is used to " +
        "control a group of irrigation zones to water landscape. Irrigation systems are also commonly " +
        "referred to as \"Sprinkler Controllers\" since they are often used in residential and commercial " +
        "settings to control and schedule in-ground sprinkler systems for lawns. A physical irrigation system " +
        "typically has a set of electrical terminals to which in-ground water valves are connected so that " +
        "the system can actuate them." +
        "\n" +
        "### Irrigation System Architecture" +
        "\n" +
        "An irrigation system is always defined via endpoint composition. Irrigation system manufacturers " +
        "determine how many watering \"zone\" terminals are present on the physical device. Each zone is " +
        "represented by a disambiguated Water Valve endpoint:" +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "An irrigation system shall be composed of at least one endpoint with the Water Valve device type. " +
        "Any instance of the Valve Configuration and Control Cluster on an endpoint is scoped to the valve on " +
        "that endpoint and not the whole node." +
        "\n" +
        "If more than one instance of the Water Valve device type is present, each instance shall include " +
        "semantic tags from the common namespaces in the TagList attribute of the Descriptor cluster to " +
        "disambiguate which watering zone on the device each valve endpoint represents." +
        "\n" +
        "Some irrigation systems include a master valve installed at the main water supply line. When a " +
        "master valve is present, the physical system is responsible for opening it first when receiving a " +
        "command to open a downstream watering valve. In addition, the physical system is responsible for " +
        "closing the master valve when the last open watering valve is closed. Since the master valve is " +
        "orchestrated by the device, it is not represented as a Water Valve endpoint." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "#### Identify Cluster" +
        "\n" +
        "This cluster is used to identify the entire irrigation system device." +
        "\n" +
        "#### Operational State Cluster" +
        "\n" +
        "This cluster, if present, is used to denote the current state of the irrigation system. An " +
        "irrigation system may report the general operational states \"Running\" when at least one of the " +
        "composed water valves is open for any reason, and \"Stopped\" when all water valves are closed. In " +
        "addition, the system may support operational state commands \"Pause\" and \"Resume\" as well as the " +
        "operational state \"Paused\" if it supports temporarily pausing a water valve that is currently open " +
        "for a known duration. In this case, it SHOULD report the CountdownTime attribute to denote the " +
        "remaining open duration of a currently open valve." +
        "\n" +
        "#### Flow Measurement Cluster" +
        "\n" +
        "This cluster, if present, is used to measure the net flow through the irrigation system. When " +
        "present, the cluster shall report the total flow through the irrigation system and not any " +
        "individual valve." +
        "\n" +
        "If present, the flow measurement client cluster is used via binding to measure flow from external " +
        "flow sensors.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.7.6" },
        { tag: "requirement", name: "OperationalState", xref: "device§5.7.6" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:serverCluster", xref: "device§5.7.6" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:clientCluster", xref: "device§5.7.6" },
        { tag: "requirement", name: "WaterValve", xref: "device§5.7.5" }
    ]
});
