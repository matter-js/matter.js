/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "NetworkInfrastructureManager", xref: "device§15.3",

    details: "A Network Infrastructure Manager provides interfaces that allow for the management of the Wi-Fi, " +
        "Thread, and Ethernet networks underlying a Matter deployment, realizing the Star Network Topology " +
        "described in [MatterCore]." +
        "\n" +
        "Examples of physical devices that implement the Matter Network Infrastructure Manager device type " +
        "include Wi-Fi gateway routers." +
        "\n" +
        "Relevant hardware and software requirements for Network Infrastructure Manager devices are defined " +
        "in Section 15.3.6, “Other Requirements” and within the clusters mandated by this device type." +
        "\n" +
        "A Network Infrastructure Manager device may be managed by a service associated with the device " +
        "vendor, for example, an Internet Service Provider. Sometimes this managing service will have " +
        "policies that require the use of the Managed Device feature of the Access Control Cluster (see " +
        "Section 15.3.5.1, “Access Control MNGD Conformance”). Consequently, Commissioners of this device " +
        "type should be aware of this feature and its use.",

    children: [
        { tag: "requirement", name: "WiFiNetworkManagement", xref: "device§15.3.4" },
        { tag: "requirement", name: "ThreadBorderRouterManagement", xref: "device§15.3.4" },
        { tag: "requirement", name: "ThreadNetworkDirectory", xref: "device§15.3.4" },
        { tag: "requirement", name: "ThreadNetworkDiagnostics", xref: "device§15.3.4" }
    ]
});
