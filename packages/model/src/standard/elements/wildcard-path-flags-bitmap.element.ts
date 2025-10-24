/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const WildcardPathFlagsBitmap = Datatype(
    { name: "WildcardPathFlagsBitmap", type: "map16" },
    Field({ name: "WildcardSkipRootNode", constraint: "0" }),
    Field({ name: "WildcardSkipGlobalAttributes", constraint: "1" }),
    Field({ name: "WildcardSkipAttributeList", constraint: "2" }),
    Field({ name: "DoNotUse", constraint: "3" }),
    Field({ name: "WildcardSkipCommandLists", constraint: "4" }),
    Field({ name: "WildcardSkipCustomElements", constraint: "5" }),
    Field({ name: "WildcardSkipFixedAttributes", constraint: "6" }),
    Field({ name: "WildcardSkipChangesOmittedAttributes", constraint: "7" }),
    Field({ name: "WildcardSkipDiagnosticsClusters", constraint: "8" })
);

MatterDefinition.children.push(WildcardPathFlagsBitmap);
