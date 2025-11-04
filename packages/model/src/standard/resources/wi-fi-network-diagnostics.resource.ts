/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "WiFiNetworkDiagnostics", pics: "DGWIFI", xref: "core§11.15",
    details: "The Wi-Fi Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics " +
        "that may be used by a Node to assist a user or Administrator in diagnosing potential problems. The " +
        "Wi-Fi Network Diagnostics Cluster attempts to centralize all metrics that are relevant to a " +
        "potential Wi-Fi radio running on a Node.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.15.4",

            children: [
                {
                    tag: "field", name: "PKTCNT",
                    details: "Node makes available the counts for the number of received and transmitted packets on the Wi-Fi " +
                        "interface."
                },
                {
                    tag: "field", name: "ERRCNT",
                    details: "Node makes available the counts for the number of errors that have occurred during the reception and " +
                        "transmission of packets on the Wi-Fi interface."
                }
            ]
        },

        {
            tag: "attribute", name: "Bssid", xref: "core§11.15.6.1",
            details: "Indicates the BSSID for which the Wi-Fi network the Node is currently connected."
        },
        {
            tag: "attribute", name: "SecurityType", xref: "core§11.15.6.2",
            details: "Indicates the current type of Wi-Fi security used."
        },
        {
            tag: "attribute", name: "WiFiVersion", xref: "core§11.15.6.3",
            details: "Indicates the current IEEE 802.11 standard version in use by the Node, per the table below."
        },
        {
            tag: "attribute", name: "ChannelNumber", xref: "core§11.15.6.4",
            details: "Indicates the channel that Wi-Fi communication is currently operating on."
        },
        {
            tag: "attribute", name: "Rssi", xref: "core§11.15.6.5",
            details: "Indicates the current RSSI of the Node’s Wi-Fi radio in dBm."
        },
        {
            tag: "attribute", name: "BeaconLostCount", xref: "core§11.15.6.6",
            details: "Indicates the count of the number of missed beacons the Node has detected. If the Node does not have " +
                "an ability to count beacons expected and not received, this value may remain set to zero."
        },

        {
            tag: "attribute", name: "BeaconRxCount", xref: "core§11.15.6.7",
            details: "Indicates the count of the number of received beacons. The total number of expected beacons that " +
                "could have been received during the interval since association SHOULD match the sum of BeaconRxCount " +
                "and BeaconLostCount. If the Node does not have an ability to report count of beacons received, this " +
                "value may remain set to zero."
        },

        {
            tag: "attribute", name: "PacketMulticastRxCount", xref: "core§11.15.6.8",
            details: "Indicates the number of multicast packets received by the Node."
        },
        {
            tag: "attribute", name: "PacketMulticastTxCount", xref: "core§11.15.6.9",
            details: "Indicates the number of multicast packets transmitted by the Node."
        },
        {
            tag: "attribute", name: "PacketUnicastRxCount", xref: "core§11.15.6.10",
            details: "Indicates the number of unicast packets received by the Node."
        },
        {
            tag: "attribute", name: "PacketUnicastTxCount", xref: "core§11.15.6.11",
            details: "Indicates the number of unicast packets transmitted by the Node."
        },
        {
            tag: "attribute", name: "CurrentMaxRate", xref: "core§11.15.6.12",
            details: "Indicates the current maximum PHY rate of transfer of data in bits-per-second."
        },

        {
            tag: "attribute", name: "OverrunCount", xref: "core§11.15.6.13",
            details: "Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to " +
                "retain all packets on the network interface. The attribute shall be reset to 0 upon a reboot of the " +
                "Node."
        },

        {
            tag: "event", name: "Disconnection", xref: "core§11.15.8.1",
            details: "The Disconnection Event shall indicate that a Node’s Wi-Fi connection has been disconnected as a " +
                "result of de-authenticated or dis-association and indicates the reason.",

            children: [{
                tag: "field", name: "ReasonCode", xref: "core§11.15.8.1.1",
                details: "This field shall contain the Reason Code field value for the Disassociation or Deauthentication " +
                    "event that caused the disconnection and the value shall align with Table 9-49 \"Reason codes\" of IEEE " +
                    "802.11-2020."
            }]
        },

        {
            tag: "event", name: "AssociationFailure", xref: "core§11.15.8.2",
            details: "The AssociationFailure event shall indicate that a Node has attempted to connect, or reconnect, to a " +
                "Wi-Fi access point, but is unable to successfully associate or authenticate, after exhausting all " +
                "internal retries of its supplicant.",

            children: [
                {
                    tag: "field", name: "AssociationFailureCause", xref: "core§11.15.8.2.1",
                    details: "The Status field shall be set to a value from the AssociationFailureCauseEnum."
                },

                {
                    tag: "field", name: "Status", xref: "core§11.15.8.2.2",

                    details: "The Status field shall be set to the Status Code value that was present in the last frame related to " +
                        "association where Status Code was not equal to zero and which caused the failure of a last trial " +
                        "attempt, if this last failure was due to one of the following Management frames:" +
                        "\n" +
                        "  • Association Response (Type 0, Subtype 1)" +
                        "\n" +
                        "  • Reassociation Response (Type 0, Subtype 3)" +
                        "\n" +
                        "  • Authentication (Type 0, Subtype 11)" +
                        "\n" +
                        "Table 9-50 \"Status codes\" of IEEE 802.11-2020 contains a description of all values possible."
                }
            ]
        },

        {
            tag: "event", name: "ConnectionStatus", xref: "core§11.15.8.3",
            details: "The ConnectionStatus Event shall indicate that a Node’s connection status to a Wi-Fi network has " +
                "changed. Connected, in this context, shall mean that a Node acting as a Wi-Fi station is " +
                "successfully associated to a Wi-Fi Access Point."
        },

        {
            tag: "command", name: "ResetCounts", xref: "core§11.15.7.1",

            details: "This command is used to reset the count attributes." +
                "\n" +
                "Reception of this command shall reset the following attributes to 0:" +
                "\n" +
                "  • BeaconLostCount" +
                "\n" +
                "  • BeaconRxCount" +
                "\n" +
                "  • PacketMulticastRxCount" +
                "\n" +
                "  • PacketMulticastTxCount" +
                "\n" +
                "  • PacketUnicastRxCount" +
                "\n" +
                "  • PacketUnicastTxCount"
        },

        {
            tag: "datatype", name: "SecurityTypeEnum", xref: "core§11.15.5.1",

            children: [
                {
                    tag: "field", name: "Unspecified",
                    description: "Indicate the usage of an unspecified Wi-Fi security type"
                },
                { tag: "field", name: "None", description: "Indicate the usage of no Wi-Fi security" },
                { tag: "field", name: "Wep", description: "Indicate the usage of WEP Wi-Fi security" },
                { tag: "field", name: "Wpa", description: "Indicate the usage of WPA Wi-Fi security" },
                { tag: "field", name: "Wpa2", description: "Indicate the usage of WPA2 Wi-Fi security" },
                { tag: "field", name: "Wpa3", description: "Indicate the usage of WPA3 Wi-Fi security" }
            ]
        },

        {
            tag: "datatype", name: "WiFiVersionEnum", xref: "core§11.15.5.2",

            children: [
                {
                    tag: "field", name: "Ac",
                    description: "Indicate the network interface is currently using IEEE 802.11ac against the wireless access point."
                },
                {
                    tag: "field", name: "Ax",
                    description: "Indicate the network interface is currently using IEEE 802.11ax against the wireless access point."
                },
                {
                    tag: "field", name: "Ah",
                    description: "Indicate the network interface is currently using IEEE 802.11ah against the wireless access point."
                }
            ]
        },

        {
            tag: "datatype", name: "AssociationFailureCauseEnum", xref: "core§11.15.5.3",

            children: [
                { tag: "field", name: "Unknown", description: "The reason for the failure is unknown." },
                { tag: "field", name: "AssociationFailed", description: "An error occurred during association." },
                { tag: "field", name: "AuthenticationFailed", description: "An error occurred during authentication." },
                { tag: "field", name: "SsidNotFound", description: "The specified SSID could not be found." }
            ]
        },

        {
            tag: "datatype", name: "ConnectionStatusEnum", xref: "core§11.15.5.4",
            children: [
                { tag: "field", name: "Connected", description: "Indicate the node is connected" },
                { tag: "field", name: "NotConnected", description: "Indicate the node is not connected" }
            ]
        }
    ]
});
