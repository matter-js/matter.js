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

export const IdentifiedHumanActivityNs = SemanticNamespace(
    { name: "IdentifiedHumanActivity", id: 0x4b },
    SemanticTag({ name: "Unknown", id: 0x0 }),
    SemanticTag({ name: "Fall", id: 0x1 }),
    SemanticTag({ name: "Sleeping", id: 0x2 }),
    SemanticTag({ name: "Walking", id: 0x3 }),
    SemanticTag({ name: "Workout", id: 0x4 }),
    SemanticTag({ name: "Sitting", id: 0x5 }),
    SemanticTag({ name: "Standing", id: 0x6 }),
    SemanticTag({ name: "Dancing", id: 0x7 }),
    SemanticTag({ name: "PackageDelivery", id: 0x8 }),
    SemanticTag({ name: "PackageRetrieval", id: 0x9 })
);

MatterDefinition.children.push(IdentifiedHumanActivityNs);
