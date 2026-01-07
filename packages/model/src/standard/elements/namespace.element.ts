/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const namespace = Datatype(
    { name: "namespace", type: "enum8", isSeed: true },
    Field({ name: "Closure", id: 0x1 }),
    Field({ name: "CompassDirection", id: 0x2 }),
    Field({ name: "CompassLocation", id: 0x3 }),
    Field({ name: "Direction", id: 0x4 }),
    Field({ name: "Level", id: 0x5 }),
    Field({ name: "Location", id: 0x6 }),
    Field({ name: "Number", id: 0x7 }),
    Field({ name: "Position", id: 0x8 }),
    Field({ name: "ElectricalMeasurement", id: 0xa }),
    Field({ name: "Laundry", id: 0xe }),
    Field({ name: "PowerSource", id: 0xf }),
    Field({ name: "AreaNamespace", id: 0x10 }),
    Field({ name: "LandmarkNamespace", id: 0x11 }),
    Field({ name: "RelativePosition", id: 0x12 }),
    Field({ name: "Refrigerator", id: 0x41 }),
    Field({ name: "RoomAirConditioner", id: 0x42 }),
    Field({ name: "Switches", id: 0x43 })
);

MatterDefinition.children.push(namespace);
