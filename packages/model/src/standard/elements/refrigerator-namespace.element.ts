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

export const RefrigeratorNs = SemanticNamespace(
    { name: "Refrigerator", id: 0x41 },
    SemanticTag({ name: "Refrigerator", id: 0x0 }),
    SemanticTag({ name: "Freezer", id: 0x1 })
);
MatterDefinition.children.push(RefrigeratorNs);
