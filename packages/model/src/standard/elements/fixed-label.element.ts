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

export const FixedLabel = Cluster(
    { name: "FixedLabel", id: 0x40, type: "Label", classification: "endpoint" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "LabelList", id: 0x0, type: "list", access: "R V", conformance: "M", default: [], quality: "N" },
        Field({ name: "entry", type: "LabelStruct" })
    )
);

MatterDefinition.children.push(FixedLabel);
