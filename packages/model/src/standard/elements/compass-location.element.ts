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

export const CompassLocationNs = SemanticNamespace(
    { name: "CompassLocation", id: 0x3 },
    SemanticTag({ name: "North", id: 0x0 }),
    SemanticTag({ name: "NorthEast", id: 0x1 }),
    SemanticTag({ name: "East", id: 0x2 }),
    SemanticTag({ name: "SouthEast", id: 0x3 }),
    SemanticTag({ name: "South", id: 0x4 }),
    SemanticTag({ name: "SouthWest", id: 0x5 }),
    SemanticTag({ name: "West", id: 0x6 }),
    SemanticTag({ name: "NorthWest", id: 0x7 })
);

MatterDefinition.children.push(CompassLocationNs);
