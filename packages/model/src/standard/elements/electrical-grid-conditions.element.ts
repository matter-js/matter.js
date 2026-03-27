/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    EventElement as Event,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const ElectricalGridConditions = Cluster(
    { name: "ElectricalGridConditions", id: 0xa0, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "FORE", conformance: "O", constraint: "0", title: "Forecasting" })
    ),
    Attribute({ name: "LocalGenerationAvailable", id: 0x0, type: "bool", access: "RW VO", conformance: "M", quality: "X" }),
    Attribute({
        name: "CurrentConditions", id: 0x1, type: "ElectricalGridConditionsStruct", access: "R V",
        conformance: "M", quality: "X"
    }),
    Attribute(
        { name: "ForecastConditions", id: 0x2, type: "list", access: "R V", conformance: "FORE", constraint: "max 56" },
        Field({ name: "entry", type: "ElectricalGridConditionsStruct" })
    ),
    Event(
        { name: "CurrentConditionsChanged", id: 0x0, access: "V", conformance: "O", priority: "info" },
        Field({ name: "CurrentConditions", id: 0x0, type: "ElectricalGridConditionsStruct", conformance: "M", quality: "X" })
    ),

    Datatype(
        { name: "ThreeLevelEnum", type: "enum8" },
        Field({ name: "Low", id: 0x0, conformance: "M" }),
        Field({ name: "Medium", id: 0x1, conformance: "M" }),
        Field({ name: "High", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "ElectricalGridConditionsStruct", type: "struct" },
        Field({ name: "PeriodStart", id: 0x0, type: "epoch-s", conformance: "M" }),
        Field({
            name: "PeriodEnd", id: 0x1, type: "epoch-s", conformance: "M", constraint: "min periodStart + 1",
            quality: "X"
        }),
        Field({ name: "GridCarbonIntensity", id: 0x2, type: "int16", conformance: "M" }),
        Field({ name: "GridCarbonLevel", id: 0x3, type: "ThreeLevelEnum", conformance: "M" }),
        Field({ name: "LocalCarbonIntensity", id: 0x4, type: "int16", conformance: "M" }),
        Field({ name: "LocalCarbonLevel", id: 0x5, type: "ThreeLevelEnum", conformance: "M" })
    )
);

MatterDefinition.children.push(ElectricalGridConditions);
