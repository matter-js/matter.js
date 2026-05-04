/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "NetworkInfrastructureManager", xref: "device§15.3",

    details: "A Network Infrastructure Manager provides interfaces that allow for the management of the Wi-Fi, " +
        "Thread, and Ethernet networks underlying a Matter deployment, realizing the Star Network Topology " +
        "described in [[MatterCore]](#ref_MatterCore)." +
        "\n" +
        "Examples of physical devices that implement the Matter Network Infrastructure Manager device type " +
        "include Wi-Fi gateway routers." +
        "\n" +
        "Relevant hardware and software requirements for Network Infrastructure Manager devices are defined " +
        "in Section 15.3.6, \"Other Requirements\" and within the clusters mandated by this device type." +
        "\n" +
        "A Network Infrastructure Manager device may be managed by a service associated with the device " +
        "vendor, for example, an Internet Service Provider. Sometimes this managing service will have " +
        "policies that require the use of the Managed Device feature of the Access Control Cluster (see " +
        "Section 15.3.5.1, \"ManagedAclAllowed Condition\"). Consequently, Commissioners of this device type " +
        "should be aware of this feature and its use.",

    children: [
        {
            tag: "requirement", name: "ManagedAclAllowed", xref: "device§15.3.5.1",

            details: "A Network Infrastructure Manager device may utilize the ManagedAclAllowed condition to allow the " +
                "Managed Device (MNGD) feature flag of the Access Control Cluster on the device's Root Node endpoint " +
                "(i.e. Endpoint 0)." +
                "\n" +
                "Please refer to the \"Managed Device Feature Usage Restrictions\" section in the Access Control " +
                "Cluster chapter of the Matter Core Specification for the complete set of limitations on use of this " +
                "feature on endpoints with the Network Infrastructure Manager device type." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> NOTE: The conformance of this element crosses endpoints. It is expressed against the Root Node " +
                "endpoint and there shall NOT be a separate AccessControl cluster on the endpoint having the " +
                "Network Infrastructure Manager device type."
        },

        { tag: "requirement", name: "ThreadNetworkDiagnostics", xref: "device§15.3.4" },
        { tag: "requirement", name: "WiFiNetworkManagement", xref: "device§15.3.4" },
        { tag: "requirement", name: "ThreadBorderRouterManagement", xref: "device§15.3.4" },
        { tag: "requirement", name: "ThreadNetworkDirectory", xref: "device§15.3.4" }
    ]
});
