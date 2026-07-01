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

export const IdentifiedObjectNs = SemanticNamespace(
    { name: "IdentifiedObject", id: 0x49 },
    SemanticTag({ name: "Unknown", id: 0x0 }),
    SemanticTag({ name: "Adult", id: 0x1 }),
    SemanticTag({ name: "Child", id: 0x2 }),
    SemanticTag({ name: "Person", id: 0x3 }),
    SemanticTag({ name: "RVC", id: 0x4 }),
    SemanticTag({ name: "Pet", id: 0x5 }),
    SemanticTag({ name: "Dog", id: 0x6 }),
    SemanticTag({ name: "Cat", id: 0x7 }),
    SemanticTag({ name: "Animal", id: 0x8 }),
    SemanticTag({ name: "Car", id: 0x9 }),
    SemanticTag({ name: "Vehicle", id: 0xa }),
    SemanticTag({ name: "Package", id: 0xb }),
    SemanticTag({ name: "Clothes", id: 0xc })
);

MatterDefinition.children.push(IdentifiedObjectNs);
