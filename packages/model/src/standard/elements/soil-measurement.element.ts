/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { ClusterElement as Cluster, AttributeElement as Attribute } from "../../elements/index.js";

export const SoilMeasurement = Cluster(
    { name: "SoilMeasurement", id: 0x430, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({
        name: "SoilMoistureMeasurementLimits", id: 0x0, type: "MeasurementAccuracyStruct", access: "R V",
        conformance: "M", quality: "F"
    }),
    Attribute({
        name: "SoilMoistureMeasuredValue", id: 0x1, type: "percent", access: "R V", conformance: "M",
        constraint: "soilMoistureMeasurementLimits.minMeasuredValue to soilMoistureMeasurementLimits.maxMeasuredValue",
        quality: "X"
    })
);

MatterDefinition.children.push(SoilMeasurement);
