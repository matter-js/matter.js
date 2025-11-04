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
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const RvcRunMode = Cluster(
    { name: "RvcRunMode", id: 0x54, type: "ModeBase", classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "DEPONOFF", conformance: "X", constraint: "0", title: "OnOff" })
    ),
    Attribute({ name: "SupportedModes", id: 0x0 }),
    Attribute({ name: "CurrentMode", id: 0x1 }),
    Attribute({ name: "StartUpMode", id: 0x2, conformance: "X" }),
    Attribute({ name: "OnMode", id: 0x3, conformance: "X" }),
    Datatype({ name: "ModeOptionStruct", type: "ModeOptionStruct" }),

    Datatype(
        { name: "ModeChangeStatus", type: "enum8" },
        Field({ name: "Stuck", id: 0x41 }),
        Field({ name: "DustBinMissing", id: 0x42 }),
        Field({ name: "DustBinFull", id: 0x43 }),
        Field({ name: "WaterTankEmpty", id: 0x44 }),
        Field({ name: "WaterTankMissing", id: 0x45 }),
        Field({ name: "WaterTankLidOpen", id: 0x46 }),
        Field({ name: "MopCleaningPadMissing", id: 0x47 }),
        Field({ name: "BatteryLow", id: 0x48 })
    ),

    Datatype(
        { name: "ModeTag", type: "enum16" },
        Field({ name: "Auto", id: 0x0 }),
        Field({ name: "Quick", id: 0x1 }),
        Field({ name: "Quiet", id: 0x2 }),
        Field({ name: "LowNoise", id: 0x3 }),
        Field({ name: "LowEnergy", id: 0x4 }),
        Field({ name: "Vacation", id: 0x5 }),
        Field({ name: "Min", id: 0x6 }),
        Field({ name: "Max", id: 0x7 }),
        Field({ name: "Night", id: 0x8 }),
        Field({ name: "Day", id: 0x9 }),
        Field({ name: "Idle", id: 0x4000 }),
        Field({ name: "Cleaning", id: 0x4001 }),
        Field({ name: "Mapping", id: 0x4002 })
    )
);

MatterDefinition.children.push(RvcRunMode);
