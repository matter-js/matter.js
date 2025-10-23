/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { ClusterElement as Cluster, AttributeElement as Attribute } from "../../elements/index.js";

export const FlowMeasurement = Cluster(
    { name: "FlowMeasurement", id: 0x404 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),
    Attribute({
        name: "MeasuredValue", id: 0x0, type: "uint16", access: "R V", conformance: "M",
        constraint: "minMeasuredValue to maxMeasuredValue", quality: "X P"
    }),
    Attribute({
        name: "MinMeasuredValue", id: 0x1, type: "uint16", access: "R V", conformance: "M",
        constraint: "max 65533", quality: "X"
    }),
    Attribute({
        name: "MaxMeasuredValue", id: 0x2, type: "uint16", access: "R V", conformance: "M",
        constraint: "min minMeasuredValue + 1", quality: "X"
    }),
    Attribute({ name: "Tolerance", id: 0x3, type: "uint16", access: "R V", conformance: "O", constraint: "max 2048", default: 0 })
);

MatterDefinition.children.push(FlowMeasurement);
