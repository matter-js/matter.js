/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "BridgedDeviceBasicInformation", pics: "BRBINFO", xref: "core§9.13",

    details: "This cluster provides attributes and events for determining basic information about Bridged Nodes." +
        "\n" +
        "This cluster is derived from the Basic Information cluster and serves two purposes towards a Node " +
        "communicating with a Bridge:" +
        "\n" +
        "  • Indicate that the functionality on the Endpoint where it is placed (and its Parts) is bridged, " +
        "    and" +
        "\n" +
        "  • Provide a centralized collection of attributes that the Node may collect to aid in conveying " +
        "    information regarding the Bridged Device to a user, such as the vendor name, the model name, or " +
        "    user-assigned name." +
        "\n" +
        "This cluster shall be exposed by a Bridge on the Endpoint representing each Bridged Device. When the " +
        "functionality of a Bridged Device is represented using a set of Endpoints, this cluster shall only " +
        "be exposed on the Endpoint which is at the top of the hierarchy for the functionality of that " +
        "Bridged Device." +
        "\n" +
        "This cluster shall NOT be used on an endpoint that is not in the Descriptor cluster PartsList of an " +
        "endpoint with an Aggregator device type." +
        "\n" +
        "This cluster has been derived from the Basic Information Cluster, and provides generic information " +
        "about the Bridged Device. Not all of the attributes in the Basic Information Cluster are relevant " +
        "for a Bridged Device (e.g. ProductID since it is not a Matter device). For other attributes, the " +
        "information which is listed as Mandatory for the Basic Information Cluster, may not be available " +
        "when the Bridged Device does not provide it to the Bridge, and the Bridge has no other means to " +
        "determine it. For such cases where the information for a particular attribute is not available, the " +
        "Bridge SHOULD NOT include the attribute in the cluster for this Bridged Device. See below for " +
        "Conformance details.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§9.13.4",
            children: [{ tag: "field", name: "BIS", details: "Support bridged ICDs." }]
        },
        { tag: "attribute", name: "DataModelRevision", xref: "core§9.13.5" },
        { tag: "attribute", name: "VendorName", xref: "core§9.13.5" },
        { tag: "attribute", name: "VendorId", xref: "core§9.13.5" },
        { tag: "attribute", name: "ProductName", xref: "core§9.13.5" },
        { tag: "attribute", name: "ProductId", xref: "core§9.13.5" },
        { tag: "attribute", name: "NodeLabel", xref: "core§9.13.5" },
        { tag: "attribute", name: "Location", xref: "core§9.13.5" },
        { tag: "attribute", name: "HardwareVersion", xref: "core§9.13.5" },
        { tag: "attribute", name: "HardwareVersionString", xref: "core§9.13.5" },
        { tag: "attribute", name: "SoftwareVersion", xref: "core§9.13.5" },
        { tag: "attribute", name: "SoftwareVersionString", xref: "core§9.13.5" },
        { tag: "attribute", name: "ManufacturingDate", xref: "core§9.13.5" },
        { tag: "attribute", name: "PartNumber", xref: "core§9.13.5" },
        { tag: "attribute", name: "ProductUrl", xref: "core§9.13.5" },
        { tag: "attribute", name: "ProductLabel", xref: "core§9.13.5" },
        { tag: "attribute", name: "SerialNumber", xref: "core§9.13.5" },
        { tag: "attribute", name: "LocalConfigDisabled", xref: "core§9.13.5" },

        {
            tag: "attribute", name: "Reachable", xref: "core§9.13.5.2",

            details: "This attribute shall be used to indicate whether the bridged device is reachable by the bridge, so a " +
                "Matter Node which wants to communicate with a bridged device can get an indication that this might " +
                "fail (when the attribute is False). Determination of reachability might not be perfect (e.g. " +
                "depending on technology employed), so the Matter Node SHOULD be aware of the risk of false positives " +
                "and negatives on reachability determination. For example, a bridged device may be marked as " +
                "unreachable while it could actually be reached, and vice-versa. Also, detection (and indication) " +
                "that a bridged device is not longer reachable may be delayed due to the technique employed (e.g. " +
                "detecting that a number of expected messages from the bridged device did not arrive). Also see event " +
                "ReachableChanged below."
        },

        {
            tag: "attribute", name: "UniqueId", xref: "core§9.13.5.3",

            details: "This attribute shall, for a Bridged Device, be updated when the Bridge is factory reset. If the " +
                "bridged device does not provide some unique id (e.g. in the case of bridging from non-Matter " +
                "devices, or in case of bridging Matter devices from an earlier revision which were not required to " +
                "provide a UniqueID attribute), the bridge shall generate a unique id on behalf of the bridged " +
                "device." +
                "\n" +
                "NOTE The UniqueID attribute was optional in cluster revisions prior to revision 4."
        },

        { tag: "attribute", name: "CapabilityMinima", xref: "core§9.13.5" },
        { tag: "attribute", name: "ProductAppearance", xref: "core§9.13.5" },
        { tag: "attribute", name: "SpecificationVersion", xref: "core§9.13.5" },
        { tag: "attribute", name: "MaxPathsPerInvoke", xref: "core§9.13.5" },

        {
            tag: "attribute", name: "ConfigurationVersion", xref: "core§9.13.5.4",

            details: "This attribute shall contain the current version number for the configuration of the bridged device." +
                "\n" +
                "If the bridge detects a change on a bridged device, which it deems as a change in the configuration " +
                "of the bridged device, it shall increase this attribute as described in Section 9.2.9, “Node " +
                "Configuration Changes”." +
                "\n" +
                "The ability and the method used to detect such a change on a bridged device is manufacturer " +
                "specific."
        },

        { tag: "event", name: "StartUp", xref: "core§9.13.7" },
        { tag: "event", name: "ShutDown", xref: "core§9.13.7" },

        {
            tag: "event", name: "Leave", xref: "core§9.13.7.1",

            details: "The Leave event SHOULD be generated by the bridge when it detects that the associated device has " +
                "left the non-Matter network." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> The FabricIndex field has the X conformance, indicating it shall NOT be present. This event, in " +
                "  the context of Bridged Device Basic Information cluster, has no usable fields, but the original " +
                "  Basic Information cluster’s field definition is kept for completeness."
        },

        {
            tag: "event", name: "ReachableChanged", xref: "core§9.13.7.2",
            details: "This event shall be generated when there is a change in the Reachable attribute. Its purpose is to " +
                "provide an indication towards interested parties that the reachability of a bridged device has " +
                "changed over its native connectivity technology, so they may take appropriate action." +
                "\n" +
                "After (re)start of a bridge this event may be generated."
        },

        {
            tag: "event", name: "ActiveChanged", xref: "core§9.13.7.3",
            details: "This event (when supported) shall be generated the next time a bridged device becomes active after a " +
                "KeepActive command is received." +
                "\n" +
                "See KeepActive for more details.",

            children: [{
                tag: "field", name: "PromisedActiveDuration", xref: "core§9.13.7.3.1",

                details: "This field shall indicate the minimum duration, in milliseconds, that the bridged device will remain " +
                    "active after receiving the initial request from the KeepActive processing steps." +
                    "\n" +
                    "If the bridged device is a Matter Intermittently Connected Device, PromisedActiveDuration shall be " +
                    "set to the PromisedActiveDuration value returned in the StayActiveResponse command." +
                    "\n" +
                    "If the bridged device is not a Matter Intermittently Connected Device, the implementation of this is " +
                    "best-effort since it may interact with non-native protocol."
            }]
        },

        {
            tag: "command", name: "KeepActive", xref: "core§9.13.6.1",

            details: "Upon receipt, the server shall attempt to keep the bridged device active for the duration specified " +
                "by the command, when the device is next active." +
                "\n" +
                "The implementation of this is best-effort since it may interact with non-native protocols. However, " +
                "several specific protocol requirements are:" +
                "\n" +
                "  • If the bridged device is a Matter Intermittently Connected Device, then the server shall send a " +
                "    StayActiveRequest command with the StayActiveDuration field set to value of the " +
                "    StayActiveDuration field in the received command to the bridged device when the bridged device " +
                "    next sends a checks-in message or subscription report. See Intermittently Connected Devices " +
                "    Behavior for details on ICD state management." +
                "\n" +
                "When the bridge detects that the bridged device goes into an active state, an ActiveChanged event " +
                "shall be generated." +
                "\n" +
                "In order to avoid unnecessary power consumption in the bridged device:" +
                "\n" +
                "  • The server shall enter a \"pending active\" state for the associated device when the KeepActive " +
                "    command is received. The server \"pending active\" state shall expire after the amount of time " +
                "    defined by the TimeoutMs field, in milliseconds, if no subsequent KeepActive command is " +
                "    received. When a KeepActive command is received, the \"pending active\" state is set, the " +
                "    StayActiveDuration is updated to the greater of the new value and the previously stored value, " +
                "    and the TimeoutMs is updated to the greater of the new value and the remaining time until the " +
                "    prior \"pending active\" state expires." +
                "\n" +
                "  • The server shall only keep the bridged device active once for a request. (The server shall only " +
                "    consider the operation performed if an associated ActiveChanged event was generated.)",

            children: [
                {
                    tag: "field", name: "StayActiveDuration", xref: "core§9.13.6.1.1",

                    details: "This field shall indicate the duration, in milliseconds, that the device is requested to remain " +
                        "active, once the device becomes active again." +
                        "\n" +
                        "The value of this field may be longer than the value supported by the bridged device and would, " +
                        "typically, be used by the client to request the server of the bridged device to stay active and " +
                        "responsive for this period to allow a sequence of message exchanges during that period." +
                        "\n" +
                        "The client may slightly overestimate the duration it wants the bridged device to be active for, in " +
                        "order to account for network delays."
                },

                {
                    tag: "field", name: "TimeoutMs", xref: "core§9.13.6.1.2",

                    details: "This field shall indicate the period, in milliseconds, that the server will wait before the \"pending " +
                        "active\" state expires. See the KeepActive Command description for details." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> TimeoutMs is a timeout for the request, NOT the time the device will be awake for. The server will " +
                        "  wait for up to TimeoutMs for the device. If after TimeoutMs the ICD device does NOT check-in, the " +
                        "  server will not perform any actions."
                }
            ]
        }
    ]
});
