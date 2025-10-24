/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const ThreeLevelAutoEnum = Datatype(
    { name: "ThreeLevelAutoEnum", type: "enum8", isSeed: true },
    Field({ name: "Auto", id: 0x0, conformance: "M" }),
    Field({ name: "Low", id: 0x1, conformance: "M" }),
    Field({ name: "Medium", id: 0x2, conformance: "M" }),
    Field({ name: "High", id: 0x3, conformance: "M" })
);

MatterDefinition.children.push(ThreeLevelAutoEnum);
