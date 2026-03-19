/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const OccupancyBitmap = Datatype(
    { name: "OccupancyBitmap", type: "map8" },
    Field({ name: "Occupied", constraint: "0" })
);
MatterDefinition.children.push(OccupancyBitmap);
