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
    CommandElement as Command,
    DatatypeElement as Datatype,
    FieldElement as Field
} from "../../elements/index.js";

export const RvcOperationalState = Cluster(
    { name: "RvcOperationalState", id: 0x61, type: "OperationalState" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),
    Command({ name: "Pause", id: 0x0 }),
    Command({ name: "Stop", id: 0x1, conformance: "X" }),
    Command({ name: "Start", id: 0x2, conformance: "X" }),
    Command({ name: "Resume", id: 0x3 }),
    Command({ name: "OperationalCommandResponse", id: 0x4 }),
    Command({
        name: "GoHome", id: 0x80, access: "O", conformance: "O", direction: "request",
        response: "OperationalCommandResponse"
    }),

    Datatype(
        { name: "OperationalStateEnum", type: "enum8" },
        Field({ name: "Stopped", id: 0x0, conformance: "M" }),
        Field({ name: "Running", id: 0x1, conformance: "M" }),
        Field({ name: "Paused", id: 0x2, conformance: "M" }),
        Field({ name: "Error", id: 0x3, conformance: "M" }),
        Field({ name: "SeekingCharger", id: 0x40, conformance: "M" }),
        Field({ name: "Charging", id: 0x41, conformance: "M" }),
        Field({ name: "Docked", id: 0x42, conformance: "M" }),
        Field({ name: "EmptyingDustBin", id: 0x43, conformance: "O" }),
        Field({ name: "CleaningMop", id: 0x44, conformance: "O" }),
        Field({ name: "FillingWaterTank", id: 0x45, conformance: "O" }),
        Field({ name: "UpdatingMaps", id: 0x46, conformance: "O" })
    ),

    Datatype(
        { name: "ErrorStateEnum", type: "enum8" },
        Field({ name: "NoError", id: 0x0, conformance: "M" }),
        Field({ name: "UnableToStartOrResume", id: 0x1, conformance: "M" }),
        Field({ name: "UnableToCompleteOperation", id: 0x2, conformance: "M" }),
        Field({ name: "CommandInvalidInState", id: 0x3, conformance: "M" }),
        Field({ name: "FailedToFindChargingDock", id: 0x40, conformance: "M" }),
        Field({ name: "Stuck", id: 0x41, conformance: "M" }),
        Field({ name: "DustBinMissing", id: 0x42, conformance: "M" }),
        Field({ name: "DustBinFull", id: 0x43, conformance: "M" }),
        Field({ name: "WaterTankEmpty", id: 0x44, conformance: "M" }),
        Field({ name: "WaterTankMissing", id: 0x45, conformance: "M" }),
        Field({ name: "WaterTankLidOpen", id: 0x46, conformance: "M" }),
        Field({ name: "MopCleaningPadMissing", id: 0x47, conformance: "M" }),
        Field({ name: "LowBattery", id: 0x48, conformance: "M" }),
        Field({ name: "CannotReachTargetArea", id: 0x49, conformance: "M" }),
        Field({ name: "DirtyWaterTankFull", id: 0x4a, conformance: "M" }),
        Field({ name: "DirtyWaterTankMissing", id: 0x4b, conformance: "M" }),
        Field({ name: "WheelsJammed", id: 0x4c, conformance: "M" }),
        Field({ name: "BrushJammed", id: 0x4d, conformance: "M" }),
        Field({ name: "NavigationSensorObscured", id: 0x4e, conformance: "M" })
    )
);

MatterDefinition.children.push(RvcOperationalState);
