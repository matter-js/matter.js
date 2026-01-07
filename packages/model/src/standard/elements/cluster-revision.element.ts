/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { AttributeElement as Attribute } from "../../elements/index.js";

export const ClusterRevision = Attribute({
    name: "ClusterRevision", id: 0xfffd, type: "uint16", access: "R V", conformance: "M",
    constraint: "min 1", isSeed: true, quality: "F"
});
MatterDefinition.children.push(ClusterRevision);
