/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const priority = Datatype(
    { name: "priority", type: "enum8", isSeed: true },
    Field({ name: "Debug", id: 0x0 }),
    Field({ name: "Info", id: 0x1 }),
    Field({ name: "Critical", id: 0x2 })
);

MatterDefinition.children.push(priority);
