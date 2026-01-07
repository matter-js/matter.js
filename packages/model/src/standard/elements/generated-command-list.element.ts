/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { AttributeElement as Attribute, FieldElement as Field } from "../../elements/index.js";

export const GeneratedCommandList = Attribute(
    {
        name: "GeneratedCommandList", id: 0xfff8, type: "list", access: "R V", conformance: "M",
        isSeed: true, quality: "F"
    },
    Field({ name: "entry", type: "command-id" })
);

MatterDefinition.children.push(GeneratedCommandList);
