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
    DatatypeElement as Datatype,
    FieldElement as Field
} from "../../elements/index.js";

export const IlluminanceMeasurement = Cluster(
    { name: "IlluminanceMeasurement", id: 0x400, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),
    Attribute({
        name: "MeasuredValue", id: 0x0, type: "uint16", access: "R V", conformance: "M",
        constraint: "0, minMeasuredValue to maxMeasuredValue", quality: "X P"
    }),
    Attribute({
        name: "MinMeasuredValue", id: 0x1, type: "uint16", access: "R V", conformance: "M",
        constraint: "1 to 65533", quality: "X"
    }),
    Attribute({
        name: "MaxMeasuredValue", id: 0x2, type: "uint16", access: "R V", conformance: "M",
        constraint: "min minMeasuredValue + 1", quality: "X"
    }),
    Attribute({ name: "Tolerance", id: 0x3, type: "uint16", access: "R V", conformance: "O", constraint: "max 2048" }),
    Attribute({ name: "LightSensorType", id: 0x4, type: "uint8", access: "R V", conformance: "O", default: null, quality: "X" }),
    Datatype(
        { name: "LightSensorTypeEnum", type: "enum8" },
        Field({ name: "Photodiode", id: 0x0, conformance: "M" }),
        Field({ name: "Cmos", id: 0x1, conformance: "M" })
    )
);

MatterDefinition.children.push(IlluminanceMeasurement);
