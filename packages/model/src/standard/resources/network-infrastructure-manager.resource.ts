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
        "described in MatterCore." +
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
        "Section 15.3.4.1, \"ManagedAclAllowed Condition\"). Consequently, Commissioners of this device type " +
        "should be aware of this feature and its use." +
        "\n" +
        "### Other Requirements" +
        "\n" +
        "The Network Infrastructure Manager shall implement a bridged Wi-Fi / Ethernet hub network, enabling " +
        "IPv6 connectivity between Matter Nodes across transports." +
        "\n" +
        "The Network Infrastructure Manager shall support IP communication with at least 300 Matter devices " +
        "on this network. If the Network Infrastructure Manager operates a DHCPv4 server, then it SHOULD be " +
        "configured by default with a subnet mask and DHCP pool size that allow for at least 300 devices." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> NOTE: This recommendation is meant to avoid IPv4 address exhaustion if a large number of devices " +
        "request IPv4 addresses e.g. for non-Matter traffic." +
        "\n" +
        "#### Ethernet Requirements" +
        "\n" +
        "The device shall provide an Ethernet LAN interface that is part of the bridged hub network." +
        "\n" +
        "The Root Node endpoint of the device may include a Network Commissioning cluster associated with " +
        "this Ethernet interface." +
        "\n" +
        "#### Wi-Fi Requirements" +
        "\n" +
        "The device shall support the operation of an IEEE 802.11 Wi-Fi network (ESS) and provide access to " +
        "the SSID and credentials of this network via the Wi-Fi Network Management cluster. The mechanisms by " +
        "which this network is configured are outside the scope of this specification. The device shall " +
        "support concurrently operating BSSs for this ESS in the 2.4 GHz and 5 GHz frequency bands; it may " +
        "support operating additional BSSs for this ESS in other frequency bands such as 6 GHz or sub-1 GHz. " +
        "All BSSs in this ESS shall be part of the bridged hub network, i.e. bridged to each other and to the " +
        "Ethernet interface." +
        "\n" +
        "The device may support operating additional Wi-Fi networks (e.g. a \"guest network\"); the " +
        "requirements above do not apply to any such additional networks." +
        "\n" +
        "The device SHOULD NOT include any Network Commissioning cluster instances associated with the Wi-Fi " +
        "Access Point interface." +
        "\n" +
        "The device shall be certified by the Wi-Fi Alliance in the Access Point role for Wi-Fi 6 or above. " +
        "It shall additionally be certified in the Access Point role for Wi-Fi 6E if it supports operating in " +
        "the 6 GHz band, and for Wi-Fi HaLow if it supports operating in the sub-1 GHz band." +
        "\n" +
        "To support the efficient operation of the network generally, and for low-power stations in " +
        "particular, the Network Infrastructure Manager shall support, and upon (or before) Matter " +
        "commissioning shall enable, the following Wi-Fi features:" +
        "\n" +
        "  - Extended Sleep Time with a sleep time support up to at least 60 minutes, which includes the " +
        "following IEEE 802.11 features:" +
        "\n" +
        "  - Basic Service Set (BSS) Max Idle Period" +
        "\n" +
        "  - dot11BSSMaxIdlePeriodIndicationByNonAPSTA" +
        "\n" +
        "  - IPv6 Proxy Neighbor Discovery Protocol (NDP) including IPv6 duplicate address detection" +
        "\n" +
        "  - IPv4 Proxy Address Resolution Protocol (ARP)" +
        "\n" +
        "  - 802.11 WNM Sleep Mode with GTK/IGTK/BIGTK update support" +
        "\n" +
        "The device shall support at least 100 simultaneous Wi-Fi associations - irrespective of the " +
        "distribution of the Matter Wi-Fi devices over the supported bands; all Matter Wi-Fi devices could be " +
        "on the same band. This includes associations of low-power Matter Wi-Fi devices that are asleep for a " +
        "long time." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> NOTE: For the case of in-field upgrades of pre-Matter Wi-Fi access points, an exemption " +
        "(simultaneous association requirement reduced to 64) can be requested when applying for Matter " +
        "certification, e.g. in case of Wi-Fi chipset limitations (see the Alliance Certification Policy)." +
        "\n" +
        "#### Thread Requirements" +
        "\n" +
        "The Network Infrastructure Manager device shall be certified by the Thread Group as Built on Thread: " +
        "Border Router based on Thread 1.4.0 or above." +
        "\n" +
        "The device shall implement a Thread Border Router as described by the Thread specification, and " +
        "provide connectivity between the Thread network and the Wi-Fi / Ethernet hub network. The Thread " +
        "Interface associated with the Border Router shall be exposed via the Thread Border Router Management " +
        "cluster." +
        "\n" +
        "The Thread Network Diagnostics cluster included on the endpoint shall be the instance corresponding " +
        "to the Thread Interface associated with the Border Router functionality." +
        "\n" +
        "The device SHOULD NOT include any Network Commissioning cluster instances associated with the Thread " +
        "Border Router." +
        "\n" +
        "The Network Infrastructure Manager device shall support working as a Thread Parent for a minimum of " +
        "64 Thread Children simultaneously in any combination of Children End Device types. The Network " +
        "Infrastructure Manager device shall support operating as a Thread Border Router in any Thread " +
        "Network with up to 150 Thread nodes." +
        "\n" +
        "#### Discovery and Commissioning" +
        "\n" +
        "A Network Infrastructure Manager device SHOULD implement Extended Discovery in order to be " +
        "discoverable by entities on the local IP network, even when not in Commissioning Mode, and SHOULD " +
        "populate the optional device type subtype (e.g., _T144) to allow for filtering of discovery results " +
        "to find only Nodes that match the Network Infrastructure Manager device type (see Commissioning " +
        "Subtypes)." +
        "\n" +
        "A Network Infrastructure Manager SHOULD populate the following DNS-SD TXT record key/value pairs in " +
        "the Commissionable Node Discovery response: Commissioning Pairing Hint, and Commissioning Pairing " +
        "Instruction so that the Commissioner can guide the user through the steps needed to put the " +
        "Commissionee into Commissioning Mode. If the Network Infrastructure Manager provides its own app or " +
        "website which includes a UX for putting the device into Commissioning Mode, then the device SHOULD " +
        "populate the Commissioning VID/PID key/value pair and SHOULD set bit 1 of the Pairing Hint (Device " +
        "Manufacturer URL), so that the Commissioner can utilize the URL specified in the " +
        "CommissioningCustomFlowUrl of the DeviceModel schema entry indexed by the Vendor ID and Product ID " +
        "in the Distributed Compliance Ledger and utilize flows described in Custom Commissioning Flow to " +
        "redirect the user to a custom app or website specified by the device vendor, and receive the user " +
        "back following the callback flow which contains the onboarding payload. This flow is described in " +
        "detail in the Initiating Commissioning section of the Matter Core specification, under the User " +
        "Journey titled User-Initiated Beacon Detection, Already Commissioned Device.",

    children: [
        {
            tag: "requirement", name: "ManagedAclAllowed", xref: "device§15.3.4.1",

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

        { tag: "requirement", name: "Ip", xref: "device§15.3.4" },
        { tag: "requirement", name: "IPv4", xref: "device§15.3.4" },
        { tag: "requirement", name: "IPv6", xref: "device§15.3.4" },
        { tag: "requirement", name: "Ethernet", xref: "device§15.3.4" },
        { tag: "requirement", name: "WiFi", xref: "device§15.3.4" },
        { tag: "requirement", name: "Thread", xref: "device§15.3.4" },
        { tag: "requirement", name: "ThreadNetworkDiagnostics", xref: "device§15.3.5" },
        { tag: "requirement", name: "WiFiNetworkManagement", xref: "device§15.3.5" },
        { tag: "requirement", name: "ThreadBorderRouterManagement", xref: "device§15.3.5" },
        { tag: "requirement", name: "ThreadNetworkDirectory", xref: "device§15.3.5" }
    ]
});
