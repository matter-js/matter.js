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

export const TargetNavigator = Cluster(
    { name: "TargetNavigator", id: 0x505, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "TargetList", id: 0x0, type: "list", access: "R V", conformance: "M" },
        Field({ name: "entry", type: "TargetInfoStruct" })
    ),
    Attribute({
        name: "CurrentTarget", id: 0x1, type: "uint8", access: "R V", conformance: "O", constraint: "desc",
        default: 255
    }),

    Event(
        { name: "TargetUpdated", id: 0x0, access: "V", conformance: "O", priority: "info" },
        Field(
            { name: "TargetList", id: 0x0, type: "list", conformance: "O" },
            Field({ name: "entry", type: "TargetInfoStruct" })
        ),
        Field({ name: "CurrentTarget", id: 0x1, type: "uint8", conformance: "O", constraint: "desc", default: 255 }),
        Field({ name: "Data", id: 0x2, type: "octstr", conformance: "O", constraint: "max 900" })
    ),

    Command(
        {
            name: "NavigateTarget", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "NavigateTargetResponse"
        },
        Field({ name: "Target", id: 0x0, type: "uint8", conformance: "M" }),
        Field({ name: "Data", id: 0x1, type: "string", conformance: "O" })
    ),

    Command(
        { name: "NavigateTargetResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M" }),
        Field({ name: "Data", id: 0x1, type: "string", conformance: "O", constraint: "any" })
    ),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "TargetNotFound", id: 0x1, conformance: "M" }),
        Field({ name: "NotAllowed", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "TargetInfoStruct", type: "struct" },
        Field({ name: "Identifier", id: 0x0, type: "uint8", conformance: "M", constraint: "max 254" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "M" })
    )
);

MatterDefinition.children.push(TargetNavigator);
