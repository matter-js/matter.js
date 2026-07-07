/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const PowerThresholdStruct = Datatype(
    { name: "PowerThresholdStruct", type: "struct" },
    Field({ name: "PowerThreshold", id: 0x0, type: "power-mW", conformance: "O.b" }),
    Field({ name: "ApparentPowerThreshold", id: 0x1, type: "power-mVA", conformance: "O.b" }),
    Field({ name: "PowerThresholdSource", id: 0x2, type: "PowerThresholdSourceEnum", conformance: "M", quality: "X" })
);

MatterDefinition.children.push(PowerThresholdStruct);
