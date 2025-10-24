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

export const OtaSoftwareUpdateProvider = Cluster(
    { name: "OtaSoftwareUpdateProvider", id: 0x29 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Command(
        {
            name: "QueryImage", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "QueryImageResponse"
        },
        Field({ name: "VendorId", id: 0x0, type: "vendor-id", conformance: "M" }),
        Field({ name: "ProductId", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "SoftwareVersion", id: 0x2, type: "uint32", conformance: "M" }),
        Field(
            { name: "ProtocolsSupported", id: 0x3, type: "list", conformance: "M", constraint: "max 8" },
            Field({ name: "entry", type: "DownloadProtocolEnum" })
        ),
        Field({ name: "HardwareVersion", id: 0x4, type: "uint16", conformance: "O" }),
        Field({ name: "Location", id: 0x5, type: "string", conformance: "O", constraint: "2" }),
        Field({ name: "RequestorCanConsent", id: 0x6, type: "bool", conformance: "O", default: false }),
        Field({ name: "MetadataForProvider", id: 0x7, type: "octstr", conformance: "O", constraint: "max 512" })
    ),

    Command(
        { name: "QueryImageResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M" }),
        Field({ name: "DelayedActionTime", id: 0x1, type: "uint32", conformance: "Status == Busy" }),
        Field({ name: "ImageUri", id: 0x2, type: "string", conformance: "Status == UpdateAvailable", constraint: "max 256" }),
        Field({ name: "SoftwareVersion", id: 0x3, type: "uint32", conformance: "Status == UpdateAvailable" }),
        Field({
            name: "SoftwareVersionString", id: 0x4, type: "string", conformance: "Status == UpdateAvailable",
            constraint: "1 to 64"
        }),
        Field({
            name: "UpdateToken", id: 0x5, type: "octstr", conformance: "Status == UpdateAvailable",
            constraint: "8 to 32"
        }),
        Field({ name: "UserConsentNeeded", id: 0x6, type: "bool", conformance: "O", default: false }),
        Field({ name: "MetadataForRequestor", id: 0x7, type: "octstr", conformance: "O", constraint: "max 512" })
    ),

    Command(
        {
            name: "ApplyUpdateRequest", id: 0x2, access: "O", conformance: "M", direction: "request",
            response: "ApplyUpdateResponse"
        },
        Field({ name: "UpdateToken", id: 0x0, type: "octstr", conformance: "M", constraint: "8 to 32" }),
        Field({ name: "NewVersion", id: 0x1, type: "uint32", conformance: "M" })
    ),

    Command(
        { name: "ApplyUpdateResponse", id: 0x3, conformance: "M", direction: "response" },
        Field({ name: "Action", id: 0x0, type: "ApplyUpdateActionEnum", conformance: "M" }),
        Field({ name: "DelayedActionTime", id: 0x1, type: "uint32", conformance: "M" })
    ),

    Command(
        {
            name: "NotifyUpdateApplied", id: 0x4, access: "O", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "UpdateToken", id: 0x0, type: "octstr", conformance: "M", constraint: "8 to 32" }),
        Field({ name: "SoftwareVersion", id: 0x1, type: "uint32", conformance: "M" })
    ),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "UpdateAvailable", id: 0x0, conformance: "M" }),
        Field({ name: "Busy", id: 0x1, conformance: "M" }),
        Field({ name: "NotAvailable", id: 0x2, conformance: "M" }),
        Field({ name: "DownloadProtocolNotSupported", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "ApplyUpdateActionEnum", type: "enum8" },
        Field({ name: "Proceed", id: 0x0, conformance: "M" }),
        Field({ name: "AwaitNextAction", id: 0x1, conformance: "M" }),
        Field({ name: "Discontinue", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "DownloadProtocolEnum", type: "enum8" },
        Field({ name: "BdxSynchronous", id: 0x0, conformance: "M" }),
        Field({ name: "BdxAsynchronous", id: 0x1, conformance: "O" }),
        Field({ name: "Https", id: 0x2, conformance: "O" }),
        Field({ name: "VendorSpecific", id: 0x3, conformance: "O" })
    )
);

MatterDefinition.children.push(OtaSoftwareUpdateProvider);
