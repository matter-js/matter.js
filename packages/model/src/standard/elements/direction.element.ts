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

export const DirectionNs = SemanticNamespace(
    { name: "Direction", id: 0x4 },
    SemanticTag({ name: "Upward", id: 0x0 }),
    SemanticTag({ name: "Downward", id: 0x1 }),
    SemanticTag({ name: "Leftward", id: 0x2 }),
    SemanticTag({ name: "Rightward", id: 0x3 }),
    SemanticTag({ name: "Forward", id: 0x4 }),
    SemanticTag({ name: "Backward", id: 0x5 })
);

MatterDefinition.children.push(DirectionNs);
