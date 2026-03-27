/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const PowerThresholdSourceEnum = Datatype(
    { name: "PowerThresholdSourceEnum", type: "enum8" },
    Field({ name: "Contract", id: 0x0, conformance: "M" }),
    Field({ name: "Regulator", id: 0x1, conformance: "M" }),
    Field({ name: "Equipment", id: 0x2, conformance: "M" })
);

MatterDefinition.children.push(PowerThresholdSourceEnum);
