/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The OccupancySensing cluster (0x406) is defined in Matter 1.5 spec section 2.7 but was not parsed by
 * generate-spec from the 1.5 HTML. We preserve the cluster definition here to maintain backward compatibility.
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "OccupancySensing",
    id: 0x406,
    classification: "application",

    children: [
        { tag: "attribute", name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 5 },

        {
            tag: "attribute",
            name: "FeatureMap",
            id: 0xfffc,
            type: "FeatureMap",
            children: [
                { tag: "field", name: "OTHER", conformance: "O.a+", constraint: "0", title: "Other" },
                { tag: "field", name: "PIR", conformance: "O.a+", constraint: "1", title: "PassiveInfrared" },
                { tag: "field", name: "US", conformance: "O.a+", constraint: "2", title: "Ultrasonic" },
                { tag: "field", name: "PHY", conformance: "O.a+", constraint: "3", title: "PhysicalContact" },
                { tag: "field", name: "AIR", conformance: "O.a+", constraint: "4", title: "ActiveInfrared" },
                { tag: "field", name: "RAD", conformance: "O.a+", constraint: "5", title: "Radar" },
                { tag: "field", name: "RFS", conformance: "O.a+", constraint: "6", title: "RfSensing" },
                { tag: "field", name: "VIS", conformance: "O.a+", constraint: "7", title: "Vision" },
            ],
        },

        {
            tag: "attribute",
            name: "Occupancy",
            id: 0x0,
            type: "OccupancyBitmap",
            access: "R V",
            conformance: "M",
            constraint: "0 to 1",
            quality: "P",
        },
        {
            tag: "attribute",
            name: "OccupancySensorType",
            id: 0x1,
            type: "OccupancySensorTypeEnum",
            access: "R V",
            conformance: "M, D",
            constraint: "desc",
            quality: "F",
        },
        {
            tag: "attribute",
            name: "OccupancySensorTypeBitmap",
            id: 0x2,
            type: "OccupancySensorTypeBitmap",
            access: "R V",
            conformance: "M, D",
            constraint: "0 to 7",
            quality: "F",
        },
        {
            tag: "attribute",
            name: "HoldTime",
            id: 0x3,
            type: "uint16",
            access: "RW VM",
            conformance: "O",
            constraint: "holdTimeLimits.holdTimeMin to holdTimeLimits.holdTimeMax",
            quality: "N",
        },
        {
            tag: "attribute",
            name: "HoldTimeLimits",
            id: 0x4,
            type: "HoldTimeLimitsStruct",
            access: "R V",
            conformance: "HoldTime",
            quality: "F",
        },
        {
            tag: "attribute",
            name: "PirOccupiedToUnoccupiedDelay",
            id: 0x10,
            type: "uint16",
            access: "RW VM",
            conformance: "[HoldTime & (PIR | !PIR & !US & !PHY)], D",
            default: 0,
            quality: "N",
        },
        {
            tag: "attribute",
            name: "PirUnoccupiedToOccupiedDelay",
            id: 0x11,
            type: "uint16",
            access: "RW VM",
            conformance:
                "HoldTime & (PIR | !PIR & !US & !PHY) & PirUnoccupiedToOccupiedThreshold, [HoldTime & (PIR | !PIR & !US & !PHY)], D",
            default: 0,
            quality: "N",
        },
        {
            tag: "attribute",
            name: "PirUnoccupiedToOccupiedThreshold",
            id: 0x12,
            type: "uint8",
            access: "RW VM",
            conformance:
                "HoldTime & (PIR | !PIR & !US & !PHY) & PirUnoccupiedToOccupiedDelay, [HoldTime & (PIR | !PIR & !US & !PHY)], D",
            constraint: "1 to 254",
            default: 1,
            quality: "N",
        },
        {
            tag: "attribute",
            name: "UltrasonicOccupiedToUnoccupiedDelay",
            id: 0x20,
            type: "uint16",
            access: "RW VM",
            conformance: "[HoldTime & US], D",
            default: 0,
            quality: "N",
        },
        {
            tag: "attribute",
            name: "UltrasonicUnoccupiedToOccupiedDelay",
            id: 0x21,
            type: "uint16",
            access: "RW VM",
            conformance: "HoldTime & US & UltrasonicUnoccupiedToOccupiedThreshold, [HoldTime & US], D",
            default: 0,
            quality: "N",
        },
        {
            tag: "attribute",
            name: "UltrasonicUnoccupiedToOccupiedThreshold",
            id: 0x22,
            type: "uint8",
            access: "RW VM",
            conformance: "HoldTime & US & UltrasonicUnoccupiedToOccupiedDelay, [HoldTime & US], D",
            constraint: "1 to 254",
            default: 1,
            quality: "N",
        },
        {
            tag: "attribute",
            name: "PhysicalContactOccupiedToUnoccupiedDelay",
            id: 0x30,
            type: "uint16",
            access: "RW VM",
            conformance: "[HoldTime & PHY], D",
            default: 0,
            quality: "N",
        },
        {
            tag: "attribute",
            name: "PhysicalContactUnoccupiedToOccupiedDelay",
            id: 0x31,
            type: "uint16",
            access: "RW VM",
            conformance: "HoldTime & PHY & PhysicalContactUnoccupiedToOccupiedThreshold, [HoldTime & PHY], D",
            default: 0,
            quality: "N",
        },
        {
            tag: "attribute",
            name: "PhysicalContactUnoccupiedToOccupiedThreshold",
            id: 0x32,
            type: "uint8",
            access: "RW VM",
            conformance: "HoldTime & PHY & PhysicalContactUnoccupiedToOccupiedDelay, [HoldTime & PHY], D",
            constraint: "1 to 254",
            default: 1,
            quality: "N",
        },

        {
            tag: "event",
            name: "OccupancyChanged",
            id: 0x0,
            access: "V",
            conformance: "O",
            priority: "info",
            children: [{ tag: "field", name: "Occupancy", id: 0x0, type: "OccupancyBitmap", conformance: "M" }],
        },

        {
            tag: "datatype",
            name: "OccupancyBitmap",
            type: "map8",
            children: [{ tag: "field", name: "Occupied", constraint: "0" }],
        },
        {
            tag: "datatype",
            name: "OccupancySensorTypeBitmap",
            type: "map8",
            children: [
                { tag: "field", name: "Pir", constraint: "0" },
                { tag: "field", name: "Ultrasonic", constraint: "1" },
                { tag: "field", name: "PhysicalContact", constraint: "2" },
            ],
        },
        {
            tag: "datatype",
            name: "OccupancySensorTypeEnum",
            type: "enum8",
            children: [
                { tag: "field", name: "Pir", id: 0x0, conformance: "M" },
                { tag: "field", name: "Ultrasonic", id: 0x1, conformance: "M" },
                { tag: "field", name: "PirAndUltrasonic", id: 0x2, conformance: "M" },
                { tag: "field", name: "PhysicalContact", id: 0x3, conformance: "M" },
            ],
        },
        {
            tag: "datatype",
            name: "HoldTimeLimitsStruct",
            type: "struct",
            children: [
                { tag: "field", name: "HoldTimeMin", id: 0x0, type: "uint16", conformance: "M", constraint: "min 1" },
                {
                    tag: "field",
                    name: "HoldTimeMax",
                    id: 0x1,
                    type: "uint16",
                    conformance: "M",
                    constraint: "min maxOf(holdTimeMin, 10)",
                },
                {
                    tag: "field",
                    name: "HoldTimeDefault",
                    id: 0x2,
                    type: "uint16",
                    conformance: "M",
                    constraint: "holdTimeMin to holdTimeMax",
                },
            ],
        },
    ],
});
