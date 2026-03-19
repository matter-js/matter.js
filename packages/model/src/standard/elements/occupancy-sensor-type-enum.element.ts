/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const OccupancySensorTypeEnum = Datatype(
    { name: "OccupancySensorTypeEnum", type: "enum8" },
    Field({ name: "Pir", id: 0x0, conformance: "M" }),
    Field({ name: "Ultrasonic", id: 0x1, conformance: "M" }),
    Field({ name: "PirAndUltrasonic", id: 0x2, conformance: "M" }),
    Field({ name: "PhysicalContact", id: 0x3, conformance: "M" })
);

MatterDefinition.children.push(OccupancySensorTypeEnum);
