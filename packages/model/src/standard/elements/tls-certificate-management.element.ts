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

export const TlsCertificateManagement = Cluster(
    { name: "TlsCertificateManagement", id: 0x801, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({
        name: "MaxRootCertificates", id: 0x0, type: "uint8", access: "R V", conformance: "M",
        constraint: "5 to 254", quality: "F"
    }),

    Attribute(
        {
            name: "ProvisionedRootCertificates", id: 0x1, type: "list", access: "R S V", conformance: "M",
            constraint: "max maxRootCertificates", quality: "N"
        },
        Field({ name: "entry", type: "TLSCertStruct" })
    ),

    Attribute({
        name: "MaxClientCertificates", id: 0x2, type: "uint8", access: "R V", conformance: "M",
        constraint: "2 to 254", quality: "F"
    }),

    Attribute(
        {
            name: "ProvisionedClientCertificates", id: 0x3, type: "list", access: "R S V", conformance: "M",
            constraint: "max maxClientCertificates", quality: "N"
        },
        Field({ name: "entry", type: "TLSClientCertificateDetailStruct" })
    ),

    Command(
        {
            name: "ProvisionRootCertificate", id: 0x0, access: "F A", conformance: "M", direction: "request",
            response: "ProvisionRootCertificateResponse"
        },
        Field({ name: "Certificate", id: 0x0, type: "octstr", conformance: "M", constraint: "max 3000" }),
        Field({ name: "Caid", id: 0x1, type: "TLSCAID", conformance: "M", quality: "X" })
    ),

    Command(
        { name: "ProvisionRootCertificateResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "Caid", id: 0x0, type: "TLSCAID", conformance: "M", constraint: "0 to 65534" })
    ),

    Command(
        {
            name: "FindRootCertificate", id: 0x2, access: "F O", conformance: "M", direction: "request",
            response: "FindRootCertificateResponse"
        },
        Field({ name: "Caid", id: 0x0, type: "TLSCAID", conformance: "M", quality: "X" })
    ),

    Command(
        { name: "FindRootCertificateResponse", id: 0x3, conformance: "M", direction: "response" },

        Field(
            {
                name: "CertificateDetails", id: 0x0, type: "list", conformance: "M",
                constraint: "1 to maxRootCertificates"
            },
            Field({ name: "entry", type: "TLSCertStruct" })
        )
    ),

    Command(
        {
            name: "LookupRootCertificate", id: 0x4, access: "F O", conformance: "M", direction: "request",
            response: "LookupRootCertificateResponse"
        },
        Field({ name: "Fingerprint", id: 0x0, type: "octstr", conformance: "M", constraint: "max 64" })
    ),

    Command(
        { name: "LookupRootCertificateResponse", id: 0x5, conformance: "M", direction: "response" },
        Field({ name: "Caid", id: 0x0, type: "TLSCAID", conformance: "M", constraint: "0 to 65534" })
    ),

    Command(
        {
            name: "RemoveRootCertificate", id: 0x6, access: "F A", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "Caid", id: 0x0, type: "TLSCAID", conformance: "M", constraint: "0 to 65534" })
    ),

    Command(
        {
            name: "ClientCsr", id: 0x7, access: "F A", conformance: "M", direction: "request",
            response: "ClientCsrResponse"
        },
        Field({ name: "Nonce", id: 0x0, type: "octstr", conformance: "M", constraint: "32" }),
        Field({ name: "Ccdid", id: 0x1, type: "TLSCCDID", conformance: "M", constraint: "0 to 65534", quality: "X" })
    ),

    Command(
        { name: "ClientCsrResponse", id: 0x8, conformance: "M", direction: "response" },
        Field({ name: "Ccdid", id: 0x0, type: "TLSCCDID", conformance: "M", constraint: "0 to 65534" }),
        Field({ name: "Csr", id: 0x1, type: "octstr", conformance: "M", constraint: "max 3000" }),
        Field({ name: "NonceSignature", id: 0x2, type: "octstr", conformance: "M", constraint: "max 128" })
    ),

    Command(
        {
            name: "ProvisionClientCertificate", id: 0x9, access: "F A", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "Ccdid", id: 0x0, type: "TLSCCDID", conformance: "M", constraint: "0 to 65534" }),
        Field({ name: "ClientCertificate", id: 0x1, type: "octstr", conformance: "M", constraint: "max 3000" }),

        Field(
            {
                name: "IntermediateCertificates", id: 0x2, type: "list", conformance: "M",
                constraint: "0 to 10[max 3000]"
            },
            Field({ name: "entry", type: "octstr" })
        )
    ),

    Command(
        {
            name: "FindClientCertificate", id: 0xa, access: "F O", conformance: "M", direction: "request",
            response: "FindClientCertificateResponse"
        },
        Field({ name: "Ccdid", id: 0x0, type: "TLSCCDID", conformance: "M", quality: "X" })
    ),

    Command(
        { name: "FindClientCertificateResponse", id: 0xb, conformance: "M", direction: "response" },

        Field(
            {
                name: "CertificateDetails", id: 0x0, type: "list", conformance: "M",
                constraint: "1 to maxClientCertificates"
            },
            Field({ name: "entry", type: "TLSClientCertificateDetailStruct" })
        )
    ),

    Command(
        {
            name: "LookupClientCertificate", id: 0xc, access: "F O", conformance: "M", direction: "request",
            response: "LookupClientCertificateResponse"
        },
        Field({ name: "Fingerprint", id: 0x0, type: "octstr", conformance: "M", constraint: "max 64" })
    ),

    Command(
        { name: "LookupClientCertificateResponse", id: 0xd, conformance: "M", direction: "response" },
        Field({ name: "Ccdid", id: 0x0, type: "TLSCCDID", conformance: "M", constraint: "0 to 65534" })
    ),

    Command(
        {
            name: "RemoveClientCertificate", id: 0xe, access: "F A", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "Ccdid", id: 0x0, type: "TLSCCDID", conformance: "M", constraint: "0 to 65534" })
    ),

    Datatype({ name: "TLSCAID", type: "uint16" }),
    Datatype({ name: "TLSCCDID", type: "uint16" }),

    Datatype(
        { name: "TLSCertStruct", type: "struct" },
        Field({ name: "Caid", id: 0x0, type: "TLSCAID", access: "F", conformance: "M", constraint: "0 to 65534" }),
        Field({ name: "Certificate", id: 0x1, type: "octstr", access: "F", conformance: "O", constraint: "max 3000" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype(
        { name: "TLSClientCertificateDetailStruct", type: "struct" },
        Field({ name: "Ccdid", id: 0x0, type: "TLSCCDID", access: "F", conformance: "M", constraint: "0 to 65534" }),
        Field({
            name: "ClientCertificate", id: 0x1, type: "octstr", access: "F", conformance: "O",
            constraint: "max 3000", quality: "X"
        }),

        Field(
            {
                name: "IntermediateCertificates", id: 0x2, type: "list", access: "F", conformance: "O",
                constraint: "max 10[max 3000]"
            },
            Field({ name: "entry", type: "octstr" })
        ),

        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    )
);

MatterDefinition.children.push(TlsCertificateManagement);
