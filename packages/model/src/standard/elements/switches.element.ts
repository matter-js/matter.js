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

export const SwitchesNs = SemanticNamespace(
    { name: "Switches", id: 0x43 },
    SemanticTag({ name: "On", id: 0x0 }),
    SemanticTag({ name: "Off", id: 0x1 }),
    SemanticTag({ name: "Toggle", id: 0x2 }),
    SemanticTag({ name: "Up", id: 0x3 }),
    SemanticTag({ name: "Down", id: 0x4 }),
    SemanticTag({ name: "Next", id: 0x5 }),
    SemanticTag({ name: "Previous", id: 0x6 }),
    SemanticTag({ name: "EnterOkSelect", id: 0x7 }),
    SemanticTag({ name: "Custom", id: 0x8 }),
    SemanticTag({ name: "Open", id: 0x9 }),
    SemanticTag({ name: "Close", id: 0xa }),
    SemanticTag({ name: "Stop", id: 0xb })
);

MatterDefinition.children.push(SwitchesNs);
