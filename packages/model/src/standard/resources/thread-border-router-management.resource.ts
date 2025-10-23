/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ThreadBorderRouterManagement", classification: "application", pics: "TBRM",
    xref: "cluster§10.3",
    details: "This cluster provides an interface for managing a Thread Border Router and the Thread network that " +
        "it belongs to. Privileged nodes within the same fabric as a Thread Border Router can use these " +
        "interfaces to request and set credentials information to the Thread network.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§10.3.4",

            children: [{
                tag: "field", name: "PC", xref: "cluster§10.3.4.1",

                details: "This feature shall indicate the ability of the Border Router to change its already configured PAN to " +
                    "another, by setting a pending dataset." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> This feature flag can be used to protect an already-configured network from accidental " +
                    "  configuration change, e.g. when the Thread Border Router serves non-Matter devices that do not " +
                    "  support PAN change for an implementation-specific reason."
            }]
        },

        {
            tag: "attribute", name: "BorderRouterName", xref: "cluster§10.3.5.1",
            details: "Indicates a user-friendly name identifying the device model or product of the Border Router in " +
                "MeshCOP (DNS-SD service name) as defined in the Thread specification, and has the following " +
                "recommended format: <VendorName> <ProductName>._meshcop._udp. An example name would be ACME Border " +
                "Router (74be)._meshcop._udp."
        },

        {
            tag: "attribute", name: "BorderAgentId", xref: "cluster§10.3.5.2",
            details: "Indicates a 16-byte globally unique ID for a Thread Border Router device. This ID is " +
                "manufacturer-specific, and it is created and managed by the border router’s implementation."
        },

        {
            tag: "attribute", name: "ThreadVersion", xref: "cluster§10.3.5.3",
            details: "Indicates the Thread version supported by the Thread interface configured by the cluster instance." +
                "\n" +
                "The format shall match the value mapping defined in the \"Version TLV\" section of the Thread " +
                "specification. For example, Thread 1.3.0 would have ThreadVersion set to 4."
        },

        {
            tag: "attribute", name: "InterfaceEnabled", xref: "cluster§10.3.5.4",
            details: "Indicates whether the associated IEEE 802.15.4 Thread interface is enabled or disabled."
        },

        {
            tag: "attribute", name: "ActiveDatasetTimestamp", xref: "cluster§10.3.5.5",
            details: "Null if the Thread Border Router has no dataset configured, otherwise it shall be the timestamp " +
                "value extracted from the Active Dataset value configured by the Thread Node to which the border " +
                "router is connected. This attribute shall be updated when a new Active dataset is configured on the " +
                "Thread network to which the border router is connected."
        },

        {
            tag: "attribute", name: "PendingDatasetTimestamp", xref: "cluster§10.3.5.6",
            details: "Null if the Thread Border Router has no Pending dataset configured, otherwise it shall be the " +
                "timestamp value extracted from the Pending Dataset value configured by the Thread Node to which the " +
                "border router is connected. This attribute shall be updated when a new Pending dataset is configured " +
                "on the Thread network to which the border router is connected."
        },

        {
            tag: "command", name: "GetActiveDatasetRequest", xref: "cluster§10.3.6.1",

            details: "This command shall be used to request the active operational dataset of the Thread network to which " +
                "the border router is connected." +
                "\n" +
                "If the command is not executed via a CASE session, the command shall fail with a status code of " +
                "UNSUPPORTED_ACCESS." +
                "\n" +
                "If an internal error occurs, then this command shall fail with a FAILURE status code sent back to " +
                "the initiator." +
                "\n" +
                "Otherwise, this shall generate a DatasetResponse command."
        },

        {
            tag: "command", name: "GetPendingDatasetRequest", xref: "cluster§10.3.6.2",

            details: "This command shall be used to request the pending dataset of the Thread network to which the border " +
                "router is connected." +
                "\n" +
                "If the command is not executed via a CASE session, the command shall fail with a status code of " +
                "UNSUPPORTED_ACCESS." +
                "\n" +
                "If an internal error occurs, then this command shall fail with a FAILURE status code sent back to " +
                "the initiator." +
                "\n" +
                "Otherwise, this shall generate a DatasetResponse command."
        },

        {
            tag: "command", name: "DatasetResponse", xref: "cluster§10.3.6.3",
            details: "This command is sent in response to GetActiveDatasetRequest or GetPendingDatasetRequest command.",

            children: [{
                tag: "field", name: "Dataset", xref: "cluster§10.3.6.3.1",
                details: "If no dataset (active or pending as requested) is configured, this field shall be set to empty." +
                    "\n" +
                    "Otherwise, this field shall contain the active or pending dataset of the Thread network to which the " +
                    "Border Router is connected as an octet string containing the raw Thread TLV value of the dataset, as " +
                    "defined in the Thread specification."
            }]
        },

        {
            tag: "command", name: "SetActiveDatasetRequest", xref: "cluster§10.3.6.4",
            details: "This command shall be used to set the active Dataset of the Thread network to which the Border " +
                "Router is connected, when there is no active dataset already.",

            children: [
                {
                    tag: "field", name: "ActiveDataset", xref: "cluster§10.3.6.4.1",
                    details: "This field shall contain the active dataset to set of the Thread network to configure in the Border " +
                        "Router as an octet string containing the raw Thread TLV value of the dataset, as defined in the " +
                        "Thread specification."
                },

                {
                    tag: "field", name: "Breadcrumb", xref: "cluster§10.3.6.4.2",
                    details: "See Breadcrumb Attribute section of General Commissioning Cluster in [MatterCore] for usage."
                }
            ]
        },

        {
            tag: "command", name: "SetPendingDatasetRequest", xref: "cluster§10.3.6.5",

            details: "This command shall be used to set or update the pending Dataset of the Thread network to which the " +
                "Border Router is connected, if the Border Router supports PAN Change." +
                "\n" +
                "If the command is not executed via a CASE session, the command shall fail with a status code of " +
                "UNSUPPORTED_ACCESS." +
                "\n" +
                "This PendingDataset field shall contain the pending dataset to which the Thread network should be " +
                "updated. The format of the data shall be an octet string containing the raw Thread TLV value of the " +
                "pending dataset, as defined in the Thread specification." +
                "\n" +
                "If any of the parameters in the PendingDataset is invalid, the command shall fail with a status of " +
                "INVALID_COMMAND." +
                "\n" +
                "Otherwise, this command shall configure the pending dataset of the Thread network to which the " +
                "Border Router is connected, with the value given in the PendingDataset parameter. The Border Router " +
                "will manage activation of the pending dataset as defined in the Thread specification."
        }
    ]
});
