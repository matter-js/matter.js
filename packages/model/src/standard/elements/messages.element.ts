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
    EventElement as Event,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const Messages = Cluster(
    { name: "Messages", id: 0x97, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "CONF", conformance: "O", constraint: "0", title: "ReceivedConfirmation" }),
        Field({ name: "RESP", conformance: "[CONF]", constraint: "1", title: "ConfirmationResponse" }),
        Field({ name: "RPLY", conformance: "[CONF]", constraint: "2", title: "ConfirmationReply" }),
        Field({ name: "PROT", conformance: "O", constraint: "3", title: "ProtectedMessages" })
    ),

    Attribute(
        { name: "Messages", id: 0x0, type: "list", access: "R F V", conformance: "M", constraint: "max 8" },
        Field({ name: "entry", type: "MessageStruct" })
    ),
    Attribute(
        { name: "ActiveMessageIDs", id: 0x1, type: "list", access: "R V", conformance: "M", constraint: "max 8" },
        Field({ name: "entry", type: "MessageID" })
    ),
    Event(
        { name: "MessageQueued", id: 0x0, access: "S V", conformance: "M", priority: "info" },
        Field({ name: "MessageId", id: 0x0, type: "MessageID", access: "S", conformance: "M" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),
    Event(
        { name: "MessagePresented", id: 0x1, access: "S V", conformance: "M", priority: "info" },
        Field({ name: "MessageId", id: 0x0, type: "MessageID", access: "S", conformance: "M" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Event(
        { name: "MessageComplete", id: 0x2, access: "S V", conformance: "M", priority: "info" },
        Field({ name: "MessageId", id: 0x0, type: "MessageID", access: "S", conformance: "M" }),
        Field({ name: "ResponseId", id: 0x1, type: "uint32", access: "S", conformance: "RESP", quality: "X" }),
        Field({
            name: "Reply", id: 0x2, type: "string", access: "S", conformance: "RPLY", constraint: "max 256",
            quality: "X"
        }),
        Field({
            name: "FutureMessagesPreference", id: 0x3, type: "FutureMessagePreferenceEnum", access: "S",
            conformance: "M", quality: "X"
        }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Command(
        {
            name: "PresentMessagesRequest", id: 0x0, access: "F O", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "MessageId", id: 0x0, type: "MessageID", conformance: "M" }),
        Field({ name: "Priority", id: 0x1, type: "MessagePriorityEnum", conformance: "M" }),
        Field({ name: "MessageControl", id: 0x2, type: "MessageControlBitmap", conformance: "M" }),
        Field({ name: "StartTime", id: 0x3, type: "epoch-s", conformance: "M", quality: "X" }),
        Field({ name: "Duration", id: 0x4, type: "uint64", conformance: "M", quality: "X" }),
        Field({ name: "MessageText", id: 0x5, type: "string", conformance: "M", constraint: "max 256" }),
        Field(
            { name: "Responses", id: 0x6, type: "list", conformance: "RESP", constraint: "max 4" },
            Field({ name: "entry", type: "MessageResponseOptionStruct" })
        )
    ),

    Command(
        {
            name: "CancelMessagesRequest", id: 0x1, access: "F O", conformance: "M", direction: "request",
            response: "status"
        },
        Field(
            { name: "MessageIDs", id: 0x0, type: "list", conformance: "M", constraint: "max 8" },
            Field({ name: "entry", type: "MessageID" })
        )
    ),

    Datatype({ name: "MessageID", type: "octstr", constraint: "16" }),

    Datatype(
        { name: "MessageControlBitmap", type: "map16" },
        Field({ name: "ConfirmationRequired", constraint: "0" }),
        Field({ name: "ResponseRequired", constraint: "1" }),
        Field({ name: "ReplyMessage", constraint: "2" }),
        Field({ name: "MessageConfirmed", constraint: "3" }),
        Field({ name: "MessageProtected", constraint: "4" })
    ),

    Datatype(
        { name: "FutureMessagePreferenceEnum", type: "enum8" },
        Field({ name: "Allowed", id: 0x0, conformance: "M" }),
        Field({ name: "Increased", id: 0x1, conformance: "M" }),
        Field({ name: "Reduced", id: 0x2, conformance: "M" }),
        Field({ name: "Disallowed", id: 0x3, conformance: "M" }),
        Field({ name: "Banned", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "MessagePriorityEnum", type: "enum8" },
        Field({ name: "Low", id: 0x0, conformance: "M" }),
        Field({ name: "Medium", id: 0x1, conformance: "M" }),
        Field({ name: "High", id: 0x2, conformance: "M" }),
        Field({ name: "Critical", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "MessageStruct", type: "struct" },
        Field({ name: "MessageId", id: 0x0, type: "MessageID", access: "S", conformance: "M" }),
        Field({ name: "Priority", id: 0x1, type: "MessagePriorityEnum", access: "S", conformance: "M" }),
        Field({ name: "MessageControl", id: 0x2, type: "MessageControlBitmap", access: "S", conformance: "M" }),
        Field({ name: "StartTime", id: 0x3, type: "epoch-s", access: "S", conformance: "M", quality: "X" }),
        Field({ name: "Duration", id: 0x4, type: "uint64", access: "S", conformance: "M", quality: "X" }),
        Field({ name: "MessageText", id: 0x5, type: "string", access: "S", conformance: "M", constraint: "max 256" }),
        Field(
            { name: "Responses", id: 0x6, type: "list", access: "S", conformance: "RESP", constraint: "max 4" },
            Field({ name: "entry", type: "MessageResponseOptionStruct" })
        ),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype(
        { name: "MessageResponseOptionStruct", type: "struct" },
        Field({ name: "MessageResponseId", id: 0x0, type: "uint32", conformance: "M", constraint: "min 1" }),
        Field({ name: "Label", id: 0x1, type: "string", conformance: "M", constraint: "max 32" })
    )
);

MatterDefinition.children.push(Messages);
