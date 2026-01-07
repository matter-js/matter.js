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
    { name: "Closure", id: 0x1 },
    SemanticTag({ name: "Opening", id: 0x0 }),
    SemanticTag({ name: "Closing", id: 0x1 }),
    SemanticTag({ name: "Stop", id: 0x2 })
);

MatterDefinition.children.push(ClosureNs);
