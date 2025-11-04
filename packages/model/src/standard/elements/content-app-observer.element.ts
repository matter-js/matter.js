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

export const ContentAppObserver = Cluster(
    { name: "ContentAppObserver", id: 0x510, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Command(
        {
            name: "ContentAppMessage", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "ContentAppMessageResponse"
        },
        Field({ name: "Data", id: 0x0, type: "string", conformance: "M", constraint: "max 500" }),
        Field({ name: "EncodingHint", id: 0x1, type: "string", conformance: "O", constraint: "max 100" })
    ),

    Command(
        { name: "ContentAppMessageResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M" }),
        Field({ name: "Data", id: 0x1, type: "string", conformance: "O", constraint: "max 500" }),
        Field({ name: "EncodingHint", id: 0x2, type: "string", conformance: "O", constraint: "max 100" })
    ),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "UnexpectedData", id: 0x1, conformance: "M" })
    )
);

MatterDefinition.children.push(ContentAppObserver);
