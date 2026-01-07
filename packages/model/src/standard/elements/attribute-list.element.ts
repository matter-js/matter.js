/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { AttributeElement as Attribute, FieldElement as Field } from "../../elements/index.js";

export const AttributeList = Attribute(
    { name: "AttributeList", id: 0xfffb, type: "list", access: "R V", conformance: "M", isSeed: true, quality: "F" },
    Field({ name: "entry", type: "attrib-id" })
);
MatterDefinition.children.push(AttributeList);
