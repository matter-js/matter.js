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

export const PowerSourceNs = SemanticNamespace(
    { name: "PowerSource", id: 0xf },
    SemanticTag({ name: "Unknown", id: 0x0 }),
    SemanticTag({ name: "Grid", id: 0x1 }),
    SemanticTag({ name: "Solar", id: 0x2 }),
    SemanticTag({ name: "Battery", id: 0x3 }),
    SemanticTag({ name: "Ev", id: 0x4 })
);

MatterDefinition.children.push(PowerSourceNs);
