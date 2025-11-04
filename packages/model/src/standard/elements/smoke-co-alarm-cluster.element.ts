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

export const SmokeCoAlarm = Cluster(
    { name: "SmokeCoAlarm", id: 0x5c, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "SMOKE", conformance: "O.a+", constraint: "0", title: "SmokeAlarm" }),
        Field({ name: "CO", conformance: "O.a+", constraint: "1", title: "CoAlarm" })
    ),
    Attribute(
        { name: "ExpressedState", id: 0x0, type: "ExpressedStateEnum", access: "R V", conformance: "M", quality: "N" }
    ),
    Attribute({ name: "SmokeState", id: 0x1, type: "AlarmStateEnum", access: "R V", conformance: "SMOKE", quality: "N" }),
    Attribute({ name: "CoState", id: 0x2, type: "AlarmStateEnum", access: "R V", conformance: "CO", quality: "N" }),
    Attribute({ name: "BatteryAlert", id: 0x3, type: "AlarmStateEnum", access: "R V", conformance: "M", quality: "N" }),
    Attribute({ name: "DeviceMuted", id: 0x4, type: "MuteStateEnum", access: "R V", conformance: "O", quality: "N" }),
    Attribute({ name: "TestInProgress", id: 0x5, type: "bool", access: "R V", conformance: "M" }),
    Attribute({ name: "HardwareFaultAlert", id: 0x6, type: "bool", access: "R V", conformance: "M", quality: "N" }),
    Attribute(
        { name: "EndOfServiceAlert", id: 0x7, type: "EndOfServiceEnum", access: "R V", conformance: "M", quality: "N" }
    ),
    Attribute({ name: "InterconnectSmokeAlarm", id: 0x8, type: "AlarmStateEnum", access: "R V", conformance: "O" }),
    Attribute({ name: "InterconnectCoAlarm", id: 0x9, type: "AlarmStateEnum", access: "R V", conformance: "O" }),
    Attribute(
        { name: "ContaminationState", id: 0xa, type: "ContaminationStateEnum", access: "R V", conformance: "[SMOKE]" }
    ),
    Attribute({ name: "SmokeSensitivityLevel", id: 0xb, type: "SensitivityEnum", access: "RW VM", conformance: "[SMOKE]" }),
    Attribute({ name: "ExpiryDate", id: 0xc, type: "epoch-s", access: "R V", conformance: "O", quality: "F" }),
    Event(
        { name: "SmokeAlarm", id: 0x0, access: "V", conformance: "SMOKE", priority: "critical" },
        Field({ name: "AlarmSeverityLevel", id: 0x0, type: "AlarmStateEnum", conformance: "M" })
    ),
    Event(
        { name: "CoAlarm", id: 0x1, access: "V", conformance: "CO", priority: "critical" },
        Field({ name: "AlarmSeverityLevel", id: 0x0, type: "AlarmStateEnum", conformance: "M" })
    ),
    Event(
        { name: "LowBattery", id: 0x2, access: "V", conformance: "M", priority: "info" },
        Field({ name: "AlarmSeverityLevel", id: 0x0, type: "AlarmStateEnum", conformance: "M" })
    ),
    Event({ name: "HardwareFault", id: 0x3, access: "V", conformance: "M", priority: "info" }),
    Event({ name: "EndOfService", id: 0x4, access: "V", conformance: "M", priority: "info" }),
    Event({ name: "SelfTestComplete", id: 0x5, access: "V", conformance: "M", priority: "info" }),
    Event({ name: "AlarmMuted", id: 0x6, access: "V", conformance: "O", priority: "info" }),
    Event({ name: "MuteEnded", id: 0x7, access: "V", conformance: "O", priority: "info" }),
    Event(
        { name: "InterconnectSmokeAlarm", id: 0x8, access: "V", conformance: "[SMOKE]", priority: "critical" },
        Field({ name: "AlarmSeverityLevel", id: 0x0, type: "AlarmStateEnum", conformance: "M" })
    ),
    Event(
        { name: "InterconnectCoAlarm", id: 0x9, access: "V", conformance: "[CO]", priority: "critical" },
        Field({ name: "AlarmSeverityLevel", id: 0x0, type: "AlarmStateEnum", conformance: "M" })
    ),
    Event({ name: "AllClear", id: 0xa, access: "V", conformance: "M", priority: "info" }),
    Command({ name: "SelfTestRequest", id: 0x0, access: "O", conformance: "O", direction: "request", response: "status" }),

    Datatype(
        { name: "AlarmStateEnum", type: "enum8" },
        Field({ name: "Normal", id: 0x0, conformance: "M" }),
        Field({ name: "Warning", id: 0x1, conformance: "O" }),
        Field({ name: "Critical", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "SensitivityEnum", type: "enum8" },
        Field({ name: "High", id: 0x0, conformance: "O" }),
        Field({ name: "Standard", id: 0x1, conformance: "M" }),
        Field({ name: "Low", id: 0x2, conformance: "O" })
    ),

    Datatype(
        { name: "ExpressedStateEnum", type: "enum8" },
        Field({ name: "Normal", id: 0x0, conformance: "M" }),
        Field({ name: "SmokeAlarm", id: 0x1, conformance: "SMOKE" }),
        Field({ name: "CoAlarm", id: 0x2, conformance: "CO" }),
        Field({ name: "BatteryAlert", id: 0x3, conformance: "M" }),
        Field({ name: "Testing", id: 0x4, conformance: "M" }),
        Field({ name: "HardwareFault", id: 0x5, conformance: "M" }),
        Field({ name: "EndOfService", id: 0x6, conformance: "M" }),
        Field({ name: "InterconnectSmoke", id: 0x7, conformance: "O" }),
        Field({ name: "InterconnectCo", id: 0x8, conformance: "O" })
    ),

    Datatype(
        { name: "MuteStateEnum", type: "enum8" },
        Field({ name: "NotMuted", id: 0x0, conformance: "M" }),
        Field({ name: "Muted", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "EndOfServiceEnum", type: "enum8" },
        Field({ name: "Normal", id: 0x0, conformance: "M" }),
        Field({ name: "Expired", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "ContaminationStateEnum", type: "enum8" },
        Field({ name: "Normal", id: 0x0, conformance: "M" }),
        Field({ name: "Low", id: 0x1, conformance: "O" }),
        Field({ name: "Warning", id: 0x2, conformance: "O" }),
        Field({ name: "Critical", id: 0x3, conformance: "M" })
    )
);

MatterDefinition.children.push(SmokeCoAlarm);
