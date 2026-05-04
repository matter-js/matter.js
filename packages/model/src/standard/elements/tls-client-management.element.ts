/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const TlsClientManagement = Cluster(
    { name: "TlsClientManagement", id: 0x802, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({
        name: "MaxProvisioned", id: 0x0, type: "uint8", access: "R V", conformance: "M",
        constraint: "5 to 254", quality: "F"
    }),

    Attribute(
        {
            name: "ProvisionedEndpoints", id: 0x1, type: "list", access: "R S V", conformance: "M",
            constraint: "desc", quality: "N"
        },
        Field({ name: "entry", type: "TLSEndpointStruct" })
    ),

    Command(
        {
            name: "ProvisionEndpoint", id: 0x0, access: "F A", conformance: "M", direction: "request",
            quality: "L", response: "ProvisionEndpointResponse"
        },
        Field({ name: "Hostname", id: 0x0, type: "octstr", conformance: "M", constraint: "4 to 253" }),
        Field({ name: "Port", id: 0x1, type: "uint16", conformance: "M", constraint: "1 to 65535" }),
        Field({ name: "Caid", id: 0x2, type: "TlsCertificateManagement.TLSCAID", conformance: "M", constraint: "0 to 65534" }),
        Field({ name: "Ccdid", id: 0x3, type: "TlsCertificateManagement.TLSCCDID", conformance: "M", quality: "X" }),
        Field({ name: "EndpointId", id: 0x4, type: "TLSEndpointID", conformance: "M", quality: "X" })
    ),

    Command(
        { name: "ProvisionEndpointResponse", id: 0x1, conformance: "M", direction: "response", quality: "L" },
        Field({ name: "EndpointId", id: 0x0, type: "TLSEndpointID", conformance: "M", constraint: "0 to 65534" })
    ),

    Command(
        {
            name: "FindEndpoint", id: 0x2, access: "F O", conformance: "M", direction: "request", quality: "L",
            response: "FindEndpointResponse"
        },
        Field({ name: "EndpointId", id: 0x0, type: "TLSEndpointID", conformance: "M", constraint: "0 to 65534" })
    ),

    Command(
        { name: "FindEndpointResponse", id: 0x3, conformance: "M", direction: "response", quality: "L" },
        Field({ name: "Endpoint", id: 0x0, type: "TLSEndpointStruct", conformance: "M", constraint: "0 to 65534" })
    ),
    Command(
        { name: "RemoveEndpoint", id: 0x4, access: "F A", conformance: "M", direction: "request", quality: "L" },
        Field({ name: "EndpointId", id: 0x0, type: "TLSEndpointID", conformance: "M", constraint: "0 to 65534" })
    ),
    Datatype({ name: "TLSEndpointID", type: "uint16" }),

    Datatype(
        { name: "TLSEndpointStruct", type: "struct" },
        Field({ name: "EndpointId", id: 0x0, type: "TLSEndpointID", access: "F", conformance: "M", constraint: "0 to 65534" }),
        Field({ name: "Hostname", id: 0x1, type: "octstr", access: "F", conformance: "M", constraint: "4 to 253" }),
        Field({ name: "Port", id: 0x2, type: "uint16", access: "F", conformance: "M", constraint: "1 to 65535" }),
        Field({
            name: "Caid", id: 0x3, type: "TlsCertificateManagement.TLSCAID", access: "F", conformance: "M",
            constraint: "0 to 65534"
        }),
        Field({
            name: "Ccdid", id: 0x4, type: "TlsCertificateManagement.TLSCCDID", access: "F", conformance: "M",
            quality: "X"
        }),
        Field({ name: "ReferenceCount", id: 0x5, type: "uint8", access: "F", conformance: "M" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype(
        { name: "StatusCodeEnum", type: "enum8" },
        Field({ name: "EndpointAlreadyInstalled", id: 0x2 }),
        Field({ name: "RootCertificateNotFound", id: 0x3 }),
        Field({ name: "ClientCertificateNotFound", id: 0x4 }),
        Field({ name: "EndpointInUse", id: 0x5 }),
        Field({ name: "InvalidTime", id: 0x6 })
    )
);

MatterDefinition.children.push(TlsClientManagement);
