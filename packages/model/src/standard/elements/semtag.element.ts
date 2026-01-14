/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const semtag = Datatype(
    { name: "semtag", type: "struct", isSeed: true },
    Field({ name: "MfgCode", id: 0x0, type: "vendor-id", conformance: "M", default: null, quality: "X" }),
    Field({ name: "NamespaceId", id: 0x1, type: "namespace", conformance: "M" }),
    Field({ name: "Tag", id: 0x2, type: "tag", conformance: "M" }),
    Field({ name: "Label", id: 0x3, type: "string", conformance: "O", constraint: "max 64", default: null, quality: "X" })
);

MatterDefinition.children.push(semtag);
