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

export const PressureMeasurement = Cluster(
    { name: "PressureMeasurement", id: 0x403 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "EXT", conformance: "O", constraint: "0", title: "Extended" })
    ),
    Attribute({
        name: "MeasuredValue", id: 0x0, type: "int16", access: "R V", conformance: "M",
        constraint: "minMeasuredValue to maxMeasuredValue", quality: "X P"
    }),
    Attribute({
        name: "MinMeasuredValue", id: 0x1, type: "int16", access: "R V", conformance: "M",
        constraint: "max 32766", quality: "X"
    }),
    Attribute({
        name: "MaxMeasuredValue", id: 0x2, type: "int16", access: "R V", conformance: "M",
        constraint: "minMeasuredValue + 1 to 32767", quality: "X"
    }),
    Attribute({ name: "Tolerance", id: 0x3, type: "uint16", access: "R V", conformance: "O", constraint: "max 2048", default: 0 }),
    Attribute({
        name: "ScaledValue", id: 0x10, type: "int16", access: "R V", conformance: "EXT",
        constraint: "minScaledValue to maxScaledValue", quality: "X"
    }),
    Attribute({
        name: "MinScaledValue", id: 0x11, type: "int16", access: "R V", conformance: "EXT",
        constraint: "max 32766", quality: "X"
    }),
    Attribute({
        name: "MaxScaledValue", id: 0x12, type: "int16", access: "R V", conformance: "EXT",
        constraint: "minScaledValue + 1 to 32767", quality: "X"
    }),
    Attribute({
        name: "ScaledTolerance", id: 0x13, type: "uint16", access: "R V", conformance: "[EXT]",
        constraint: "max 2048", default: 0
    }),
    Attribute({ name: "Scale", id: 0x14, type: "int8", access: "R V", conformance: "EXT", constraint: "min -127" })
);

MatterDefinition.children.push(PressureMeasurement);
