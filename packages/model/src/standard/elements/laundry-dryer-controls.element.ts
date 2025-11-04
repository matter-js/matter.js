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

export const LaundryDryerControls = Cluster(
    { name: "LaundryDryerControls", id: 0x4a, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        {
            name: "SupportedDrynessLevels", id: 0x0, type: "list", access: "R V", conformance: "M",
            constraint: "1 to 4"
        },
        Field({ name: "entry", type: "DrynessLevelEnum" })
    ),

    Attribute({
        name: "SelectedDrynessLevel", id: 0x1, type: "DrynessLevelEnum", access: "RW VO", conformance: "M",
        constraint: "desc", quality: "X"
    }),

    Datatype(
        { name: "DrynessLevelEnum", type: "enum8" },
        Field({ name: "Low", id: 0x0, conformance: "M" }),
        Field({ name: "Normal", id: 0x1, conformance: "M" }),
        Field({ name: "Extra", id: 0x2, conformance: "M" }),
        Field({ name: "Max", id: 0x3, conformance: "M" })
    )
);

MatterDefinition.children.push(LaundryDryerControls);
