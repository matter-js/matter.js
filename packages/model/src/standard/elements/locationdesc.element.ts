/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const locationdesc = Datatype(
    { name: "locationdesc", type: "struct", isSeed: true },
    Field({ name: "LocationName", id: 0x0, type: "string", conformance: "M", constraint: "max 128" }),
    Field({ name: "FloorNumber", id: 0x1, type: "int16", conformance: "M", quality: "X" }),
    Field({ name: "AreaType", id: 0x2, type: "tag", conformance: "M", quality: "X" })
);

MatterDefinition.children.push(locationdesc);
