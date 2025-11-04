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
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const BooleanStateConfiguration = Cluster(
    { name: "BooleanStateConfiguration", id: 0x80, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "VIS", conformance: "O", constraint: "0", title: "Visual" }),
        Field({ name: "AUD", conformance: "O", constraint: "1", title: "Audible" }),
        Field({ name: "SPRS", conformance: "[VIS | AUD]", constraint: "2", title: "AlarmSuppress" }),
        Field({ name: "SENSLVL", conformance: "O", constraint: "3", title: "SensitivityLevel" })
    ),

    Attribute({
        name: "CurrentSensitivityLevel", id: 0x0, type: "uint8", access: "RW VO", conformance: "SENSLVL",
        constraint: "max supportedSensitivityLevels - 1", quality: "N"
    }),
    Attribute({
        name: "SupportedSensitivityLevels", id: 0x1, type: "uint8", access: "R V", conformance: "SENSLVL",
        constraint: "2 to 10", quality: "F"
    }),
    Attribute({
        name: "DefaultSensitivityLevel", id: 0x2, type: "uint8", access: "R V", conformance: "[SENSLVL]",
        constraint: "max supportedSensitivityLevels - 1", quality: "F"
    }),
    Attribute({ name: "AlarmsActive", id: 0x3, type: "AlarmModeBitmap", access: "R V", conformance: "VIS | AUD" }),
    Attribute({ name: "AlarmsSuppressed", id: 0x4, type: "AlarmModeBitmap", access: "R V", conformance: "SPRS" }),
    Attribute({
        name: "AlarmsEnabled", id: 0x5, type: "AlarmModeBitmap", access: "R V", conformance: "[VIS | AUD]",
        quality: "N"
    }),
    Attribute({
        name: "AlarmsSupported", id: 0x6, type: "AlarmModeBitmap", access: "R V", conformance: "VIS | AUD",
        quality: "F"
    }),
    Attribute({ name: "SensorFault", id: 0x7, type: "SensorFaultBitmap", access: "R V", conformance: "O", default: 0 }),
    Event(
        { name: "AlarmsStateChanged", id: 0x0, access: "V", conformance: "VIS | AUD", priority: "info" },
        Field({ name: "AlarmsActive", id: 0x0, type: "AlarmModeBitmap", conformance: "M" }),
        Field({ name: "AlarmsSuppressed", id: 0x1, type: "AlarmModeBitmap", conformance: "SPRS" })
    ),
    Event(
        { name: "SensorFault", id: 0x1, access: "V", conformance: "O", priority: "info" },
        Field({ name: "SensorFault", id: 0x0, type: "SensorFaultBitmap", conformance: "M" })
    ),
    Command(
        { name: "SuppressAlarm", id: 0x0, access: "O", conformance: "SPRS", direction: "request", response: "status" },
        Field({ name: "AlarmsToSuppress", id: 0x0, type: "AlarmModeBitmap", conformance: "M" })
    ),

    Command(
        {
            name: "EnableDisableAlarm", id: 0x1, access: "O", conformance: "VIS | AUD", direction: "request",
            response: "status"
        },
        Field({ name: "AlarmsToEnableDisable", id: 0x0, type: "AlarmModeBitmap", conformance: "M" })
    ),

    Datatype(
        { name: "AlarmModeBitmap", type: "map8" },
        Field({ name: "Visual", constraint: "0" }),
        Field({ name: "Audible", constraint: "1" })
    ),
    Datatype({ name: "SensorFaultBitmap", type: "map16" }, Field({ name: "GeneralFault", constraint: "0" }))
);

MatterDefinition.children.push(BooleanStateConfiguration);
