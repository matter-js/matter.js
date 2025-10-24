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
    EventElement as Event,
    FieldElement as Field,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const CommissionerControl = Cluster(
    { name: "CommissionerControl", id: 0x751 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({
        name: "SupportedDeviceCategories", id: 0x0, type: "SupportedDeviceCategoryBitmap", access: "R M",
        conformance: "M", default: 0
    }),

    Event(
        { name: "CommissioningRequestResult", id: 0x0, access: "S M", conformance: "M", priority: "info" },
        Field({ name: "RequestId", id: 0x0, type: "uint64", access: "S", conformance: "M" }),
        Field({ name: "ClientNodeId", id: 0x1, type: "node-id", access: "S", conformance: "M" }),
        Field({ name: "StatusCode", id: 0x2, type: "status", access: "S", conformance: "M", constraint: "desc" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Command(
        {
            name: "RequestCommissioningApproval", id: 0x0, access: "M", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "RequestId", id: 0x0, type: "uint64", conformance: "M" }),
        Field({ name: "VendorId", id: 0x1, type: "vendor-id", conformance: "M" }),
        Field({ name: "ProductId", id: 0x2, type: "uint16", conformance: "M" }),
        Field({ name: "Label", id: 0x3, type: "string", conformance: "O", constraint: "max 64" })
    ),

    Command(
        {
            name: "CommissionNode", id: 0x1, access: "M", conformance: "M", direction: "request",
            response: "ReverseOpenCommissioningWindow"
        },
        Field({ name: "RequestId", id: 0x0, type: "uint64", conformance: "M" }),
        Field({
            name: "ResponseTimeoutSeconds", id: 0x1, type: "uint16", conformance: "M", constraint: "30 to 120",
            default: 30
        })
    ),

    Command(
        { name: "ReverseOpenCommissioningWindow", id: 0x2, conformance: "M", direction: "response" },
        Field({ name: "CommissioningTimeout", id: 0x0, type: "uint16", conformance: "M", constraint: "desc" }),
        Field({ name: "PakePasscodeVerifier", id: 0x1, type: "octstr", conformance: "M", constraint: "97" }),
        Field({ name: "Discriminator", id: 0x2, type: "uint16", conformance: "M", constraint: "max 4095" }),
        Field({ name: "Iterations", id: 0x3, type: "uint32", conformance: "M", constraint: "1000 to 100000" }),
        Field({ name: "Salt", id: 0x4, type: "octstr", conformance: "M", constraint: "16 to 32" })
    ),

    Datatype(
        { name: "SupportedDeviceCategoryBitmap", type: "map32" },
        Field({ name: "FabricSynchronization", constraint: "0" })
    )
);

MatterDefinition.children.push(CommissionerControl);
