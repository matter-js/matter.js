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

export const ClosurePanelNs = SemanticNamespace(
    { name: "ClosurePanel", id: 0x45 },
    SemanticTag({ name: "Lift", id: 0x0 }),
    SemanticTag({ name: "Tilt", id: 0x1 }),
    SemanticTag({ name: "Sliding", id: 0x2 }),
    SemanticTag({ name: "Rotate", id: 0x3 })
);

MatterDefinition.children.push(ClosurePanelNs);
