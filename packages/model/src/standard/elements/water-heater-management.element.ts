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

export const WaterHeaterManagement = Cluster(
    { name: "WaterHeaterManagement", id: 0x94, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "EM", conformance: "O", constraint: "0", title: "EnergyManagement" }),
        Field({ name: "TP", conformance: "O", constraint: "1", title: "TankPercent" })
    ),
    Attribute({
        name: "HeaterTypes", id: 0x0, type: "WaterHeaterHeatSourceBitmap", access: "R V", conformance: "M",
        quality: "F"
    }),
    Attribute({ name: "HeatDemand", id: 0x1, type: "WaterHeaterHeatSourceBitmap", access: "R V", conformance: "M" }),
    Attribute({ name: "TankVolume", id: 0x2, type: "uint16", access: "R V", conformance: "EM" }),
    Attribute({
        name: "EstimatedHeatRequired", id: 0x3, type: "energy-mWh", access: "R V", conformance: "EM",
        constraint: "min 0"
    }),
    Attribute({ name: "TankPercentage", id: 0x4, type: "percent", access: "R V", conformance: "TP" }),
    Attribute({ name: "BoostState", id: 0x5, type: "BoostStateEnum", access: "R V", conformance: "M" }),
    Event(
        { name: "BoostStarted", id: 0x0, access: "V", conformance: "M", priority: "info" },
        Field({ name: "BoostInfo", id: 0x0, type: "WaterHeaterBoostInfoStruct", conformance: "M" })
    ),
    Event({ name: "BoostEnded", id: 0x1, access: "V", conformance: "M", priority: "info" }),
    Command(
        { name: "Boost", id: 0x0, access: "M", conformance: "M", direction: "request", response: "status" },
        Field({ name: "BoostInfo", id: 0x0, type: "WaterHeaterBoostInfoStruct", conformance: "M" })
    ),
    Command({ name: "CancelBoost", id: 0x1, access: "M", conformance: "M", direction: "request", response: "status" }),

    Datatype(
        { name: "WaterHeaterHeatSourceBitmap", type: "map8" },
        Field({ name: "ImmersionElement1", constraint: "0" }),
        Field({ name: "ImmersionElement2", constraint: "1" }),
        Field({ name: "HeatPump", constraint: "2" }),
        Field({ name: "Boiler", constraint: "3" }),
        Field({ name: "Other", constraint: "4" })
    ),

    Datatype(
        { name: "BoostStateEnum", type: "enum8" },
        Field({ name: "Inactive", id: 0x0, conformance: "M" }),
        Field({ name: "Active", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "WaterHeaterBoostInfoStruct", type: "struct" },
        Field({ name: "Duration", id: 0x0, type: "elapsed-s", conformance: "M", constraint: "min 1" }),
        Field({ name: "OneShot", id: 0x1, type: "bool", conformance: "[!TP], [TP].a-", default: false }),
        Field({ name: "EmergencyBoost", id: 0x2, type: "bool", conformance: "O", default: false }),
        Field({ name: "TemporarySetpoint", id: 0x3, type: "temperature", conformance: "O", constraint: "desc" }),
        Field({ name: "TargetPercentage", id: 0x4, type: "percent", conformance: "TargetReheat, [TP]" }),
        Field({ name: "TargetReheat", id: 0x5, type: "percent", conformance: "[TP].a-", constraint: "max targetPercentage" })
    )
);

MatterDefinition.children.push(WaterHeaterManagement);
