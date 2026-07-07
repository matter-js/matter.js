/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const TariffPriceTypeEnum = Datatype(
    { name: "TariffPriceTypeEnum", type: "enum8" },
    Field({ name: "Standard", id: 0x0, conformance: "M" }),
    Field({ name: "Critical", id: 0x1, conformance: "M" }),
    Field({ name: "Virtual", id: 0x2, conformance: "M" }),
    Field({ name: "Incentive", id: 0x3, conformance: "M" }),
    Field({ name: "IncentiveSignal", id: 0x4, conformance: "M" })
);

MatterDefinition.children.push(TariffPriceTypeEnum);
