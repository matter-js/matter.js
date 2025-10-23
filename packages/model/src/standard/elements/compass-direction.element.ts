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

export const CompassDirectionNs = SemanticNamespace(
    { name: "CompassDirection", id: 0x2 },
    SemanticTag({ name: "Northward", id: 0x0 }),
    SemanticTag({ name: "NorthEastward", id: 0x1 }),
    SemanticTag({ name: "Eastward", id: 0x2 }),
    SemanticTag({ name: "SouthEastward", id: 0x3 }),
    SemanticTag({ name: "Southward", id: 0x4 }),
    SemanticTag({ name: "SouthWestward", id: 0x5 }),
    SemanticTag({ name: "Westward", id: 0x6 }),
    SemanticTag({ name: "NorthWestward", id: 0x7 })
);

MatterDefinition.children.push(CompassDirectionNs);
