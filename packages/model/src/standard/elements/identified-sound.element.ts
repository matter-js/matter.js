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

export const IdentifiedSoundNs = SemanticNamespace(
    { name: "IdentifiedSound", id: 0x4a },
    SemanticTag({ name: "Unknown", id: 0x0 }),
    SemanticTag({ name: "ObjectFall", id: 0x1 }),
    SemanticTag({ name: "Snoring", id: 0x2 }),
    SemanticTag({ name: "Coughing", id: 0x3 }),
    SemanticTag({ name: "Barking", id: 0x4 }),
    SemanticTag({ name: "Shattering", id: 0x5 }),
    SemanticTag({ name: "BabyCrying", id: 0x6 }),
    SemanticTag({ name: "UtilityAlarm", id: 0x7 }),
    SemanticTag({ name: "UrgentShouting", id: 0x8 }),
    SemanticTag({ name: "Doorbell", id: 0x9 }),
    SemanticTag({ name: "Knocking", id: 0xa }),
    SemanticTag({ name: "UrgentSiren", id: 0xb }),
    SemanticTag({ name: "FaucetRunning", id: 0xc }),
    SemanticTag({ name: "KettleBoiling", id: 0xd }),
    SemanticTag({ name: "FanDryer", id: 0xe }),
    SemanticTag({ name: "Clapping", id: 0xf }),
    SemanticTag({ name: "FingerSnapping", id: 0x10 }),
    SemanticTag({ name: "Meowing", id: 0x11 }),
    SemanticTag({ name: "Laughing", id: 0x12 }),
    SemanticTag({ name: "GlassBreaking", id: 0x13 }),
    SemanticTag({ name: "DoorKnocking", id: 0x14 }),
    SemanticTag({ name: "PersonTalking", id: 0x15 })
);

MatterDefinition.children.push(IdentifiedSoundNs);
