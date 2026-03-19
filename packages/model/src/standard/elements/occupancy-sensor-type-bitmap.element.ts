/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const OccupancySensorTypeBitmap = Datatype(
    { name: "OccupancySensorTypeBitmap", type: "map8" },
    Field({ name: "Pir", constraint: "0" }),
    Field({ name: "Ultrasonic", constraint: "1" }),
    Field({ name: "PhysicalContact", constraint: "2" })
);

MatterDefinition.children.push(OccupancySensorTypeBitmap);
