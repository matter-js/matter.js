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

export const ClosureCabinetNs = SemanticNamespace(
    { name: "ClosureCabinet", id: 0x48 },
    SemanticTag({ name: "CabinetDoor", id: 0x0 }),
    SemanticTag({ name: "Drawer", id: 0x1 }),
    SemanticTag({ name: "Flap", id: 0x2 })
);

MatterDefinition.children.push(ClosureCabinetNs);
