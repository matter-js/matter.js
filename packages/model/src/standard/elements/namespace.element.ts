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
    Field({ name: "CommonClosure", id: 0x1 }),
    Field({ name: "CommonCompassDirection", id: 0x2 }),
    Field({ name: "CommonCompassLocation", id: 0x3 }),
    Field({ name: "CommonDirection", id: 0x4 }),
    Field({ name: "CommonLevel", id: 0x5 }),
    Field({ name: "CommonLocation", id: 0x6 }),
    Field({ name: "CommonNumber", id: 0x7 }),
    Field({ name: "CommonPosition", id: 0x8 }),
    Field({ name: "ElectricalMeasurement", id: 0xa }),
    Field({ name: "CommodityTariffChronology", id: 0xb }),
    Field({ name: "CommodityTariffCommodity", id: 0xd }),
    Field({ name: "Laundry", id: 0xe }),
    Field({ name: "PowerSource", id: 0xf }),
    Field({ name: "CommonAreaNamespace", id: 0x10 }),
    Field({ name: "CommonLandmarkNamespace", id: 0x11 }),
    Field({ name: "CommonRelativePosition", id: 0x12 }),
    Field({ name: "CommodityTariffFlow", id: 0x13 }),
    Field({ name: "Refrigerator", id: 0x41 }),
    Field({ name: "RoomAirConditioner", id: 0x42 }),
    Field({ name: "Switches", id: 0x43 }),
    Field({ name: "Closure", id: 0x44 }),
    Field({ name: "ClosurePanel", id: 0x45 }),
    Field({ name: "ClosureCovering", id: 0x46 }),
    Field({ name: "ClosureWindow", id: 0x47 }),
    Field({ name: "ClosureCabinet", id: 0x48 })
);

MatterDefinition.children.push(namespace);
