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

export const LaundryNs = SemanticNamespace(
    { name: "Laundry", id: 0xe },
    SemanticTag({ name: "Normal", id: 0x0 }),
    SemanticTag({ name: "LightDry", id: 0x1 }),
    SemanticTag({ name: "ExtraDry", id: 0x2 }),
    SemanticTag({ name: "NoDry", id: 0x3 })
);

MatterDefinition.children.push(LaundryNs);
