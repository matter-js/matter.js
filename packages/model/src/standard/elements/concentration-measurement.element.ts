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

export const ConcentrationMeasurement = Cluster(
    { name: "ConcentrationMeasurement", classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "MEA", conformance: "O.a+", constraint: "0", title: "NumericMeasurement" }),
        Field({ name: "LEV", conformance: "O.a+", constraint: "1", title: "LevelIndication" }),
        Field({ name: "MED", conformance: "[LEV]", constraint: "2", title: "MediumLevel" }),
        Field({ name: "CRI", conformance: "[LEV]", constraint: "3", title: "CriticalLevel" }),
        Field({ name: "PEA", conformance: "[MEA]", constraint: "4", title: "PeakMeasurement" }),
        Field({ name: "AVG", conformance: "[MEA]", constraint: "5", title: "AverageMeasurement" })
    ),

    Attribute({
        name: "MeasuredValue", id: 0x0, type: "single", access: "R V", conformance: "MEA",
        constraint: "minMeasuredValue to maxMeasuredValue", quality: "X P"
    }),
    Attribute({ name: "MinMeasuredValue", id: 0x1, type: "single", access: "R V", conformance: "MEA", quality: "X" }),
    Attribute({
        name: "MaxMeasuredValue", id: 0x2, type: "single", access: "R V", conformance: "MEA",
        constraint: "min minMeasuredValue", quality: "X"
    }),
    Attribute({
        name: "PeakMeasuredValue", id: 0x3, type: "single", access: "R V", conformance: "PEA",
        constraint: "minMeasuredValue to maxMeasuredValue", quality: "X P"
    }),
    Attribute({
        name: "PeakMeasuredValueWindow", id: 0x4, type: "elapsed-s", access: "R V", conformance: "PEA",
        constraint: "max 604800", quality: "P"
    }),
    Attribute({
        name: "AverageMeasuredValue", id: 0x5, type: "single", access: "R V", conformance: "AVG",
        constraint: "minMeasuredValue to maxMeasuredValue", quality: "X P"
    }),
    Attribute({
        name: "AverageMeasuredValueWindow", id: 0x6, type: "elapsed-s", access: "R V", conformance: "AVG",
        constraint: "max 604800", quality: "P"
    }),
    Attribute({ name: "Uncertainty", id: 0x7, type: "single", access: "R V", conformance: "[MEA]", constraint: "ms" }),
    Attribute({ name: "MeasurementUnit", id: 0x8, type: "MeasurementUnitEnum", access: "R V", conformance: "MEA", quality: "F" }),
    Attribute({
        name: "MeasurementMedium", id: 0x9, type: "MeasurementMediumEnum", access: "R V", conformance: "M",
        quality: "F"
    }),
    Attribute({ name: "LevelValue", id: 0xa, type: "LevelValueEnum", access: "R V", conformance: "LEV" }),

    Datatype(
        { name: "MeasurementUnitEnum", type: "enum8" },
        Field({ name: "Ppm", id: 0x0, conformance: "MEA" }),
        Field({ name: "Ppb", id: 0x1, conformance: "MEA" }),
        Field({ name: "Ppt", id: 0x2, conformance: "MEA" }),
        Field({ name: "Mgm3", id: 0x3, conformance: "MEA" }),
        Field({ name: "Ugm3", id: 0x4, conformance: "MEA" }),
        Field({ name: "Ngm3", id: 0x5, conformance: "MEA" }),
        Field({ name: "Pm3", id: 0x6, conformance: "MEA" }),
        Field({ name: "Bqm3", id: 0x7, conformance: "MEA" })
    ),

    Datatype(
        { name: "MeasurementMediumEnum", type: "enum8" },
        Field({ name: "Air", id: 0x0, conformance: "M" }),
        Field({ name: "Water", id: 0x1, conformance: "M" }),
        Field({ name: "Soil", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "LevelValueEnum", type: "enum8" },
        Field({ name: "Unknown", id: 0x0, conformance: "M" }),
        Field({ name: "Low", id: 0x1, conformance: "M" }),
        Field({ name: "Medium", id: 0x2, conformance: "MED" }),
        Field({ name: "High", id: 0x3, conformance: "M" }),
        Field({ name: "Critical", id: 0x4, conformance: "CRI" })
    )
);

MatterDefinition.children.push(ConcentrationMeasurement);
