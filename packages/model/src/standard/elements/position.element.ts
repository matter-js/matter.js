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

export const PositionNs = SemanticNamespace(
    { name: "Position", id: 0x8 },
    SemanticTag({ name: "Left", id: 0x0 }),
    SemanticTag({ name: "Right", id: 0x1 }),
    SemanticTag({ name: "Top", id: 0x2 }),
    SemanticTag({ name: "Bottom", id: 0x3 }),
    SemanticTag({ name: "Middle", id: 0x4 }),
    SemanticTag({ name: "Row", id: 0x5 }),
    SemanticTag({ name: "Column", id: 0x6 })
);

MatterDefinition.children.push(PositionNs);
