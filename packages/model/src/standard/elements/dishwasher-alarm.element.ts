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
    DatatypeElement as Datatype,
    FieldElement as Field
} from "../../elements/index.js";

export const DishwasherAlarm = Cluster(
    { name: "DishwasherAlarm", id: 0x5d, type: "AlarmBase", classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Datatype(
        { name: "AlarmBitmap", type: "map32" },
        Field({ name: "InflowError", constraint: "0" }),
        Field({ name: "DrainError", constraint: "1" }),
        Field({ name: "DoorError", constraint: "2" }),
        Field({ name: "TempTooLow", constraint: "3" }),
        Field({ name: "TempTooHigh", constraint: "4" }),
        Field({ name: "WaterLevelError", constraint: "5" })
    )
);

MatterDefinition.children.push(DishwasherAlarm);
