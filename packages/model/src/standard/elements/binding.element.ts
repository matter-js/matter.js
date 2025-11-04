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

export const Binding = Cluster(
    { name: "Binding", id: 0x1e, classification: "endpoint" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        {
            name: "Binding", id: 0x0, type: "list", access: "RW F VM", conformance: "M", constraint: "desc",
            default: [], quality: "N"
        },
        Field({ name: "entry", type: "TargetStruct" })
    ),

    Datatype(
        { name: "TargetStruct", type: "struct" },
        Field({ name: "Node", id: 0x1, type: "node-id", access: "F", conformance: "Endpoint" }),
        Field({ name: "Group", id: 0x2, type: "group-id", access: "F", conformance: "!Endpoint", constraint: "min 1" }),
        Field({ name: "Endpoint", id: 0x3, type: "endpoint-no", access: "F", conformance: "!Group" }),
        Field({ name: "Cluster", id: 0x4, type: "cluster-id", access: "F", conformance: "O" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    )
);

MatterDefinition.children.push(Binding);
