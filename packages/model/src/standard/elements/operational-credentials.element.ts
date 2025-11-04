/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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

export const OperationalCredentials = Cluster(
    { name: "OperationalCredentials", id: 0x3e, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        {
            name: "Nocs", id: 0x0, type: "list", access: "R F A", conformance: "M",
            constraint: "max supportedFabrics", quality: "N C"
        },
        Field({ name: "entry", type: "NOCStruct" })
    ),

    Attribute(
        {
            name: "Fabrics", id: 0x1, type: "list", access: "R F V", conformance: "M",
            constraint: "max supportedFabrics", quality: "N"
        },
        Field({ name: "entry", type: "FabricDescriptorStruct" })
    ),

    Attribute({
        name: "SupportedFabrics", id: 0x2, type: "uint8", access: "R V", conformance: "M",
        constraint: "5 to 254", quality: "F"
    }),
    Attribute({
        name: "CommissionedFabrics", id: 0x3, type: "uint8", access: "R V", conformance: "M",
        constraint: "max supportedFabrics", quality: "N"
    }),

    Attribute(
        {
            name: "TrustedRootCertificates", id: 0x4, type: "list", access: "R V", conformance: "M",
            constraint: "max supportedFabrics[max 400]", quality: "N C"
        },
        Field({ name: "entry", type: "octstr" })
    ),

    Attribute({ name: "CurrentFabricIndex", id: 0x5, type: "fabric-idx", access: "R V", conformance: "M", default: 0 }),

    Command(
        {
            name: "AttestationRequest", id: 0x0, access: "A", conformance: "M", direction: "request",
            response: "AttestationResponse"
        },
        Field({ name: "AttestationNonce", id: 0x0, type: "octstr", conformance: "M", constraint: "32" })
    ),

    Command(
        { name: "AttestationResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "AttestationElements", id: 0x0, type: "octstr", conformance: "M", constraint: "max 900" }),
        Field({ name: "AttestationSignature", id: 0x1, type: "octstr", conformance: "M", constraint: "64" })
    ),

    Command(
        {
            name: "CertificateChainRequest", id: 0x2, access: "A", conformance: "M", direction: "request",
            response: "CertificateChainResponse"
        },
        Field({ name: "CertificateType", id: 0x0, type: "CertificateChainTypeEnum", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "CertificateChainResponse", id: 0x3, conformance: "M", direction: "response" },
        Field({ name: "Certificate", id: 0x0, type: "octstr", conformance: "M", constraint: "max 600" })
    ),
    Command(
        { name: "CsrRequest", id: 0x4, access: "A", conformance: "M", direction: "request", response: "CsrResponse" },
        Field({ name: "CsrNonce", id: 0x0, type: "octstr", conformance: "M", constraint: "32" }),
        Field({ name: "IsForUpdateNoc", id: 0x1, type: "bool", conformance: "O", default: false })
    ),
    Command(
        { name: "CsrResponse", id: 0x5, conformance: "M", direction: "response" },
        Field({ name: "NocsrElements", id: 0x0, type: "octstr", conformance: "M", constraint: "max 900" }),
        Field({ name: "AttestationSignature", id: 0x1, type: "octstr", conformance: "M", constraint: "64" })
    ),

    Command(
        { name: "AddNoc", id: 0x6, access: "A", conformance: "M", direction: "request", response: "NocResponse" },
        Field({ name: "NocValue", id: 0x0, type: "octstr", conformance: "M", constraint: "max 400" }),
        Field({ name: "IcacValue", id: 0x1, type: "octstr", conformance: "O", constraint: "max 400" }),
        Field({ name: "IpkValue", id: 0x2, type: "octstr", conformance: "M", constraint: "16" }),
        Field({ name: "CaseAdminSubject", id: 0x3, type: "subject-id", conformance: "M" }),
        Field({ name: "AdminVendorId", id: 0x4, type: "vendor-id", conformance: "M" })
    ),

    Command(
        { name: "UpdateNoc", id: 0x7, access: "F A", conformance: "M", direction: "request", response: "NocResponse" },
        Field({ name: "NocValue", id: 0x0, type: "octstr", access: "F", conformance: "M", constraint: "max 400" }),
        Field({ name: "IcacValue", id: 0x1, type: "octstr", access: "F", conformance: "O", constraint: "max 400" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Command(
        { name: "NocResponse", id: 0x8, conformance: "M", direction: "response" },
        Field({ name: "StatusCode", id: 0x0, type: "NodeOperationalCertStatusEnum", conformance: "M" }),
        Field({
            name: "FabricIndex", id: 0x1, type: "fabric-idx", conformance: "StatusCode == Ok, O",
            constraint: "1 to 254"
        }),
        Field({ name: "DebugText", id: 0x2, type: "string", conformance: "O", constraint: "max 128" })
    ),

    Command(
        {
            name: "UpdateFabricLabel", id: 0x9, access: "F A", conformance: "M", direction: "request",
            response: "NocResponse"
        },
        Field({ name: "Label", id: 0x0, type: "string", access: "F", conformance: "M", constraint: "max 32" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Command(
        { name: "RemoveFabric", id: 0xa, access: "A", conformance: "M", direction: "request", response: "NocResponse" },
        Field({ name: "FabricIndex", id: 0x0, type: "fabric-idx", conformance: "M", constraint: "1 to 254" })
    ),

    Command(
        {
            name: "AddTrustedRootCertificate", id: 0xb, access: "A", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "RootCaCertificate", id: 0x0, type: "octstr", conformance: "M", constraint: "max 400" })
    ),

    Command(
        {
            name: "SetVidVerificationStatement", id: 0xc, access: "F A", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "VendorId", id: 0x0, type: "vendor-id", conformance: "O.a+" }),
        Field({ name: "VidVerificationStatement", id: 0x1, type: "octstr", conformance: "O.a+", constraint: "max 85" }),
        Field({ name: "Vvsc", id: 0x2, type: "octstr", conformance: "O.a+", constraint: "max 400" })
    ),

    Command(
        {
            name: "SignVidVerificationRequest", id: 0xd, access: "A", conformance: "M", direction: "request",
            response: "SignVidVerificationResponse"
        },
        Field({ name: "FabricIndex", id: 0x0, type: "fabric-idx", conformance: "M", constraint: "1 to 254" }),
        Field({ name: "ClientChallenge", id: 0x1, type: "octstr", conformance: "M", constraint: "32" })
    ),

    Command(
        { name: "SignVidVerificationResponse", id: 0xe, conformance: "M", direction: "response" },
        Field({ name: "FabricIndex", id: 0x0, type: "fabric-idx", conformance: "M", constraint: "1 to 254" }),
        Field({ name: "FabricBindingVersion", id: 0x1, type: "uint8", conformance: "M", constraint: "1 to 255" }),
        Field({ name: "Signature", id: 0x2, type: "octstr", conformance: "M", constraint: "min 1" })
    ),

    Datatype(
        { name: "CertificateChainTypeEnum", type: "enum8" },
        Field({ name: "DacCertificate", id: 0x1, conformance: "M" }),
        Field({ name: "PaiCertificate", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "NodeOperationalCertStatusEnum", type: "enum8" },
        Field({ name: "Ok", id: 0x0, conformance: "M" }),
        Field({ name: "InvalidPublicKey", id: 0x1, conformance: "M" }),
        Field({ name: "InvalidNodeOpId", id: 0x2, conformance: "M" }),
        Field({ name: "InvalidNoc", id: 0x3, conformance: "M" }),
        Field({ name: "MissingCsr", id: 0x4, conformance: "M" }),
        Field({ name: "TableFull", id: 0x5, conformance: "M" }),
        Field({ name: "InvalidAdminSubject", id: 0x6, conformance: "M" }),
        Field({ name: "FabricConflict", id: 0x9, conformance: "M" }),
        Field({ name: "LabelConflict", id: 0xa, conformance: "M" }),
        Field({ name: "InvalidFabricIndex", id: 0xb, conformance: "M" })
    ),

    Datatype(
        { name: "NOCStruct", type: "struct" },
        Field({ name: "Noc", id: 0x1, type: "octstr", access: "F", conformance: "M", constraint: "max 400" }),
        Field({ name: "Icac", id: 0x2, type: "octstr", access: "F", conformance: "M", constraint: "max 400", quality: "X" }),
        Field({ name: "Vvsc", id: 0x3, type: "octstr", access: "F", conformance: "desc", constraint: "max 400" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype(
        { name: "FabricDescriptorStruct", type: "struct" },
        Field({ name: "RootPublicKey", id: 0x1, type: "octstr", access: "F", conformance: "M", constraint: "65" }),
        Field({ name: "VendorId", id: 0x2, type: "vendor-id", access: "F", conformance: "M", constraint: "desc" }),
        Field({ name: "FabricId", id: 0x3, type: "fabric-id", access: "F", conformance: "M" }),
        Field({ name: "NodeId", id: 0x4, type: "node-id", access: "F", conformance: "M" }),
        Field({ name: "Label", id: 0x5, type: "string", access: "F", conformance: "M", constraint: "max 32" }),
        Field({ name: "VidVerificationStatement", id: 0x6, type: "octstr", access: "F", conformance: "O", constraint: "85" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    )
);

MatterDefinition.children.push(OperationalCredentials);
