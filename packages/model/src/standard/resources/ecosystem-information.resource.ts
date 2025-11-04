/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "EcosystemInformation", pics: "ECOINFO", xref: "core§9.17",

    details: "The Ecosystem Information Cluster provides extended device information for all the logical devices " +
        "represented by a Bridged Node. The Ecosystem Information Cluster presents the view of device name " +
        "and location metadata for presentation by a client of the cluster to a user. This cluster is " +
        "intended to support Fabric Synchronization and be present on an endpoint with the BridgedNode device " +
        "type listed in the DeviceTypeList of the endpoint’s Descriptor cluster." +
        "\n" +
        "This augments the Bridged Device Basic Information Cluster in the following ways:" +
        "\n" +
        "  • The Ecosystem Information Cluster adds support for providing a name and location for individual " +
        "    endpoints. (The endpoints do not need to be present on the Bridge for their name and location " +
        "    information to be present.)" +
        "\n" +
        "  • The Ecosystem Information Cluster adds metadata to support conflict resolution between multiple " +
        "    sources of the name and location data." +
        "\n" +
        "  • The Ecosystem Information Cluster supports user control for the presence of the name and " +
        "    location information by specifying more restricted access." +
        "\n" +
        "A client SHOULD use the information provided by the Ecosystem Information Cluster to help the user " +
        "organize and interact with their devices. Some examples may include:" +
        "\n" +
        "  • Directly organizing and labeling the devices in a client’s user interface." +
        "\n" +
        "  • Providing hints in the user interface, which can assist the user in organizing and labeling " +
        "    their devices." +
        "\n" +
        "For the purposes of the Ecosystem Information Cluster section, an instance of the Ecosystem " +
        "Information Cluster will be referred to as an \"instance\".",

    children: [
        {
            tag: "attribute", name: "DeviceDirectory", xref: "core§9.17.5.1",
            details: "This attribute shall contain the list of logical devices represented by a Bridged Node. Most of the " +
                "time this will contain a single entry, but may grow with more complex device compositions (e.g. " +
                "another bridge.) An empty list indicates that the information is not available."
        },

        {
            tag: "attribute", name: "LocationDirectory", xref: "core§9.17.5.2",

            details: "This attribute shall contain the list of rooms, areas and groups associated with the DeviceDirectory " +
                "entries, and shall NOT contain locations which are dynamically generated and removed by an " +
                "ecosystem. (E.g. a location that is generated and removed based on the user being home is not " +
                "permitted. However, an initially generated location name that does not quickly change is " +
                "acceptable.) An empty list indicates that the information is not available." +
                "\n" +
                "LocationDirectory entries shall be removed if there is no DeviceDirectory that references it."
        },

        {
            tag: "datatype", name: "DeviceTypeStruct", xref: "core§9.17.4.1",
            details: "The device type and revision define endpoint conformance to a release of a device type definition. " +
                "See the Data Model specification for more information.",

            children: [
                {
                    tag: "field", name: "DeviceType", xref: "core§9.17.4.1.1",
                    details: "This shall indicate the device type definition."
                },
                {
                    tag: "field", name: "Revision", xref: "core§9.17.4.1.2",
                    details: "This is the implemented revision of the device type definition."
                }
            ]
        },

        {
            tag: "datatype", name: "EcosystemDeviceStruct", xref: "core§9.17.4.2",

            children: [
                {
                    tag: "field", name: "DeviceName", xref: "core§9.17.4.2.1",
                    details: "This field shall indicate the device’s name, which is provided externally if the user consents. (For " +
                        "example, provided by the user in an ecosystem specific interface.)"
                },
                {
                    tag: "field", name: "DeviceNameLastEdit", xref: "core§9.17.4.2.2",
                    details: "This field shall indicate the timestamp of when the DeviceName was last modified."
                },

                {
                    tag: "field", name: "BridgedEndpoint", xref: "core§9.17.4.2.3",
                    details: "This field shall indicate the endpoint this EcosystemDeviceStruct is associated with on this Bridge." +
                        "\n" +
                        "This field shall be present and set to a valid endpoint if the device is accessible through the " +
                        "bridge."
                },

                {
                    tag: "field", name: "OriginalEndpoint", xref: "core§9.17.4.2.4",
                    details: "This field shall indicate the endpoint this EcosystemDeviceStruct is associated with on the original " +
                        "device represented by this bridge’s Bridged Node. If this bridge is receiving the device from " +
                        "another bridge, then the OriginalEndpoint field value would be the same on both bridges. This field " +
                        "shall be present and set to a valid endpoint on the original device if that device is a Matter " +
                        "device."
                },

                {
                    tag: "field", name: "DeviceTypes", xref: "core§9.17.4.2.5",
                    details: "This field shall indicate all of the DeviceTypes within the DeviceTypeList in the Descriptor Cluster " +
                        "associated with this EcosystemDeviceStruct entry." +
                        "\n" +
                        "This field shall contain a list of valid device type ids."
                },

                {
                    tag: "field", name: "UniqueLocationIDs", xref: "core§9.17.4.2.6",
                    details: "This field shall specify the EcosystemLocationStruct entries in the LocationDirectory attribute " +
                        "associated with this EcosystemDeviceStruct."
                },

                {
                    tag: "field", name: "UniqueLocationIDsLastEdit", xref: "core§9.17.4.2.7",

                    details: "This field shall indicate the timestamp of when the UniqueLocationIDs was last modified." +
                        "\n" +
                        "NOTE If multiple server instances update the UniqueLocationIDs field at the same time, it is " +
                        "possible one of the updates will be missed. This is considered an acceptable limitation to reduce " +
                        "the complexity of the design. Since this is meant to be provided from user input, it is unlikely " +
                        "these signals would be happening at one time."
                }
            ]
        },

        {
            tag: "datatype", name: "EcosystemLocationStruct", xref: "core§9.17.4.3",

            children: [
                {
                    tag: "field", name: "UniqueLocationId", xref: "core§9.17.4.3.1",

                    details: "This field shall indicate a unique identifier for a specific Ecosystem Information Cluster server " +
                        "instance representing the location independent of its LocationDescriptor field." +
                        "\n" +
                        "UniqueLocationID can be used by the client to determine if the change is a relocation of the device " +
                        "or just a renaming of the location." +
                        "\n" +
                        "No guarantees are given for consistency of the ID between server instances. The same location may be " +
                        "represented by different IDs on different Ecosystem Information Cluster server instances, so only " +
                        "the history from a single server instance should be considered when evaluating a change." +
                        "\n" +
                        "UniqueLocationID shall be changed when the LocationDescriptor changes from one existing location to " +
                        "another location as a result of an external interaction. (For example, the user changes the location " +
                        "assignment.)" +
                        "\n" +
                        "UniqueLocationID shall NOT be changed when the LocationDescriptor changes name, but still represents " +
                        "the same location. (For example, the user renames a room.) UniqueLocationID shall be changed when " +
                        "LocationDescriptor changes as a result of another Ecosystem Information Cluster server instance " +
                        "changing and the UniqueLocationID on the remote server instance also changes." +
                        "\n" +
                        "UniqueLocationID shall NOT be changed when LocationDescriptor changes as a result of another " +
                        "Ecosystem Information Cluster server instance changing and the UniqueLocationID on the remote server " +
                        "instance does not change."
                },

                {
                    tag: "field", name: "LocationDescriptor", xref: "core§9.17.4.3.2",

                    details: "This field shall indicate the location (e.g. living room, driveway) and associated metadata that is" +
                        "\n" +
                        "provided externally if the user consents. (For example, provided by the user in an ecosystem " +
                        "specific interface.)" +
                        "\n" +
                        "\"Location\" in this context is typically used by the user’s grouping into rooms, areas or other " +
                        "logical groupings of how devices are used. So a device might be part of multiple such \"Locations\"s."
                },

                {
                    tag: "field", name: "LocationDescriptorLastEdit", xref: "core§9.17.4.3.3",
                    details: "This field shall indicate the timestamp of when the LocationDescriptor was last modified."
                }
            ]
        }
    ]
});
