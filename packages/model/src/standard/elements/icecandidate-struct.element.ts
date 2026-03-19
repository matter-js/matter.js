/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const IceCandidateStruct = Datatype(
    { name: "ICECandidateStruct", type: "struct" },
    Field({ name: "Candidate", id: 0x0, type: "string", conformance: "M" }),
    Field({ name: "SdpMid", id: 0x1, type: "string", conformance: "M", constraint: "min 1", quality: "X" }),
    Field({ name: "SdpmLineIndex", id: 0x2, type: "uint16", conformance: "M", quality: "X" })
);

MatterDefinition.children.push(IceCandidateStruct);
