/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "RootNode", xref: "device§2.1",

    details: "This defines conformance for a root node endpoint (see System Model specification). This endpoint is " +
        "akin to a \"read me first\" endpoint that describes itself and the other endpoints that make up the " +
        "node." +
        "\n" +
        "  - Device types with Endpoint scope shall NOT be supported on the same endpoint as this device " +
        "type." +
        "\n" +
        "  - Clusters with an Application role shall NOT be supported on the same endpoint as this device " +
        "type." +
        "\n" +
        "  - Other device types with Node scope may be supported on the same endpoint as this device type." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> NOTE: The Network Diagnostics clusters present on the Root Node shall serve the primary network " +
        "interface as specified in the Network Commissioning cluster if it exists, or the " +
        "out-of-band-configured networking interfaces." +
        "\n" +
        "### Element Requirements" +
        "\n" +
        "#### Access Control MNGD Conformance" +
        "\n" +
        "The MNGD (Managed Device) feature of the Access Control Cluster on the device's Root Node endpoint " +
        "is restricted to devices that contain an Application Endpoint type that explicitly permits its use, " +
        "such as the Network Infrastructure Manager device type (Device Type ID 0x0090)." +
        "\n" +
        "### Endpoint Composition" +
        "\n" +
        "A Root Node endpoint's Descriptor cluster PartsList attribute shall contain a list of all other " +
        "endpoints on the node, i.e. the full-family pattern defined in the System Model specification.",

    children: [
        {
            tag: "requirement", name: "AccessControl", xref: "device§2.1.5",
            children: [
                { tag: "requirement", name: "MANAGEDDEVICE", xref: "device§2.1.6" },
                { tag: "requirement", name: "AUXILIARY", xref: "device§2.1.6" },
                { tag: "requirement", name: "Extension", xref: "device§2.1.6" }
            ]
        },

        { tag: "requirement", name: "BasicInformation", xref: "device§2.1.5" },
        { tag: "requirement", name: "LocalizationConfiguration", xref: "device§2.1.5" },
        { tag: "requirement", name: "TimeFormatLocalization", xref: "device§2.1.5" },
        { tag: "requirement", name: "UnitLocalization", xref: "device§2.1.5" },
        { tag: "requirement", name: "PowerSourceConfiguration", xref: "device§2.1.5" },
        { tag: "requirement", name: "GeneralCommissioning", xref: "device§2.1.5" },
        { tag: "requirement", name: "NetworkCommissioning", xref: "device§2.1.5" },
        { tag: "requirement", name: "DiagnosticLogs", xref: "device§2.1.5" },
        { tag: "requirement", name: "GeneralDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "SoftwareDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "ThreadNetworkDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "WiFiNetworkDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "EthernetNetworkDiagnostics", xref: "device§2.1.5" },

        {
            tag: "requirement", name: "TimeSynchronization",
            discriminator: "TimeSyncCond, TimeSyncWithClientCond, TimeSyncWithNtpcCond, TimeSyncWithTzCond, TlsClientCond, TlsCertificatesCond, O:serverCluster",
            xref: "device§2.1.5",
            children: [
                { tag: "requirement", name: "TIMESYNCCLIENT", xref: "device§2.1.6" },
                { tag: "requirement", name: "NTPCLIENT", xref: "device§2.1.6" },
                { tag: "requirement", name: "TIMEZONE", xref: "device§2.1.6" }
            ]
        },

        {
            tag: "requirement", name: "TimeSynchronization",
            discriminator: "TimeSyncWithClientCond, O:clientCluster", xref: "device§2.1.5",
            children: [
                { tag: "requirement", name: "TIMESYNCCLIENT", xref: "device§2.1.6" },
                { tag: "requirement", name: "NTPCLIENT", xref: "device§2.1.6" },
                { tag: "requirement", name: "TIMEZONE", xref: "device§2.1.6" }
            ]
        },

        { tag: "requirement", name: "AdministratorCommissioning", xref: "device§2.1.5" },
        { tag: "requirement", name: "OperationalCredentials", xref: "device§2.1.5" },
        {
            tag: "requirement", name: "GroupKeyManagement", xref: "device§2.1.5",
            children: [{ tag: "requirement", name: "GROUPCAST", xref: "device§2.1.6" }]
        },
        {
            tag: "requirement", name: "IcdManagement", xref: "device§2.1.5",
            children: [{ tag: "requirement", name: "LONGIDLETIMESUPPORT", xref: "device§2.1.6" }]
        },

        {
            tag: "requirement", name: "Groupcast", xref: "device§2.1.5",
            children: [
                { tag: "requirement", name: "LISTENER", xref: "device§2.1.6" },
                { tag: "requirement", name: "SENDER", xref: "device§2.1.6" }
            ]
        },

        { tag: "requirement", name: "TlsCertificateManagement", xref: "device§2.1.5" },
        { tag: "requirement", name: "TlsClientManagement", xref: "device§2.1.5" },
        { tag: "requirement", name: "PowerSource", xref: "device§2.1.4" },
        {
            tag: "condition", name: "CustomNetworkConfig",
            description: "The node only supports out-of-band-configured networking (e.g. rich user interface, manufacturer-specific means, custom commissioning flows, or future IP-compliant network technology not yet directly supported by NetworkCommissioning cluster).",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "ManagedAclAllowed",
            description: "The node has at least one endpoint where some Device Type present on the endpoint has a Device Library element requirement table entry that sets this condition to true.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "TimeSyncCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs to use Time Synchronization support.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "TimeSyncWithClientCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs to use Time Synchronization support with Client cluster support, and the TimeSyncClient feature.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "TimeSyncWithNtpcCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs to use Time Synchronization support with the NTPClient feature.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "TimeSyncWithTzCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs to use Time Synchronization support with the TimeZone feature.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "TlsCertificatesCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs to use TLS Certificate Management. Since TLS requires basic Time Sync support, this will include that dependency.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "TlsClientCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs to use TLS Client Management. Since TLS requires basic Time Sync support, this will include that dependency.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "PowerSourceCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs to have Power Source be on the Root Node.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "AclExtensionCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs the Access Control instance to have the Extension attribute.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "GroupcastListenerCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs the Groupcast Server cluster instance with the Listener feature. This condition SHALL be supported if any endpoint implements the Groups cluster server on an endpoint.",
            xref: "device§2.1.3"
        },
        {
            tag: "condition", name: "GroupcastSenderCond",
            description: "The node has at least one endpoint where some Device Type present on the endpoint needs the Groupcast Server cluster instance with the Sender feature. This condition SHALL be supported if any endpoint implements the Bindings cluster server on an endpoint.",
            xref: "device§2.1.3"
        }
    ]
});
