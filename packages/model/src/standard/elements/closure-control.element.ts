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
    EventElement as Event,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const ClosureControl = Cluster(
    { name: "ClosureControl", id: 0x104, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PS", conformance: "O.a+", constraint: "0", title: "Positioning" }),
        Field({ name: "LT", conformance: "O.a+", constraint: "1", title: "MotionLatching" }),
        Field({ name: "IS", conformance: "O", constraint: "2", title: "Instantaneous" }),
        Field({ name: "SP", conformance: "[PS & !IS]", constraint: "3", title: "Speed" }),
        Field({ name: "VT", conformance: "[PS]", constraint: "4", title: "Ventilation" }),
        Field({ name: "PD", conformance: "[PS]", constraint: "5", title: "Pedestrian" }),
        Field({ name: "CL", conformance: "[PS]", constraint: "6", title: "Calibration" }),
        Field({ name: "PT", conformance: "O", constraint: "7", title: "Protection" }),
        Field({ name: "MO", conformance: "O", constraint: "8", title: "ManuallyOperable" })
    ),

    Attribute({
        name: "CountdownTime", id: 0x0, type: "elapsed-s", access: "R V", conformance: "[PS & !IS]",
        constraint: "max 259200", default: null, quality: "X Q"
    }),
    Attribute({ name: "MainState", id: 0x1, type: "MainStateEnum", access: "R V", conformance: "M" }),
    Attribute(
        { name: "CurrentErrorList", id: 0x2, type: "list", access: "R V", conformance: "M", constraint: "max 10[all]" },
        Field({ name: "entry", type: "ClosureErrorEnum" })
    ),
    Attribute({
        name: "OverallCurrentState", id: 0x3, type: "OverallCurrentStateStruct", access: "R V",
        conformance: "M", default: null, quality: "X"
    }),
    Attribute({
        name: "OverallTargetState", id: 0x4, type: "OverallTargetStateStruct", access: "R V",
        conformance: "M", default: null, quality: "X"
    }),
    Attribute({
        name: "LatchControlModes", id: 0x5, type: "LatchControlModesBitmap", access: "R V",
        conformance: "LT", quality: "F"
    }),

    Event(
        { name: "OperationalError", id: 0x0, access: "V", conformance: "M", priority: "critical" },
        Field(
            { name: "ErrorState", id: 0x0, type: "list", conformance: "M", constraint: "1 to 10[all]" },
            Field({ name: "entry", type: "ClosureErrorEnum" })
        )
    ),

    Event({ name: "MovementCompleted", id: 0x1, access: "V", conformance: "!IS", priority: "info" }),
    Event(
        { name: "EngageStateChanged", id: 0x2, access: "V", conformance: "MO", priority: "info" },
        Field({ name: "EngageValue", id: 0x0, type: "bool", conformance: "M" })
    ),
    Event(
        { name: "SecureStateChanged", id: 0x3, access: "V", conformance: "M", priority: "info" },
        Field({ name: "SecureValue", id: 0x0, type: "bool", conformance: "M" })
    ),
    Command({ name: "Stop", id: 0x0, access: "O", conformance: "!IS", direction: "request", response: "status" }),

    Command(
        { name: "MoveTo", id: 0x1, access: "O T", conformance: "M", direction: "request", response: "status" },
        Field({ name: "Position", id: 0x0, type: "TargetPositionEnum", conformance: "O.a+" }),
        Field({ name: "Latch", id: 0x1, type: "bool", conformance: "O.a+" }),
        Field({ name: "Speed", id: 0x2, type: "ThreeLevelAutoEnum", conformance: "O.a+", default: 0 })
    ),

    Command({ name: "Calibrate", id: 0x2, access: "M T", conformance: "CL", direction: "request", response: "status" }),

    Datatype(
        { name: "CurrentPositionEnum", type: "enum8" },
        Field({ name: "FullyClosed", id: 0x0, conformance: "M" }),
        Field({ name: "FullyOpened", id: 0x1, conformance: "M" }),
        Field({ name: "PartiallyOpened", id: 0x2, conformance: "M" }),
        Field({ name: "OpenedForPedestrian", id: 0x3, conformance: "PD" }),
        Field({ name: "OpenedForVentilation", id: 0x4, conformance: "VT" }),
        Field({ name: "OpenedAtSignature", id: 0x5, conformance: "M" })
    ),

    Datatype(
        { name: "TargetPositionEnum", type: "enum8" },
        Field({ name: "MoveToFullyClosed", id: 0x0, conformance: "M" }),
        Field({ name: "MoveToFullyOpen", id: 0x1, conformance: "M" }),
        Field({ name: "MoveToPedestrianPosition", id: 0x2, conformance: "PD" }),
        Field({ name: "MoveToVentilationPosition", id: 0x3, conformance: "VT" }),
        Field({ name: "MoveToSignaturePosition", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "MainStateEnum", type: "enum8" },
        Field({ name: "Stopped", id: 0x0, conformance: "M" }),
        Field({ name: "Moving", id: 0x1, conformance: "M" }),
        Field({ name: "WaitingForMotion", id: 0x2, conformance: "M" }),
        Field({ name: "Error", id: 0x3, conformance: "M" }),
        Field({ name: "Calibrating", id: 0x4, conformance: "CL" }),
        Field({ name: "Protected", id: 0x5, conformance: "PT" }),
        Field({ name: "Disengaged", id: 0x6, conformance: "MO" }),
        Field({ name: "SetupRequired", id: 0x7, conformance: "M" })
    ),

    Datatype(
        { name: "ClosureErrorEnum", type: "enum8" },
        Field({ name: "PhysicallyBlocked", id: 0x0, conformance: "M" }),
        Field({ name: "BlockedBySensor", id: 0x1, conformance: "M" }),
        Field({ name: "TemperatureLimited", id: 0x2, conformance: "M" }),
        Field({ name: "MaintenanceRequired", id: 0x3, conformance: "M" }),
        Field({ name: "InternalInterference", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "OverallCurrentStateStruct", type: "struct" },
        Field({
            name: "Position", id: 0x0, type: "CurrentPositionEnum", conformance: "PS", constraint: "desc",
            default: null, quality: "X"
        }),
        Field({ name: "Latch", id: 0x1, type: "bool", conformance: "LT", constraint: "desc", default: null, quality: "X" }),
        Field({ name: "Speed", id: 0x2, type: "ThreeLevelAutoEnum", conformance: "SP", constraint: "desc" }),
        Field({
            name: "SecureState", id: 0x3, type: "bool", conformance: "M", constraint: "desc", default: null,
            quality: "X"
        })
    ),

    Datatype(
        { name: "OverallTargetStateStruct", type: "struct" },
        Field({ name: "Position", id: 0x0, type: "TargetPositionEnum", conformance: "PS", default: null, quality: "X" }),
        Field({ name: "Latch", id: 0x1, type: "bool", conformance: "LT", default: null, quality: "X" }),
        Field({ name: "Speed", id: 0x2, type: "ThreeLevelAutoEnum", conformance: "SP" })
    ),

    Datatype(
        { name: "LatchControlModesBitmap", type: "map8" },
        Field({ name: "RemoteLatching", constraint: "0" }),
        Field({ name: "RemoteUnlatching", constraint: "1" })
    )
);

MatterDefinition.children.push(ClosureControl);
