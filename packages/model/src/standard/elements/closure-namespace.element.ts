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

export const ClosureNs = SemanticNamespace(
    { name: "Closure", id: 0x44 },
    SemanticTag({ name: "Covering", id: 0x0 }),
    SemanticTag({ name: "Window", id: 0x1 }),
    SemanticTag({ name: "Barrier", id: 0x2 }),
    SemanticTag({ name: "Cabinet", id: 0x3 }),
    SemanticTag({ name: "Gate", id: 0x4 }),
    SemanticTag({ name: "GarageDoor", id: 0x5 }),
    SemanticTag({ name: "Door", id: 0x6 })
);

MatterDefinition.children.push(ClosureNs);
