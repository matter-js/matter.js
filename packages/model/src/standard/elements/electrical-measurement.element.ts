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

export const ElectricalMeasurementNs = SemanticNamespace(
    { name: "ElectricalMeasurement", id: 0xa },
    SemanticTag({ name: "DC", id: 0x0 }),
    SemanticTag({ name: "AC", id: 0x1 }),
    SemanticTag({ name: "ACPhase1", id: 0x2 }),
    SemanticTag({ name: "ACPhase2", id: 0x3 }),
    SemanticTag({ name: "ACPhase3", id: 0x4 })
);

MatterDefinition.children.push(ElectricalMeasurementNs);
