/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const HoldTimeLimitsStruct = Datatype(
    { name: "HoldTimeLimitsStruct", type: "struct" },
    Field({ name: "HoldTimeMin", id: 0x0, type: "uint16", conformance: "M", constraint: "min 1" }),
    Field({ name: "HoldTimeMax", id: 0x1, type: "uint16", conformance: "M", constraint: "min maxOf(holdTimeMin, 10)" }),
    Field({ name: "HoldTimeDefault", id: 0x2, type: "uint16", conformance: "M", constraint: "holdTimeMin to holdTimeMax" })
);

MatterDefinition.children.push(HoldTimeLimitsStruct);
