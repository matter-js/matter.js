/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const AtomicRequestTypeEnum = Datatype(
    { name: "AtomicRequestTypeEnum", type: "enum8" },
    Field({ name: "BeginWrite", id: 0x0, conformance: "M" }),
    Field({ name: "CommitWrite", id: 0x1, conformance: "M" }),
    Field({ name: "RollbackWrite", id: 0x2, conformance: "M" })
);

MatterDefinition.children.push(AtomicRequestTypeEnum);
