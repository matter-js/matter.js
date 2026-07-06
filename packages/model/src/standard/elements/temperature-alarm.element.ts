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
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const TemperatureAlarm = Cluster(
    { name: "TemperatureAlarm", id: 0x64, type: "AlarmBase", classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "OVER", conformance: "O.a+", constraint: "20", title: "OverTemperature" }),
        Field({ name: "UNDER", conformance: "O.a+", constraint: "21", title: "UnderTemperature" }),
        Field({ name: "MAJOR", conformance: "O", constraint: "22", title: "MajorThreshold" }),
        Field({ name: "MINOR", conformance: "[MAJOR]", constraint: "23", title: "MinorThreshold" }),
        Field({ name: "OCRIADJ", conformance: "[OVER]", constraint: "24", title: "OverCriticalAdjustable" }),
        Field({ name: "OMAJADJ", conformance: "[OVER & MAJOR]", constraint: "25", title: "OverMajorAdjustable" }),
        Field({ name: "OMINADJ", conformance: "[OVER & MINOR]", constraint: "26", title: "OverMinorAdjustable" }),
        Field({ name: "UMINADJ", conformance: "[UNDER & MINOR]", constraint: "27", title: "UnderMinorAdjustable" }),
        Field({ name: "UMAJADJ", conformance: "[UNDER & MAJOR]", constraint: "28", title: "UnderMajorAdjustable" }),
        Field({ name: "UCRIADJ", conformance: "[UNDER]", constraint: "29", title: "UnderCriticalAdjustable" })
    ),

    Attribute({
        name: "CriticalOverTemperatureThreshold", id: 0x80, type: "temperature", access: "R V",
        conformance: "OVER",
        constraint: "min maxOf(criticalUnderTemperatureThreshold, majorOverTemperatureThreshold, minorOverTemperatureThreshold) + 1"
    }),
    Attribute({
        name: "MajorOverTemperatureThreshold", id: 0x81, type: "temperature", access: "R V",
        conformance: "OVER & MAJOR",
        constraint: "min maxOf(majorUnderTemperatureThreshold, minorOverTemperatureThreshold) + 1"
    }),
    Attribute({
        name: "MinorOverTemperatureThreshold", id: 0x82, type: "temperature", access: "R V",
        conformance: "OVER & MINOR", constraint: "min minorUnderTemperatureThreshold + 1"
    }),
    Attribute({
        name: "MinorUnderTemperatureThreshold", id: 0x83, type: "temperature", access: "R V",
        conformance: "UNDER & MINOR", constraint: "max minorOverTemperatureThreshold - 1"
    }),
    Attribute({
        name: "MajorUnderTemperatureThreshold", id: 0x84, type: "temperature", access: "R V",
        conformance: "UNDER & MAJOR",
        constraint: "max minOf(majorOverTemperatureThreshold, minorUnderTemperatureThreshold) - 1"
    }),
    Attribute({
        name: "CriticalUnderTemperatureThreshold", id: 0x85, type: "temperature", access: "R V",
        conformance: "UNDER",
        constraint: "max minOf(criticalOverTemperatureThreshold, majorUnderTemperatureThreshold, minorUnderTemperatureThreshold) - 1"
    }),

    Command(
        {
            name: "SetTemperatureAlarmThresholds", id: 0x80, access: "O",
            conformance: "OCRIADJ | OMAJADJ | OMINADJ | UMINADJ | UMAJADJ | UCRIADJ", direction: "request",
            response: "status"
        },
        Field({
            name: "CriticalOverTemperatureThreshold", id: 0x0, type: "temperature", conformance: "[OCRIADJ].b+",
            constraint: "min maxOf(criticalUnderTemperatureThreshold, majorOverTemperatureThreshold, minorOverTemperatureThreshold) + 1"
        }),
        Field({
            name: "MajorOverTemperatureThreshold", id: 0x1, type: "temperature", conformance: "[OMAJADJ].b+",
            constraint: "min maxOf(majorUnderTemperatureThreshold, minorOverTemperatureThreshold) + 1"
        }),
        Field({
            name: "MinorOverTemperatureThreshold", id: 0x2, type: "temperature", conformance: "[OMINADJ].b+",
            constraint: "min minorUnderTemperatureThreshold + 1", default: 32765
        }),
        Field({
            name: "MinorUnderTemperatureThreshold", id: 0x3, type: "temperature", conformance: "[UMINADJ].b+",
            constraint: "max minorOverTemperatureThreshold - 1", default: -27314
        }),
        Field({
            name: "MajorUnderTemperatureThreshold", id: 0x4, type: "temperature", conformance: "[UMAJADJ].b+",
            constraint: "max minOf(majorOverTemperatureThreshold, minorUnderTemperatureThreshold) - 1"
        }),
        Field({
            name: "CriticalUnderTemperatureThreshold", id: 0x5, type: "temperature",
            conformance: "[UCRIADJ].b+",
            constraint: "max minOf(criticalOverTemperatureThreshold, majorUnderTemperatureThreshold, minorUnderTemperatureThreshold) - 1"
        })
    ),

    Datatype(
        { name: "AlarmBitmap", type: "map32" },
        Field({ name: "CriticalOverTemperatureAlarm", constraint: "0" }),
        Field({ name: "MajorOverTemperatureAlarm", constraint: "1" }),
        Field({ name: "MinorOverTemperatureAlarm", constraint: "2" }),
        Field({ name: "MinorUnderTemperatureAlarm", constraint: "3" }),
        Field({ name: "MajorUnderTemperatureAlarm", constraint: "4" }),
        Field({ name: "CriticalUnderTemperatureAlarm", constraint: "5" })
    )
);

MatterDefinition.children.push(TemperatureAlarm);
