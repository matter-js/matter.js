/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { ClusterElement as Cluster, AttributeElement as Attribute } from "../../elements/index.js";

export const TemperatureMeasurement = Cluster(
    { name: "TemperatureMeasurement", id: 0x402, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 4 }),
    Attribute({
        name: "MeasuredValue", id: 0x0, type: "temperature", access: "R V", conformance: "M",
        constraint: "minMeasuredValue to maxMeasuredValue", quality: "X P"
    }),
    Attribute({
        name: "MinMeasuredValue", id: 0x1, type: "temperature", access: "R V", conformance: "M",
        constraint: "-27315 to maxMeasuredValue - 1", default: -27315, quality: "X"
    }),
    Attribute({
        name: "MaxMeasuredValue", id: 0x2, type: "temperature", access: "R V", conformance: "M",
        constraint: "minMeasuredValue + 1 to 32767", default: 32767, quality: "X"
    }),
    Attribute({ name: "Tolerance", id: 0x3, type: "uint16", access: "R V", conformance: "O", constraint: "max 2048", default: 0 })
);

MatterDefinition.children.push(TemperatureMeasurement);
