/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "TlsClientManagement", pics: "TLSCLIENT", xref: "core§14.5",

    details: "This Cluster is used to provision TLS Endpoints with enough information to facilitate subsequent " +
        "connection." +
        "\n" +
        "Commands in this cluster uniformly use the Large Message qualifier, even when the command doesn't " +
        "require it, to reduce the testing matrix." +
        "\n" +
        "This cluster shall be present on the root node endpoint when required by a device type, may be " +
        "present on that endpoint otherwise, and shall NOT be present on any other Endpoint of any Node.",

    children: [
        {
            tag: "attribute", name: "MaxProvisioned", xref: "core§14.5.6.1",
            details: "Indicates the maximum number of per fabric TLSEndpoints that can be installed on this Node."
        },
        {
            tag: "attribute", name: "ProvisionedEndpoints", xref: "core§14.5.6.2",
            details: "Indicates a list of currently provisioned TLS Endpoints on this Node. The maximum length of this " +
                "list when read will be the value of MaxProvisioned."
        },

        {
            tag: "command", name: "ProvisionEndpoint", xref: "core§14.5.7.1",
            details: "This command is used to provision a TLS Endpoint for the provided Hostname / Port combination.",

            children: [
                {
                    tag: "field", name: "Hostname", xref: "core§14.5.7.1.1",
                    details: "This field shall represent a TLS Hostname."
                },
                {
                    tag: "field", name: "Port", xref: "core§14.5.7.1.2",
                    details: "This field shall represent a TLS Port Number."
                },
                {
                    tag: "field", name: "Caid", xref: "core§14.5.7.1.3",
                    details: "This field shall be the TLSCAID used to associate the TLSRCAC with this endpoint."
                },
                {
                    tag: "field", name: "Ccdid", xref: "core§14.5.7.1.4",
                    details: "This field shall be the TLSCCDID used to associate the Client Certificate Details with this " +
                        "endpoint. A NULL value means no client certificate is associated."
                },
                {
                    tag: "field", name: "EndpointId", xref: "core§14.5.7.1.5",
                    details: "This field shall represent the unique TLS Endpoint. A NULL value causes a new endpoint to be created " +
                        "and a non-NULL value allows for updating an existing endpoint."
                }
            ]
        },

        {
            tag: "command", name: "ProvisionEndpointResponse", xref: "core§14.5.7.2",
            details: "This command is used to report the result of the ProvisionEndpoint command.",
            children: [{
                tag: "field", name: "EndpointId", xref: "core§14.5.7.2.1",
                details: "This field shall be the TLS Endpoint ID created or updated by the ProvisionEndpoint command."
            }]
        },

        {
            tag: "command", name: "FindEndpoint", xref: "core§14.5.7.3",
            details: "This command is used to find a TLS Endpoint by its ID." +
                "\n" +
                "This command shall return the TLSEndpointStruct for the passed in EndpointID.",
            children: [{
                tag: "field", name: "EndpointId", xref: "core§14.5.7.3.1",
                details: "This field shall be the TLS Endpoint ID being looked up."
            }]
        },

        {
            tag: "command", name: "FindEndpointResponse", xref: "core§14.5.7.4",
            details: "This command is used to report the result of the FindEndpoint command.",
            children: [{
                tag: "field", name: "Endpoint", xref: "core§14.5.7.4.1",
                details: "The field shall be a TLSEndpointStruct containing the requested entry."
            }]
        },

        {
            tag: "command", name: "RemoveEndpoint", xref: "core§14.5.7.5",
            details: "This command is used to remove a TLS Endpoint by its ID." +
                "\n" +
                "This command shall be generated to request the Node remove any TLS Endpoint.",
            children: [{
                tag: "field", name: "EndpointId", xref: "core§14.5.7.5.1",
                details: "This field shall represent the unique TLSEndpointID of the TLS Endpoint to remove."
            }]
        },

        {
            tag: "datatype", name: "TLSEndpointID", xref: "core§14.5.4.1",
            details: "This data type is derived from uint16 and represents a provisioned endpoint with valid values from 0 " +
                "to 65534. This value SHOULD start at 0 and monotonically increase by 1 with each new allocation " +
                "provisioned by the Node. A value incremented past 65534 SHOULD wrap to 0. The Node shall verify that " +
                "a new value does not match any other value for this type. If such a match is found, the value shall " +
                "be changed until a unique value is found."
        },

        {
            tag: "datatype", name: "TLSEndpointStruct", xref: "core§14.5.4.2",
            details: "This struct encodes details about a TLS Endpoint.",

            children: [
                {
                    tag: "field", name: "EndpointId", xref: "core§14.5.4.2.1",
                    details: "This field shall represent the unique TLS Endpoint ID."
                },
                {
                    tag: "field", name: "Hostname", xref: "core§14.5.4.2.2",
                    details: "This field shall represent a TLS Hostname."
                },
                {
                    tag: "field", name: "Port", xref: "core§14.5.4.2.3",
                    details: "This field shall represent a TLS Port Number."
                },
                {
                    tag: "field", name: "Caid", xref: "core§14.5.4.2.4",
                    details: "This field shall be a TLSCAID representing the associated Certificate Authority ID."
                },
                {
                    tag: "field", name: "Ccdid", xref: "core§14.5.4.2.5",
                    details: "This field shall be a TLSCCDID representing the associated Client Certificate Details ID. A NULL " +
                        "value means no client certificate is used with this endpoint."
                },

                {
                    tag: "field", name: "ReferenceCount", xref: "core§14.5.4.2.6",
                    details: "This field shall indicate a reference count of the number of entities currently using this TLS " +
                        "Endpoint. The node shall recompute this field to reflect the correct value at runtime (e.g., when " +
                        "restored from a persisted value after a reboot)."
                }
            ]
        },

        {
            tag: "datatype", name: "StatusCodeEnum", xref: "core§14.5.5.1",

            children: [
                { tag: "field", name: "EndpointAlreadyInstalled", description: "The endpoint is already installed." },
                {
                    tag: "field", name: "RootCertificateNotFound",
                    description: "No root certificate exists for this CAID."
                },
                {
                    tag: "field", name: "ClientCertificateNotFound",
                    description: "No client certificate exists for this CCDID."
                },
                { tag: "field", name: "EndpointInUse", description: "The endpoint is in use and cannot be removed." },
                { tag: "field", name: "InvalidTime", description: "Time sync has not yet occurred." }
            ]
        }
    ]
});
