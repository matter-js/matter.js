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

export const FanControl = Cluster(
    { name: "FanControl", id: 0x202, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 5 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "SPD", conformance: "O", constraint: "0", title: "MultiSpeed" }),
        Field({ name: "AUT", conformance: "O", constraint: "1", title: "Auto" }),
        Field({ name: "RCK", conformance: "O", constraint: "2", title: "Rocking" }),
        Field({ name: "WND", conformance: "O", constraint: "3", title: "Wind" }),
        Field({ name: "STEP", conformance: "O", constraint: "4", title: "Step" }),
        Field({ name: "DIR", conformance: "O", constraint: "5", title: "AirflowDirection" })
    ),

    Attribute({
        name: "FanMode", id: 0x0, type: "FanModeEnum", access: "RW VO", conformance: "M",
        constraint: "desc", quality: "N"
    }),
    Attribute({ name: "FanModeSequence", id: 0x1, type: "FanModeSequenceEnum", access: "R V", conformance: "M", quality: "F" }),
    Attribute({
        name: "PercentSetting", id: 0x2, type: "percent", access: "RW VO", conformance: "M",
        constraint: "max 100", quality: "X"
    }),
    Attribute({ name: "PercentCurrent", id: 0x3, type: "percent", access: "R V", conformance: "M", constraint: "max 100" }),
    Attribute({
        name: "SpeedMax", id: 0x4, type: "uint8", access: "R V", conformance: "SPD", constraint: "1 to 100",
        quality: "F"
    }),
    Attribute({
        name: "SpeedSetting", id: 0x5, type: "uint8", access: "RW VO", conformance: "SPD",
        constraint: "max speedMax", quality: "X"
    }),
    Attribute({
        name: "SpeedCurrent", id: 0x6, type: "uint8", access: "R V", conformance: "SPD",
        constraint: "max speedMax", quality: "P"
    }),
    Attribute({
        name: "RockSupport", id: 0x7, type: "RockBitmap", access: "R V", conformance: "RCK",
        constraint: "min 1", quality: "F"
    }),
    Attribute({
        name: "RockSetting", id: 0x8, type: "RockBitmap", access: "RW VO", conformance: "RCK",
        constraint: "desc", quality: "P"
    }),
    Attribute({
        name: "WindSupport", id: 0x9, type: "WindBitmap", access: "R V", conformance: "WND",
        constraint: "min 1", quality: "F"
    }),
    Attribute({
        name: "WindSetting", id: 0xa, type: "WindBitmap", access: "RW VO", conformance: "WND",
        constraint: "desc", quality: "P"
    }),
    Attribute({
        name: "AirflowDirection", id: 0xb, type: "AirflowDirectionEnum", access: "RW VO",
        conformance: "DIR", quality: "P"
    }),

    Command(
        { name: "Step", id: 0x0, access: "O", conformance: "STEP", direction: "request", response: "status" },
        Field({ name: "Direction", id: 0x0, type: "StepDirectionEnum", conformance: "M" }),
        Field({ name: "Wrap", id: 0x1, type: "bool", conformance: "O", default: false }),
        Field({ name: "LowestOff", id: 0x2, type: "bool", conformance: "O", default: true })
    ),

    Datatype(
        { name: "RockBitmap", type: "map8" },
        Field({ name: "RockLeftRight", constraint: "0" }),
        Field({ name: "RockUpDown", constraint: "1" }),
        Field({ name: "RockRound", constraint: "2" })
    ),

    Datatype(
        { name: "WindBitmap", type: "map8" },
        Field({ name: "SleepWind", constraint: "0" }),
        Field({ name: "NaturalWind", constraint: "1" })
    ),
    Datatype(
        { name: "StepDirectionEnum", type: "enum8" },
        Field({ name: "Increase", id: 0x0, conformance: "M" }),
        Field({ name: "Decrease", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "AirflowDirectionEnum", type: "enum8" },
        Field({ name: "Forward", id: 0x0, conformance: "M" }),
        Field({ name: "Reverse", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "FanModeEnum", type: "enum8" },
        Field({ name: "Off", id: 0x0, conformance: "M" }),
        Field({ name: "Low", id: 0x1, conformance: "O" }),
        Field({ name: "Medium", id: 0x2, conformance: "[Low]" }),
        Field({ name: "High", id: 0x3, conformance: "M" }),
        Field({ name: "On", id: 0x4, conformance: "D" }),
        Field({ name: "Auto", id: 0x5, conformance: "AUT" }),
        Field({ name: "Smart", id: 0x6, conformance: "D" })
    ),

    Datatype(
        { name: "FanModeSequenceEnum", type: "enum8" },
        Field({ name: "OffLowMedHigh", id: 0x0, conformance: "[!AUT].a" }),
        Field({ name: "OffLowHigh", id: 0x1, conformance: "[!AUT].a" }),
        Field({ name: "OffLowMedHighAuto", id: 0x2, conformance: "[AUT].b" }),
        Field({ name: "OffLowHighAuto", id: 0x3, conformance: "[AUT].b" }),
        Field({ name: "OffHighAuto", id: 0x4, conformance: "[AUT].b" }),
        Field({ name: "OffHigh", id: 0x5, conformance: "[!AUT].a" })
    )
);

MatterDefinition.children.push(FanControl);
