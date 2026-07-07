/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const TariffUnitEnum = Datatype(
    { name: "TariffUnitEnum", type: "enum8" },
    Field({ name: "KWh", id: 0x0, conformance: "M" }),
    Field({ name: "KVAh", id: 0x1, conformance: "M" })
);
MatterDefinition.children.push(TariffUnitEnum);
