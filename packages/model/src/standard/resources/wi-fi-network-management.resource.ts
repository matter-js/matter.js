/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "WiFiNetworkManagement", pics: "WIFINM", xref: "cluster§10.2",
    details: "This cluster provides an interface for getting information about the Wi-Fi network that a Network " +
        "Infrastructure Manager device type provides. Privileged nodes within the same fabric as a Network " +
        "Infrastructure Manager can use these interfaces to request information related to the Wi-Fi Network " +
        "such as SSID and Passphrase.",

    children: [
        {
            tag: "attribute", name: "Ssid", xref: "cluster§10.2.4.1",

            details: "Indicates the SSID of the primary Wi-Fi network provided by this device." +
                "\n" +
                "A value of null shall indicate that no primary Wi-Fi network is available (e.g. because the Wi-Fi " +
                "network has not yet been configured by the user)." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> The SSID in Wi-Fi is a collection of 1-32 bytes, the text encoding of which is not specified. " +
                "  Implementations must be careful to support transferring these byte strings without requiring a " +
                "  particular encoding. The most common encoding is UTF-8, however this is just a convention. Some " +
                "  configurations may use Latin-1 or other character sets."
        },

        {
            tag: "attribute", name: "PassphraseSurrogate", xref: "cluster§10.2.4.2",

            details: "This attribute shall contain an arbitrary numeric value; this value shall increase whenever the " +
                "passphrase or PSK associated with the primary Wi-Fi network provided by this device changes." +
                "\n" +
                "A value of null shall indicate that no primary Wi-Fi network is available." +
                "\n" +
                "Clients can subscribe to this attribute or compare its value to a locally cached copy to detect if a " +
                "cached passphrase value has become stale." +
                "\n" +
                "It is recommended that servers implement this attribute as either a timestamp or a counter. When " +
                "implemented as a counter it SHOULD be initialized with a random value." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> The passphrase itself is not exposed as an attribute to avoid its unintentional retrieval or " +
                "  caching by clients that use wildcard reads or otherwise routinely read all available attributes. " +
                "  It can be retrieved using the NetworkPassphraseRequest command."
        },

        {
            tag: "command", name: "NetworkPassphraseRequest", xref: "cluster§10.2.5.1",

            details: "This command is used to request the current WPA-Personal passphrase or PSK associated with the Wi-Fi " +
                "network provided by this device." +
                "\n" +
                "If the command is not executed via a CASE session, the command shall be rejected with a status of " +
                "UNSUPPORTED_ACCESS." +
                "\n" +
                "If no primary Wi-Fi network is available (the SSID attribute is null), the command shall be rejected " +
                "with a status of INVALID_IN_STATE." +
                "\n" +
                "Otherwise a NetworkPassphraseResponse shall be generated."
        },

        {
            tag: "command", name: "NetworkPassphraseResponse", xref: "cluster§10.2.5.2",
            details: "This command shall be generated in response to a NetworkPassphraseRequest command.",

            children: [{
                tag: "field", name: "Passphrase", xref: "cluster§10.2.5.2.1",

                details: "This field shall indicate the current WPA-Personal passphrase or PSK associated with the primary " +
                    "Wi-Fi network provided by this device, in one of the following formats:" +
                    "\n" +
                    "  • 8..63 bytes: WPA/WPA2/WPA3 passphrase." +
                    "\n" +
                    "  • 64 bytes: WPA/WPA2/WPA3 raw hex PSK. Each byte shall be a ASCII hexadecimal digit." +
                    "\n" +
                    "This matches the formats defined for WPA networks by the Credentials field in the Network " +
                    "Commissioning cluster (see [MatterCore])." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> WPA3-Personal permits passphrases shorter than 8 or longer than 63 characters, however the Network " +
                    "  Commissioning cluster does not currently support configuring Matter devices to connect to " +
                    "  operational networks utilizing such a passphrase."
            }]
        }
    ]
});
