/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    SemanticNamespaceElement as SemanticNamespace,
    SemanticTagElement as SemanticTag
} from "../../elements/index.js";

export const LocationNs = SemanticNamespace(
    { name: "Location", id: 0x6 },
    SemanticTag({ name: "Indoor", id: 0x0 }),
    SemanticTag({ name: "Outdoor", id: 0x1 }),
    SemanticTag({ name: "Inside", id: 0x2 }),
    SemanticTag({ name: "Outside", id: 0x3 }),
    SemanticTag({ name: "Zone", id: 0x4 })
);

MatterDefinition.children.push(LocationNs);
