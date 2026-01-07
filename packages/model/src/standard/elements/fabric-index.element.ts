/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { FieldElement as Field } from "../../elements/index.js";

export const FabricIndex = Field({
    name: "FabricIndex", id: 0xfe, type: "fabric-idx", access: "R F V", conformance: "M",
    constraint: "1 to 254", isSeed: true
});
MatterDefinition.children.push(FabricIndex);
