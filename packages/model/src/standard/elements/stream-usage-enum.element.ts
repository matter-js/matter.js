/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const StreamUsageEnum = Datatype(
    { name: "StreamUsageEnum", type: "enum8" },
    Field({ name: "Internal", id: 0x0, conformance: "M" }),
    Field({ name: "Recording", id: 0x1, conformance: "O" }),
    Field({ name: "Analysis", id: 0x2, conformance: "O" }),
    Field({ name: "LiveView", id: 0x3, conformance: "M" })
);

MatterDefinition.children.push(StreamUsageEnum);
