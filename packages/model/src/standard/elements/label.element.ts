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
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const Label = Cluster(
    { name: "Label", classification: "endpoint" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "LabelList", id: 0x0, type: "list", conformance: "M", constraint: "derived", default: [] },
        Field({ name: "entry", type: "LabelStruct" })
    ),
    Datatype(
        { name: "LabelStruct", type: "struct" },
        Field({ name: "Label", id: 0x0, type: "string", conformance: "M", constraint: "max 16" }),
        Field({ name: "Value", id: 0x1, type: "string", conformance: "M", constraint: "max 16" })
    )
);

MatterDefinition.children.push(Label);
