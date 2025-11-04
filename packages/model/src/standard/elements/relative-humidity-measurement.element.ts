/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { ClusterElement as Cluster, AttributeElement as Attribute } from "../../elements/index.js";

export const RelativeHumidityMeasurement = Cluster(
    { name: "RelativeHumidityMeasurement", id: 0x405, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),
    Attribute({
        name: "MeasuredValue", id: 0x0, type: "uint16", access: "R V", conformance: "M",
        constraint: "minMeasuredValue to maxMeasuredValue", quality: "X P"
    }),
    Attribute({
        name: "MinMeasuredValue", id: 0x1, type: "uint16", access: "R V", conformance: "M",
        constraint: "max 9999", quality: "X"
    }),
    Attribute({
        name: "MaxMeasuredValue", id: 0x2, type: "uint16", access: "R V", conformance: "M",
        constraint: "minMeasuredValue + 1 to 10000", quality: "X"
    }),
    Attribute({ name: "Tolerance", id: 0x3, type: "uint16", access: "R V", conformance: "O", constraint: "max 2048" })
);

MatterDefinition.children.push(RelativeHumidityMeasurement);
