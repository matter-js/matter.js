/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const currency = Datatype(
    { name: "currency", type: "struct", isSeed: true },
    Field({ name: "Currency", id: 0x0, type: "uint16", conformance: "M", constraint: "max 999" }),
    Field({ name: "DecimalPoints", id: 0x1, type: "uint8", conformance: "M" })
);
MatterDefinition.children.push(currency);
