/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const price = Datatype(
    { name: "price", type: "struct", isSeed: true },
    Field({ name: "Amount", id: 0x0, type: "money", conformance: "M" }),
    Field({ name: "Currency", id: 0x1, type: "currency", conformance: "M" })
);
MatterDefinition.children.push(price);
