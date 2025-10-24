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
    EventElement as Event,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const OccupancySensing = Cluster(
    { name: "OccupancySensing", id: 0x406 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 5 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "OTHER", conformance: "O.a+", constraint: "0", title: "Other" }),
        Field({ name: "PIR", conformance: "O.a+", constraint: "1", title: "PassiveInfrared" }),
        Field({ name: "US", conformance: "O.a+", constraint: "2", title: "Ultrasonic" }),
        Field({ name: "PHY", conformance: "O.a+", constraint: "3", title: "PhysicalContact" }),
        Field({ name: "AIR", conformance: "O.a+", constraint: "4", title: "ActiveInfrared" }),
        Field({ name: "RAD", conformance: "O.a+", constraint: "5", title: "Radar" }),
        Field({ name: "RFS", conformance: "O.a+", constraint: "6", title: "RfSensing" }),
        Field({ name: "VIS", conformance: "O.a+", constraint: "7", title: "Vision" })
    ),

    Attribute({
        name: "Occupancy", id: 0x0, type: "OccupancyBitmap", access: "R V", conformance: "M",
        constraint: "0 to 1", quality: "P"
    }),
    Attribute({
        name: "OccupancySensorType", id: 0x1, type: "OccupancySensorTypeEnum", access: "R V",
        conformance: "M, D", constraint: "desc", quality: "F"
    }),
    Attribute({
        name: "OccupancySensorTypeBitmap", id: 0x2, type: "OccupancySensorTypeBitmap", access: "R V",
        conformance: "M, D", constraint: "0 to 7", quality: "F"
    }),
    Attribute({
        name: "HoldTime", id: 0x3, type: "uint16", access: "RW VM", conformance: "O",
        constraint: "holdTimeLimits.holdTimeMin to holdTimeLimits.holdTimeMax", quality: "N"
    }),
    Attribute({
        name: "HoldTimeLimits", id: 0x4, type: "HoldTimeLimitsStruct", access: "R V",
        conformance: "HoldTime", quality: "F"
    }),
    Attribute({
        name: "PirOccupiedToUnoccupiedDelay", id: 0x10, type: "uint16", access: "RW VM",
        conformance: "[HoldTime & (PIR | !PIR & !US & !PHY)], D", default: 0, quality: "N"
    }),
    Attribute({
        name: "PirUnoccupiedToOccupiedDelay", id: 0x11, type: "uint16", access: "RW VM",
        conformance: "HoldTime & (PIR | !PIR & !US & !PHY) & PirUnoccupiedToOccupiedThreshold, [HoldTime & (PIR | !PIR & !US & !PHY)], D",
        default: 0, quality: "N"
    }),
    Attribute({
        name: "PirUnoccupiedToOccupiedThreshold", id: 0x12, type: "uint8", access: "RW VM",
        conformance: "HoldTime & (PIR | !PIR & !US & !PHY) & PirUnoccupiedToOccupiedDelay, [HoldTime & (PIR | !PIR & !US & !PHY)], D",
        constraint: "1 to 254", default: 1, quality: "N"
    }),
    Attribute({
        name: "UltrasonicOccupiedToUnoccupiedDelay", id: 0x20, type: "uint16", access: "RW VM",
        conformance: "[HoldTime & US], D", default: 0, quality: "N"
    }),
    Attribute({
        name: "UltrasonicUnoccupiedToOccupiedDelay", id: 0x21, type: "uint16", access: "RW VM",
        conformance: "HoldTime & US & UltrasonicUnoccupiedToOccupiedThreshold, [HoldTime & US], D",
        default: 0, quality: "N"
    }),
    Attribute({
        name: "UltrasonicUnoccupiedToOccupiedThreshold", id: 0x22, type: "uint8", access: "RW VM",
        conformance: "HoldTime & US & UltrasonicUnoccupiedToOccupiedDelay, [HoldTime & US], D",
        constraint: "1 to 254", default: 1, quality: "N"
    }),
    Attribute({
        name: "PhysicalContactOccupiedToUnoccupiedDelay", id: 0x30, type: "uint16", access: "RW VM",
        conformance: "[HoldTime & PHY], D", default: 0, quality: "N"
    }),
    Attribute({
        name: "PhysicalContactUnoccupiedToOccupiedDelay", id: 0x31, type: "uint16", access: "RW VM",
        conformance: "HoldTime & PHY & PhysicalContactUnoccupiedToOccupiedThreshold, [HoldTime & PHY], D",
        default: 0, quality: "N"
    }),
    Attribute({
        name: "PhysicalContactUnoccupiedToOccupiedThreshold", id: 0x32, type: "uint8", access: "RW VM",
        conformance: "HoldTime & PHY & PhysicalContactUnoccupiedToOccupiedDelay, [HoldTime & PHY], D",
        constraint: "1 to 254", default: 1, quality: "N"
    }),
    Event(
        { name: "OccupancyChanged", id: 0x0, access: "V", conformance: "O", priority: "info" },
        Field({ name: "Occupancy", id: 0x0, type: "OccupancyBitmap", conformance: "M" })
    ),
    Datatype({ name: "OccupancyBitmap", type: "map8" }, Field({ name: "Occupied", constraint: "0" })),

    Datatype(
        { name: "OccupancySensorTypeBitmap", type: "map8" },
        Field({ name: "Pir", constraint: "0" }),
        Field({ name: "Ultrasonic", constraint: "1" }),
        Field({ name: "PhysicalContact", constraint: "2" })
    ),

    Datatype(
        { name: "OccupancySensorTypeEnum", type: "enum8" },
        Field({ name: "Pir", id: 0x0, conformance: "M" }),
        Field({ name: "Ultrasonic", id: 0x1, conformance: "M" }),
        Field({ name: "PirAndUltrasonic", id: 0x2, conformance: "M" }),
        Field({ name: "PhysicalContact", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "HoldTimeLimitsStruct", type: "struct" },
        Field({ name: "HoldTimeMin", id: 0x0, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "HoldTimeMax", id: 0x1, type: "uint16", conformance: "M", constraint: "min maxOf(holdTimeMin, 10)" }),
        Field({
            name: "HoldTimeDefault", id: 0x2, type: "uint16", conformance: "M",
            constraint: "holdTimeMin to holdTimeMax"
        })
    )
);

MatterDefinition.children.push(OccupancySensing);
