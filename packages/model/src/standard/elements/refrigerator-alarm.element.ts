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
    FieldElement as Field,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const RefrigeratorAlarm = Cluster(
    { name: "RefrigeratorAlarm", id: 0x57, type: "AlarmBase", classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "RESET", conformance: "X", constraint: "0", title: "Reset" })
    ),
    Command({ name: "ModifyEnabledAlarms", id: 0x1, conformance: "X" }),
    Datatype({ name: "AlarmBitmap", type: "map32" }, Field({ name: "DoorOpen", constraint: "0" }))
);

MatterDefinition.children.push(RefrigeratorAlarm);
