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

export const ClosureCoveringNs = SemanticNamespace(
    { name: "ClosureCovering", id: 0x46 },
    SemanticTag({ name: "Blind", id: 0x0 }),
    SemanticTag({ name: "Awning", id: 0x1 }),
    SemanticTag({ name: "Shutter", id: 0x2 }),
    SemanticTag({ name: "Venetian", id: 0x3 }),
    SemanticTag({ name: "Curtain", id: 0x4 })
);

MatterDefinition.children.push(ClosureCoveringNs);
