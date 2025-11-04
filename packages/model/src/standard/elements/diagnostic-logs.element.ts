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

export const DiagnosticLogs = Cluster(
    { name: "DiagnosticLogs", id: 0x32, classification: "node", quality: "K" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Command(
        {
            name: "RetrieveLogsRequest", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "RetrieveLogsResponse"
        },
        Field({ name: "Intent", id: 0x0, type: "IntentEnum", conformance: "M" }),
        Field({ name: "RequestedProtocol", id: 0x1, type: "TransferProtocolEnum", conformance: "M" }),
        Field({ name: "TransferFileDesignator", id: 0x2, type: "string", conformance: "O", constraint: "max 32" })
    ),

    Command(
        { name: "RetrieveLogsResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M" }),
        Field({ name: "LogContent", id: 0x1, type: "octstr", conformance: "M", constraint: "max 1024" }),
        Field({ name: "UtcTimeStamp", id: 0x2, type: "epoch-us", conformance: "O" }),
        Field({ name: "TimeSinceBoot", id: 0x3, type: "systime-us", conformance: "O" })
    ),

    Datatype(
        { name: "IntentEnum", type: "enum8" },
        Field({ name: "EndUserSupport", id: 0x0, conformance: "M" }),
        Field({ name: "NetworkDiag", id: 0x1, conformance: "M" }),
        Field({ name: "CrashLogs", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "Exhausted", id: 0x1, conformance: "M" }),
        Field({ name: "NoLogs", id: 0x2, conformance: "M" }),
        Field({ name: "Busy", id: 0x3, conformance: "M" }),
        Field({ name: "Denied", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "TransferProtocolEnum", type: "enum8" },
        Field({ name: "ResponsePayload", id: 0x0, conformance: "M" }),
        Field({ name: "Bdx", id: 0x1, conformance: "M" })
    )
);

MatterDefinition.children.push(DiagnosticLogs);
