/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    EventElement as Event
} from "../../elements/index.js";

export const BooleanState = Cluster(
    { name: "BooleanState", id: 0x45, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "CHGEVENT", conformance: "[Rev >= v3]", constraint: "0", title: "ChangeEvent" })
    ),
    Attribute({ name: "StateValue", id: 0x0, type: "bool", access: "R V", conformance: "M" }),
    Event(
        { name: "StateChange", id: 0x0, access: "V", conformance: "CHGEVENT, O", priority: "info" },
        Field({ name: "StateValue", id: 0x0, type: "bool", conformance: "M" })
    )
);

MatterDefinition.children.push(BooleanState);
