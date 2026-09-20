/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Base", xref: "device§1.1",

    details: "### Overview" +
        "\n" +
        "This defines common conformance for all device types depending on, but not limited to:" +
        "\n" +
        "  - Underlying protocol stack (e.g. 802.15.4, Wi-Fi, Thread, Zigbee PRO, IPv6, TCP/IP)" +
        "\n" +
        "  - Regional regulations" +
        "\n" +
        "  - Interfaces (UI, cloud, etc.)" +
        "\n" +
        "  - Scale (e.g. residential vs commercial)" +
        "\n" +
        "  - Other common limitations or capabilities (e.g. battery powered or sleepy nodes)." +
        "\n" +
        "  - etc." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "This conformance table shall assume the Matter conformance condition is TRUE (in Conformance " +
        "column).",

    children: [
        {
            tag: "condition", name: "Ethernet", description: "The node supports an Ethernet LAN interface",
            xref: "device§1.1.3.1"
        },
        { tag: "condition", name: "WiFi", description: "The node supports a Wi-Fi interface", xref: "device§1.1.3.1" },
        {
            tag: "condition", name: "Thread", description: "The node supports a Thread interface",
            xref: "device§1.1.3.1"
        },
        { tag: "condition", name: "Ip", description: "The node supports an IP interface", xref: "device§1.1.3.1" },
        {
            tag: "condition", name: "Tcp", description: "The node supports TCP on each IP interface",
            xref: "device§1.1.3.1"
        },
        {
            tag: "condition", name: "Udp", description: "The node supports UDP on each IP interface",
            xref: "device§1.1.3.1"
        },
        {
            tag: "condition", name: "IPv4", description: "The node supports IPv4 on each IP interface",
            xref: "device§1.1.3.1"
        },
        {
            tag: "condition", name: "IPv6", description: "The node supports IPv6 on each IP interface",
            xref: "device§1.1.3.1"
        },
        {
            tag: "condition", name: "LanguageLocale",
            description: "The node supports localization for conveying text to the user",
            xref: "device§1.1.3.2"
        },
        {
            tag: "condition", name: "TimeLocale",
            description: "The node supports localization for conveying time to the user",
            xref: "device§1.1.3.2"
        },
        {
            tag: "condition", name: "UnitLocale",
            description: "The node supports localization for conveying units of measure to the user",
            xref: "device§1.1.3.2"
        },
        {
            tag: "condition", name: "Sit",
            description: "The node is a short idle time intermittently connected device", xref: "device§1.1.4"
        },
        {
            tag: "condition", name: "Lit",
            description: "The node is a long idle time intermittently connected device", xref: "device§1.1.4"
        },
        {
            tag: "condition", name: "Active", description: "The node is always able to communicate",
            xref: "device§1.1.4"
        },
        {
            tag: "condition", name: "Node",
            description: "the device type is classified as a Node device type (see Data Model specification)",
            xref: "device§1.1.5"
        },
        {
            tag: "condition", name: "App",
            description: "the device type is classified as an Application device type (see Data Model specification)",
            xref: "device§1.1.5"
        },
        {
            tag: "condition", name: "Simple",
            description: "the device type is classified as a Simple device type (see Data Model specification)",
            xref: "device§1.1.5"
        },
        {
            tag: "condition", name: "Dynamic",
            description: "the device type is classified as a Dynamic device type (see Data Model specification)",
            xref: "device§1.1.5"
        },
        {
            tag: "condition", name: "Composed",
            description: "the device type is composed of 2 or more device types (see System Model specification)",
            xref: "device§1.1.5"
        },
        {
            tag: "condition", name: "Client",
            description: "there exists a client application cluster on the endpoint", xref: "device§1.1.6"
        },
        {
            tag: "condition", name: "Server",
            description: "there exists a server application cluster on the endpoint", xref: "device§1.1.6"
        },

        {
            tag: "condition", name: "Duplicate",
            description: "the endpoint and at least one of its siblings have overlap in application device type(s)",
            xref: "device§1.1.6.1",
            details: "The endpoint and at least one of its sibling endpoints have an overlap in application device " +
                "type(s), as defined in the \"Disambiguation\" section in the System Model specification. This " +
                "condition triggers requirements for providing additional information about the endpoints in order to " +
                "disambiguate between the endpoints (see \"Disambiguation\" section in the System Model specification)."
        },

        {
            tag: "condition", name: "BridgedPowerSourceInfo",
            description: "the endpoint represents a Bridged Device, for which information about the state of its power source is available to the Bridge",
            xref: "device§1.1.6"
        },
        {
            tag: "requirement", name: "Descriptor", xref: "device§1.1.7",
            children: [{ tag: "requirement", name: "TAGLIST", xref: "device§1.1.8" }]
        },
        { tag: "requirement", name: "Binding", xref: "device§1.1.7" },
        { tag: "requirement", name: "FixedLabel", xref: "device§1.1.7" },
        { tag: "requirement", name: "UserLabel", xref: "device§1.1.7" }
    ]
});
