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

export const OperationalState = Cluster(
    { name: "OperationalState", id: 0x60, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),

    Attribute(
        {
            name: "PhaseList", id: 0x0, type: "list", access: "R V", conformance: "M",
            constraint: "max 32[max 64]", quality: "X"
        },
        Field({ name: "entry", type: "string" })
    ),

    Attribute({ name: "CurrentPhase", id: 0x1, type: "uint8", access: "R V", conformance: "M", constraint: "desc", quality: "X" }),
    Attribute({
        name: "CountdownTime", id: 0x2, type: "elapsed-s", access: "R V", conformance: "O",
        constraint: "max 259200", default: null, quality: "X Q"
    }),
    Attribute(
        { name: "OperationalStateList", id: 0x3, type: "list", access: "R V", conformance: "M", constraint: "desc" },
        Field({ name: "entry", type: "OperationalStateStruct" })
    ),
    Attribute({ name: "OperationalState", id: 0x4, type: "OperationalStateEnum", access: "R V", conformance: "M" }),
    Attribute({
        name: "OperationalError", id: 0x5, type: "ErrorStateStruct", access: "R V", conformance: "M",
        constraint: "desc"
    }),
    Event(
        { name: "OperationalError", id: 0x0, access: "V", conformance: "M", priority: "critical" },
        Field({ name: "ErrorState", id: 0x0, type: "ErrorStateStruct", conformance: "M" })
    ),

    Event(
        { name: "OperationCompletion", id: 0x1, access: "V", conformance: "O", priority: "info" },
        Field({ name: "CompletionErrorCode", id: 0x0, type: "enum8", conformance: "M" }),
        Field({ name: "TotalOperationalTime", id: 0x1, type: "elapsed-s", conformance: "O", quality: "X" }),
        Field({ name: "PausedTime", id: 0x2, type: "elapsed-s", conformance: "O", quality: "X" })
    ),

    Command({
        name: "Pause", id: 0x0, access: "O", conformance: "Resume, O", direction: "request",
        response: "OperationalCommandResponse"
    }),
    Command({
        name: "Stop", id: 0x1, access: "O", conformance: "Start, O", direction: "request",
        response: "OperationalCommandResponse"
    }),
    Command({
        name: "Start", id: 0x2, access: "O", conformance: "O", direction: "request",
        response: "OperationalCommandResponse"
    }),
    Command({
        name: "Resume", id: 0x3, access: "O", conformance: "Pause, O", direction: "request",
        response: "OperationalCommandResponse"
    }),

    Command(
        {
            name: "OperationalCommandResponse", id: 0x4, access: "O",
            conformance: "Pause | Stop | Start | Resume", direction: "response"
        },
        Field({ name: "CommandResponseState", id: 0x0, type: "ErrorStateStruct", conformance: "M" })
    ),

    Datatype(
        { name: "OperationalStateEnum", type: "enum8" },
        Field({ name: "Stopped", id: 0x0, conformance: "M" }),
        Field({ name: "Running", id: 0x1, conformance: "M" }),
        Field({ name: "Paused", id: 0x2, conformance: "M" }),
        Field({ name: "Error", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "OperationalStateStruct", type: "struct" },
        Field({ name: "OperationalStateId", id: 0x0, type: "OperationalStateEnum", conformance: "M", default: 0 }),
        Field({
            name: "OperationalStateLabel", id: 0x1, type: "string",
            conformance: "OperationalStateID >= 128 & OperationalStateID <= 191", constraint: "max 64"
        })
    ),

    Datatype(
        { name: "ErrorStateEnum", type: "enum8" },
        Field({ name: "NoError", id: 0x0, conformance: "M" }),
        Field({ name: "UnableToStartOrResume", id: 0x1, conformance: "M" }),
        Field({ name: "UnableToCompleteOperation", id: 0x2, conformance: "M" }),
        Field({ name: "CommandInvalidInState", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "ErrorStateStruct", type: "struct" },
        Field({ name: "ErrorStateId", id: 0x0, type: "ErrorStateEnum", conformance: "M", default: 0 }),
        Field({
            name: "ErrorStateLabel", id: 0x1, type: "string",
            conformance: "ErrorStateID >= 128 & ErrorStateID <= 191", constraint: "max 64"
        }),
        Field({ name: "ErrorStateDetails", id: 0x2, type: "string", conformance: "O", constraint: "max 64" })
    )
);

MatterDefinition.children.push(OperationalState);
