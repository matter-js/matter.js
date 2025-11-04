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

export const UserLabel = Cluster(
    { name: "UserLabel", id: 0x41, type: "Label", classification: "endpoint" },

    Attribute(
        {
            name: "LabelList", id: 0x0, type: "list", access: "RW VM", conformance: "M", constraint: "min 0",
            default: [], quality: "N"
        },
        Field({ name: "entry", type: "LabelStruct" })
    )
);

MatterDefinition.children.push(UserLabel);
