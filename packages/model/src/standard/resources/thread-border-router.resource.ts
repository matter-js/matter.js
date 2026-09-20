/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ThreadBorderRouter", xref: "device§15.4",

    details: "A Thread Border Router device type provides interfaces for querying and configuring the associated " +
        "Thread network." +
        "\n" +
        "Instances of physical devices categorized as Thread Border Routers encompass standalone Thread " +
        "Border Routers, conventional application devices like smart speakers, media streamers, and lighting " +
        "fixtures equipped with a Thread Border Router, as well as Wi-Fi Routers incorporating Thread Border " +
        "Router functionality." +
        "\n" +
        "The necessary hardware and software prerequisites are detailed within the clusters that are mandated " +
        "by this device type." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "If a Thread Border Router endpoint supports the Secondary Network Interface device type, then" +
        "\n" +
        "  - The Thread Border Router Management cluster and the Network Commissioning Cluster shall reflect " +
        "the same underlying network configuration, i.e. changes made via either cluster shall also be " +
        "reflected in the other." +
        "\n" +
        "  - The MaxNetworks attribute in the Network Commissioning Cluster shall have a value of 1." +
        "\n" +
        "### Other Requirements" +
        "\n" +
        "The device shall implement a Thread Border Router as described by the Thread specification, and " +
        "provide connectivity between the Thread network and a hub network when connected via a functioning " +
        "adjacent infrastructure link." +
        "\n" +
        "The Thread Interface associated with the Border Router shall be exposed via the Thread Border Router " +
        "Management cluster." +
        "\n" +
        "The device may include a Network Commissioning cluster instance associated with the Wi-Fi or " +
        "Ethernet adjacent infrastructure link interface on its Root Node. It SHOULD NOT include a Network " +
        "Commissioning cluster instance associated with the Thread interface of the Border Router on its Root " +
        "Node." +
        "\n" +
        "#### Thread Requirements" +
        "\n" +
        "A device exposing the Thread Border Router device type shall be certified by the Thread Group as " +
        "Built on Thread: Border Router based on Thread 1.4.0 or above." +
        "\n" +
        "The device shall implement a Thread Border Router as described by the Thread specification, and " +
        "provide connectivity between the Thread network and the Wi-Fi / Ethernet hub network. The Thread " +
        "Interface associated with the Border Router shall be exposed via the Thread Border Router Management " +
        "cluster." +
        "\n" +
        "The Thread Border Router device shall support working as a Thread Parent for a minimum of 64 Thread " +
        "Children simultaneously in any combination of Children End Device types. The Thread Border Router " +
        "device shall support operating as a Thread Border Router in any Thread Network with up to 150 Thread " +
        "nodes." +
        "\n" +
        "### Cluster Usage" +
        "\n" +
        "This section describes how to control and monitor the operation of a Thread Border Router." +
        "\n" +
        "The Thread Border Router Device Type provides the Thread Border Router Management Cluster with the " +
        "goal of ensuring a seamless user experience when adding a new Border Router to form a new Thread " +
        "network or join an existing one. This section presents informative configuration sequences that a " +
        "Fabric Admin can set up to improve coverage and Internet access redundancy for Thread networks using " +
        "the Thread Border Router device type. Four use cases are covered:" +
        "\n" +
        "  - Initial configuration of a Thread Border Router when no PAN exists" +
        "\n" +
        "  - Joining an existing PAN" +
        "\n" +
        "  - Sharing an existing PAN" +
        "\n" +
        "  - Moving to a new PAN" +
        "\n" +
        "#### Initial configuration of Thread Border Router" +
        "\n" +
        "In this use case, there is initially no PAN at the user's home. The user installs a Matter certified " +
        "Thread Border Router to use Thread connectivity for their Matter devices." +
        "\n" +
        "After installation, the PAN configured by Admin A on the Thread Border Router is used to install the " +
        "Thread Matter device on Fabric A." +
        "\n" +
        "#### Joining an existing PAN" +
        "\n" +
        "In this use case, there is already a PAN in the user's home that is managed by a Fabric A with TBR1 " +
        "(e.g. as a result of the above sequence diagram applied previously between Admin 1 and TBR1). The " +
        "user installs a Matter-certified Thread Border Router (TBR2) to extend the Thread coverage and " +
        "Internet access redundancy of Thread networks for their Matter devices." +
        "\n" +
        "After installation, a single Thread PAN is shared by all Border Routers." +
        "\n" +
        "#### Share an existing PAN" +
        "\n" +
        "In this use case, there is already a PAN in the user's home that is managed by Fabric A with TBR1 " +
        "(e.g. as a result of the above sequence diagram applied previously between Admin 1 and TBR1). The " +
        "user wants to use the Thread connectivity provided by the Matter-certified Thread Border Router " +
        "managed by Fabric A with Fabric B to share its connectivity." +
        "\n" +
        "After the installation, the Thread PAN is shared by Fabric A and B." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> NOTE: The user must use the Multiple Fabrics feature process between Fabrics A and B to commission " +
        "the Thread Border Router from Fabric A to Fabric B." +
        "\n" +
        "#### Merging to a new PAN" +
        "\n" +
        "This use case is a specific configuration where the user already has 2 PANs. One is managed by a " +
        "Fabric A through a Matter Thread Border Router (TBR1) and the other is managed by a Fabric B through " +
        "another Matter Thread Border Router (TBR2)." +
        "\n" +
        "The user wishes to merge the existing Thread connectivity provided by the two Matter certified " +
        "Thread Border Routers to share their connectivity to extend the Thread coverage and Internet access " +
        "redundancy of the Thread networks for their Matter devices." +
        "\n" +
        "After installation, the Thread PAN is shared between Fabrics A and B." +
        "\n" +
        "Note 1 : Activation of the pending dataset is Thread stack dependent and propagation of the new " +
        "dataset to all Matter devices may fail, for example if devices are disconnected during the process." +
        "\n" +
        "Note 2 : This configuration should remain very rare if the previous installations followed the " +
        "previous use cases.",

    children: [
        { tag: "requirement", name: "ThreadNetworkDiagnostics", xref: "device§15.4.5" },
        { tag: "requirement", name: "ThreadBorderRouterManagement", xref: "device§15.4.5" },
        { tag: "requirement", name: "ThreadNetworkDirectory", xref: "device§15.4.5" },
        { tag: "requirement", name: "SecondaryNetworkInterface", xref: "device§15.4.4" }
    ]
});
