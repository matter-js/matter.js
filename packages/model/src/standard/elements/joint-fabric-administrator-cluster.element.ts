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
    CommandElement as Command,
    FieldElement as Field,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const JointFabricAdministrator = Cluster(
    { name: "JointFabricAdministrator", id: 0x753, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({
        name: "AdministratorFabricIndex", id: 0x0, type: "fabric-idx", access: "A", conformance: "P, M",
        constraint: "1 to 254", quality: "X"
    }),
    Command({
        name: "IcaccsrRequest", id: 0x0, access: "A", conformance: "P, M", direction: "request",
        response: "IcaccsrResponse"
    }),
    Command(
        { name: "IcaccsrResponse", id: 0x1, conformance: "P, M", direction: "response" },
        Field({ name: "Icaccsr", id: 0x0, type: "octstr", conformance: "M", constraint: "max 600" })
    ),
    Command(
        { name: "AddIcac", id: 0x2, access: "A", conformance: "P, M", direction: "request", response: "IcacResponse" },
        Field({ name: "IcacValue", id: 0x1, type: "octstr", conformance: "M", constraint: "max 400" })
    ),
    Command(
        { name: "IcacResponse", id: 0x3, conformance: "P, M", direction: "response" },
        Field({ name: "StatusCode", id: 0x0, type: "ICACResponseStatusEnum", conformance: "M" })
    ),

    Command(
        {
            name: "OpenJointCommissioningWindow", id: 0x4, access: "A", conformance: "P, M",
            direction: "request", response: "status"
        },
        Field({ name: "CommissioningTimeout", id: 0x0, type: "uint16", conformance: "M", constraint: "desc" }),
        Field({ name: "PakePasscodeVerifier", id: 0x1, type: "octstr", conformance: "M", constraint: "97" }),
        Field({ name: "Discriminator", id: 0x2, type: "uint16", conformance: "M", constraint: "max 4095" }),
        Field({ name: "Iterations", id: 0x3, type: "uint32", conformance: "M", constraint: "1000 to 100000" }),
        Field({ name: "Salt", id: 0x4, type: "octstr", conformance: "M", constraint: "16 to 32" })
    ),

    Command({
        name: "TransferAnchorRequest", id: 0x5, access: "A", conformance: "P, M", direction: "request",
        response: "TransferAnchorResponse"
    }),
    Command(
        { name: "TransferAnchorResponse", id: 0x6, access: "A", conformance: "P, M", direction: "response" },
        Field({ name: "StatusCode", id: 0x0, type: "TransferAnchorResponseStatusEnum", conformance: "M" })
    ),
    Command({
        name: "TransferAnchorComplete", id: 0x7, access: "A", conformance: "P, M", direction: "request",
        response: "status"
    }),

    Command(
        {
            name: "AnnounceJointFabricAdministrator", id: 0x8, access: "A", conformance: "P, M",
            direction: "request", response: "status"
        },
        Field({ name: "EndpointId", id: 0x0, type: "endpoint-no", conformance: "M" })
    ),

    Datatype(
        { name: "ICACResponseStatusEnum", type: "enum8" },
        Field({ name: "Ok", id: 0x0, conformance: "M" }),
        Field({ name: "InvalidPublicKey", id: 0x1, conformance: "M" }),
        Field({ name: "InvalidIcac", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "TransferAnchorResponseStatusEnum", type: "enum8" },
        Field({ name: "Ok", id: 0x0, conformance: "M" }),
        Field({ name: "TransferAnchorStatusDatastoreBusy", id: 0x1, conformance: "M" }),
        Field({ name: "TransferAnchorStatusNoUserConsent", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "StatusCodeEnum", type: "enum8" },
        Field({ name: "Busy", id: 0x2, conformance: "P, M" }),
        Field({ name: "PakeParameterError", id: 0x3, conformance: "P, M" }),
        Field({ name: "WindowNotOpen", id: 0x4, conformance: "P, M" }),
        Field({ name: "VidNotVerified", id: 0x5, conformance: "P, M" }),
        Field({ name: "InvalidAdministratorFabricIndex", id: 0x6, conformance: "P, M" })
    )
);

MatterDefinition.children.push(JointFabricAdministrator);
