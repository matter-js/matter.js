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

export const RelativePositionNs = SemanticNamespace(
    { name: "RelativePosition", id: 0x12 },
    SemanticTag({ name: "Under", id: 0x0 }),
    SemanticTag({ name: "NextTo", id: 0x1 }),
    SemanticTag({ name: "Around", id: 0x2 }),
    SemanticTag({ name: "On", id: 0x3 }),
    SemanticTag({ name: "Above", id: 0x4 }),
    SemanticTag({ name: "FrontOf", id: 0x5 }),
    SemanticTag({ name: "Behind", id: 0x6 })
);

MatterDefinition.children.push(RelativePositionNs);
