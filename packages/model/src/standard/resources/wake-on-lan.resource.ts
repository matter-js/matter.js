/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "WakeOnLan", pics: "WAKEONLAN", xref: "cluster§1.12",

    details: "This cluster provides an interface for managing low power mode on a device that supports the Wake On " +
        "LAN or Wake On Wireless LAN (WLAN) protocol (see [Wake On LAN])." +
        "\n" +
        "This cluster would be supported on IP devices that have a low power mode AND support the ability to " +
        "be woken up using the Wake on LAN or Wake on WLAN protocol. This cluster provides the device MAC " +
        "address which is a required input to the Wake on LAN protocol. Besides the MAC address, this cluster " +
        "provides an optional link-local IPv6 address which is useful to support \"Wake on Direct Packet\" used " +
        "by some Ethernet and Wi-Fi devices." +
        "\n" +
        "Acting on the MAC address or link-local IPv6 address information does require the caller to be in " +
        "the same broadcast domain as the destination. To wake the destination up, the caller sends a " +
        "multicast-based magic UDP packet that contains destination’s MAC address in the UDP payload to " +
        "FF02::1, the IPv6 all-nodes link-local multicast group address. If the optional link-local address " +
        "is provided by the destination through this cluster, the caller also sends the magic UDP packet in " +
        "unicast to that link-local address. This unicast-based method is particularly useful for Wi-Fi " +
        "devices, since due to lack of MAC layer retransmission mechanism, multicast over Wi-Fi is not as " +
        "reliable as unicast. If a device provides the link-local address in this cluster, its Ethernet " +
        "controller or Wi-Fi radio shall respond to the IPv6 neighbor solicitation message for the link-local " +
        "address without the need to wake host CPU up. In order to receive the magic or neighbor solicitation " +
        "packets in multicast, the Wi-Fi devices must support Group Temporal Key (GTK) rekey operation in low " +
        "power mode." +
        "\n" +
        "Most devices automatically enter low power mode based upon inactivity." +
        "\n" +
        "The cluster server for Wake on LAN or Wake on WLAN is implemented by a device that supports the Wake " +
        "on LAN/WLAN protocol, such as a TV, Set-top Box, or Smart Speaker.",

    children: [
        {
            tag: "attribute", name: "MacAddress", xref: "cluster§1.12.4.1",
            details: "Indicates the current MAC address of the device. Only 48-bit MAC Addresses shall be used for this " +
                "attribute as required by the Wake on LAN protocol." +
                "\n" +
                "Format of this attribute shall be an upper-case hex-encoded string representing the hex address, " +
                "like 12345678ABCD."
        },

        {
            tag: "attribute", name: "LinkLocalAddress", xref: "cluster§1.12.4.2",

            details: "Indicates the current link-local address of the device. Only 128-bit IPv6 link-local addresses shall " +
                "be used for this attribute." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> Some companies may consider MAC Address to be protected data subject to PII handling " +
                "  considerations and will therefore choose not to include it or read it. The MAC Address can often " +
                "  be determined using ARP in IPv4 or NDP in IPv6."
        }
    ]
});
