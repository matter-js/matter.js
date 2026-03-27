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

export const CommodityTariffFlowNs = SemanticNamespace(
    { name: "CommodityTariffFlow", id: 0x13 },
    SemanticTag({ name: "Import", id: 0x0 }),
    SemanticTag({ name: "Export", id: 0x1 })
);
MatterDefinition.children.push(CommodityTariffFlowNs);
