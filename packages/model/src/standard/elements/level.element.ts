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

export const LevelNs = SemanticNamespace(
    { name: "Level", id: 0x5 },
    SemanticTag({ name: "Low", id: 0x0 }),
    SemanticTag({ name: "Medium", id: 0x1 }),
    SemanticTag({ name: "High", id: 0x2 })
);

MatterDefinition.children.push(LevelNs);
