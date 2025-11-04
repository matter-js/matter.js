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
    FieldElement as Field
} from "../../elements/index.js";

export const PowerTopology = Cluster(
    { name: "PowerTopology", id: 0x9c, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "NODE", conformance: "O.a", constraint: "0", title: "NodeTopology" }),
        Field({ name: "TREE", conformance: "O.a", constraint: "1", title: "TreeTopology" }),
        Field({ name: "SET", conformance: "O.a", constraint: "2", title: "SetTopology" }),
        Field({ name: "DYPF", conformance: "[SET]", constraint: "3", title: "DynamicPowerFlow" })
    ),

    Attribute(
        {
            name: "AvailableEndpoints", id: 0x0, type: "list", access: "R V", conformance: "SET",
            constraint: "max 20", quality: "F"
        },
        Field({ name: "entry", type: "endpoint-no" })
    ),

    Attribute(
        {
            name: "ActiveEndpoints", id: 0x1, type: "list", access: "R V", conformance: "DYPF",
            constraint: "max 20", quality: "N"
        },
        Field({ name: "entry", type: "endpoint-no" })
    )
);

MatterDefinition.children.push(PowerTopology);
