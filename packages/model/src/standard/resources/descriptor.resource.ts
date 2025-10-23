/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "Descriptor", classification: "endpoint", pics: "DESC", xref: "core§9.5",

    details: "> [!NOTE]" +
        "\n" +
        "> The Descriptor cluster is meant to replace the support from the Zigbee Device Object (ZDO) for " +
        "  describing a node, its endpoints and clusters." +
        "\n" +
        "This cluster describes an endpoint instance on the node, independently from other endpoints, but " +
        "also allows composition of endpoints to conform to complex device type patterns." +
        "\n" +
        "This cluster supports a list of one or more device type identifiers that represent conformance to " +
        "device type specifications." +
        "\n" +
        "The cluster supports a PartsList attribute that is a list of zero or more endpoints to support " +
        "compound devices or composed device types.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§9.5.4",
            children: [{
                tag: "field", name: "TAGLIST", xref: "core§9.5.4.1",
                details: "See the Disambiguation section in the System Model spec for conformance requirements for this " +
                    "feature and the corresponding attribute."
            }]
        },

        {
            tag: "attribute", name: "DeviceTypeList", xref: "core§9.5.6.1",

            details: "This is a list of device types and corresponding revisions declaring endpoint conformance (see " +
                "Section 9.5.5.1, “DeviceTypeStruct Type”). At least one device type entry shall be present." +
                "\n" +
                "An endpoint shall conform to all device types listed in the DeviceTypeList. A cluster instance that " +
                "is in common for more than one device type in the DeviceTypeList shall be supported as a shared " +
                "cluster instance on the endpoint."
        },

        {
            tag: "attribute", name: "ServerList", xref: "core§9.5.6.2",
            details: "This attribute shall list each cluster ID for the server clusters present on the endpoint instance."
        },
        {
            tag: "attribute", name: "ClientList", xref: "core§9.5.6.3",
            details: "This attribute shall list each cluster ID for the client clusters present on the endpoint instance."
        },

        {
            tag: "attribute", name: "PartsList", xref: "core§9.5.6.4",
            details: "This attribute indicates composition of the device type instance. Device type instance composition " +
                "shall include the endpoints in this list." +
                "\n" +
                "See Endpoint Composition for more information about which endpoints to include in this list."
        },

        {
            tag: "attribute", name: "TagList", xref: "core§9.5.6.5",

            details: "This attribute shall be used to disambiguate sibling endpoints in certain situations, as defined in " +
                "the Disambiguation section in the System Model specification. An example of such a situation might " +
                "be a device with two buttons, with this attribute being used to indicate which of the two endpoints " +
                "corresponds to the button on the left side." +
                "\n" +
                "It may also be used to provide information about an endpoint (e.g. the relative location of a " +
                "Temperature sensor in a Temperature Controlled Cabinet)." +
                "\n" +
                "  • A client SHOULD use these tags to convey disambiguation information and other relevant " +
                "    information to the user (e.g. showing it in a user interface), as appropriate." +
                "\n" +
                "  • A client SHOULD use these tags in its logic to make decisions, as appropriate." +
                "\n" +
                "For example, a client may identify which endpoint maps to a certain function, orientation or " +
                "labeling." +
                "\n" +
                "A client may use the Label field of each SemanticTagStruct, if present in each structure, to " +
                "indicate characteristics of an endpoint, or to augment what is provided in the TagID field of the " +
                "same structure."
        },

        {
            tag: "attribute", name: "EndpointUniqueId", xref: "core§9.5.6.6",

            details: "Indicates an identifier which allows to uniquely identify the functionality exposed on an endpoint, " +
                "and therefore shall be unique within the device. It is constructed in a manufacturer specific " +
                "manner." +
                "\n" +
                "  • If a globally unique identifier is used, the same rules as defined for the UniqueID attribute in " +
                "    the Basic Information cluster apply." +
                "\n" +
                "  • If the identifier is only unique in the scope of the device, and cannot be used to track the " +
                "    device, then it may remain unchanged at factory reset." +
                "\n" +
                "The value does not need to be human readable, since it is intended for machine to machine (M2M) " +
                "communication."
        },

        {
            tag: "datatype", name: "DeviceTypeStruct", xref: "core§9.5.5.1",
            details: "The device type and revision define endpoint conformance to a release of a device type definition. " +
                "See the Data Model specification for more information.",

            children: [
                {
                    tag: "field", name: "DeviceType", xref: "core§9.5.5.1.1",
                    details: "This shall indicate the device type definition. The endpoint shall conform to the device type " +
                        "definition and cluster specifications required by the device type."
                },
                {
                    tag: "field", name: "Revision", xref: "core§9.5.5.1.2",
                    details: "This is the implemented revision of the device type definition. The endpoint shall conform to this " +
                        "revision of the device type."
                }
            ]
        }
    ]
});
