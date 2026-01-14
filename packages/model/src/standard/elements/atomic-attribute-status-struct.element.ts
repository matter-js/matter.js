/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const AtomicAttributeStatusStruct = Datatype(
    { name: "AtomicAttributeStatusStruct", type: "struct" },
    Field({ name: "AttributeId", id: 0x0, type: "attrib-id", conformance: "M" }),
    Field({ name: "StatusCode", id: 0x1, type: "status", conformance: "M" })
);
MatterDefinition.children.push(AtomicAttributeStatusStruct);
