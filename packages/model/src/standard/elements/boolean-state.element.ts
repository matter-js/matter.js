/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    EventElement as Event,
    FieldElement as Field
} from "../../elements/index.js";

export const BooleanState = Cluster(
    { name: "BooleanState", id: 0x45, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({ name: "StateValue", id: 0x0, type: "bool", access: "R V", conformance: "M", quality: "P" }),
    Event(
        { name: "StateChange", id: 0x0, access: "V", conformance: "O", priority: "info" },
        Field({ name: "StateValue", id: 0x0, type: "bool", conformance: "M" })
    )
);

MatterDefinition.children.push(BooleanState);
