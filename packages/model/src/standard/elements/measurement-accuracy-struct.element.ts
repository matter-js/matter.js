/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const MeasurementAccuracyStruct = Datatype(
    { name: "MeasurementAccuracyStruct", type: "struct" },
    Field({ name: "MeasurementType", id: 0x0, type: "MeasurementTypeEnum", conformance: "M" }),
    Field({ name: "Measured", id: 0x1, type: "bool", conformance: "M" }),
    Field({ name: "MinMeasuredValue", id: 0x2, type: "int64", conformance: "M" }),
    Field({ name: "MaxMeasuredValue", id: 0x3, type: "int64", conformance: "M" }),
    Field(
        { name: "AccuracyRanges", id: 0x4, type: "list", conformance: "M", constraint: "min 1" },
        Field({ name: "entry", type: "MeasurementAccuracyRangeStruct" })
    )
);

MatterDefinition.children.push(MeasurementAccuracyStruct);
