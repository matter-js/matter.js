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

export const PowerSourceConfiguration = Cluster(
    { name: "PowerSourceConfiguration", id: 0x2e, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "Sources", id: 0x0, type: "list", access: "R V", conformance: "M", constraint: "max 6", quality: "N" },
        Field({ name: "entry", type: "endpoint-no" })
    )
);

MatterDefinition.children.push(PowerSourceConfiguration);
