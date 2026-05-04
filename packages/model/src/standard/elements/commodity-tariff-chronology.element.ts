/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    SemanticNamespaceElement as SemanticNamespace,
    SemanticTagElement as SemanticTag
} from "../../elements/index.js";

export const CommodityTariffChronologyNs = SemanticNamespace(
    { name: "CommodityTariffChronology", id: 0xb },
    SemanticTag({ name: "Current", id: 0x0 }),
    SemanticTag({ name: "Previous", id: 0x1 }),
    SemanticTag({ name: "Upcoming", id: 0x2 })
);

MatterDefinition.children.push(CommodityTariffChronologyNs);
