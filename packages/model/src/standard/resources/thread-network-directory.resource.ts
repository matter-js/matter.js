/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ThreadNetworkDirectory", classification: "application", pics: "THNETDIR",
    xref: "cluster§10.4",
    details: "This cluster stores a list of Thread networks (including the credentials required to access each " +
        "network), as well as a designation of the user’s preferred network, to facilitate the sharing of " +
        "Thread networks across fabrics.",

    children: [
        {
            tag: "attribute", name: "PreferredExtendedPanId", xref: "cluster§10.4.5.1",

            details: "Indicates the Thread Extended PAN ID value for the Thread network designated by the user to be their " +
                "preferred network for commissioning of Thread devices. If not null, the value of this attribute " +
                "shall match the ExtendedPanID of a network in the ThreadNetworks attribute. A write operation with a " +
                "non-null value that does not match any network in the ThreadNetworks list shall be rejected with a " +
                "status of CONSTRAINT_ERROR." +
                "\n" +
                "The purpose of designating one Thread network as preferred is to help a commissioner to select a " +
                "Thread network when a Thread device is within suitable range of more than one Thread network which " +
                "appears in the ThreadNetworks list. A value of null indicates that there is no current preferred " +
                "network: All networks may be treated as equally preferred by a commissioner with access to this " +
                "cluster." +
                "\n" +
                "This attribute may be automatically set to the ExtendedPanID of the first Thread network added to " +
                "the ThreadNetworks list." +
                "\n" +
                "A client shall obtain user consent before changing the value of this attribute from a non-null " +
                "value." +
                "\n" +
                "On a factory reset this attribute shall be reset to null."
        },

        {
            tag: "attribute", name: "ThreadNetworks", xref: "cluster§10.4.5.2",

            details: "Indicates the list of Thread Networks known about by this cluster. If the node hosting this cluster " +
                "includes a Thread Border Router, then an entry for its Thread Network shall be included in this " +
                "list." +
                "\n" +
                "The list can be modified via the AddNetwork and RemoveNetwork commands." +
                "\n" +
                "For each entry in the list, the cluster server also stores a Thread Operational Dataset. Clients use " +
                "the GetOperationalDataset command to obtain the Operational Dataset for an entry in this list." +
                "\n" +
                "On a factory reset this list shall be cleared, and any Thread Operational datasets previously stored " +
                "shall be removed from the Node."
        },

        {
            tag: "attribute", name: "ThreadNetworkTableSize", xref: "cluster§10.4.5.3",
            details: "Indicates the maximum number of entries that can be held in the ThreadNetworks list; it shall be at " +
                "least 2 times the number of SupportedFabrics advertised in the Operational Credentials Cluster on " +
                "the root endpoint of this node."
        },

        {
            tag: "command", name: "AddNetwork", xref: "cluster§10.4.6.1",
            details: "Adds an entry to the ThreadNetworks attribute with the specified Thread Operational Dataset." +
                "\n" +
                "If there is an existing entry with the Extended PAN ID then the Thread Operational Dataset for that " +
                "entry is replaced. As a result, changes to the network parameters (e.g. Channel, Network Name, PSKc, " +
                "…) of an existing entry with a given Extended PAN ID can be made using this command.",

            children: [{
                tag: "field", name: "OperationalDataset", xref: "cluster§10.4.6.1.1",
                details: "This field shall represent the Operational Dataset for the network, using the encoding defined in " +
                    "the Thread specification. It shall contain at least the following sub-TLVs: Active Timestamp, " +
                    "Channel, Channel Mask, Extended PAN ID, Network Key, Network Mesh-Local Prefix, Network Name, PAN " +
                    "ID, PSKc, and Security Policy."
            }]
        },

        {
            tag: "command", name: "RemoveNetwork", xref: "cluster§10.4.6.2",
            details: "Removes the network with the given Extended PAN ID from the ThreadNetworks attribute."
        },
        {
            tag: "command", name: "GetOperationalDataset", xref: "cluster§10.4.6.3",
            details: "Retrieves the Thread Operational Dataset with the given Extended PAN ID."
        },
        {
            tag: "command", name: "OperationalDatasetResponse", xref: "cluster§10.4.6.4",
            details: "Contains the Thread Operational Dataset for the Extended PAN specified in GetOperationalDataset."
        },

        {
            tag: "datatype", name: "ThreadNetworkStruct", xref: "cluster§10.4.4.1",
            details: "Represents the data associated with a Thread Network.",

            children: [
                {
                    tag: "field", name: "ExtendedPanId", xref: "cluster§10.4.4.1.1",
                    details: "This field shall indicate the Extended PAN ID from the OperationalDataset for the given Thread " +
                        "network."
                },
                {
                    tag: "field", name: "NetworkName", xref: "cluster§10.4.4.1.2",
                    details: "This field shall indicate the Network Name from the OperationalDataset for the given Thread network."
                },
                {
                    tag: "field", name: "Channel", xref: "cluster§10.4.4.1.3",
                    details: "This field shall indicate the Channel from the OperationalDataset for the given Thread network."
                },
                {
                    tag: "field", name: "ActiveTimestamp", xref: "cluster§10.4.4.1.4",
                    details: "This field shall indicate the Active Timestamp from the OperationalDataset for the given Thread " +
                        "network."
                }
            ]
        }
    ]
});
