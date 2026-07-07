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

export const CameraAvSettingsUserLevelManagement = Cluster(
    { name: "CameraAvSettingsUserLevelManagement", id: 0x552, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "DPTZ", conformance: "O.a+", constraint: "0", title: "DigitalPtz" }),
        Field({ name: "MPAN", conformance: "O.a+", constraint: "1", title: "MechanicalPan" }),
        Field({ name: "MTILT", conformance: "O.a+", constraint: "2", title: "MechanicalTilt" }),
        Field({ name: "MZOOM", conformance: "O.a+", constraint: "3", title: "MechanicalZoom" }),
        Field({ name: "MPRESETS", conformance: "[MPAN | MTILT | MZOOM]", constraint: "4", title: "MechanicalPresets" })
    ),

    Attribute({
        name: "MptzPosition", id: 0x0, type: "MPTZStruct", access: "R V",
        conformance: "MPAN | MTILT | MZOOM", quality: "N"
    }),
    Attribute({ name: "MaxPresets", id: 0x1, type: "uint8", access: "R V", conformance: "MPRESETS", quality: "F" }),

    Attribute(
        {
            name: "MptzPresets", id: 0x2, type: "list", access: "R V", conformance: "MPRESETS",
            constraint: "max maxPresets", quality: "N"
        },
        Field({ name: "entry", type: "MPTZPresetStruct" })
    ),

    Attribute(
        { name: "DptzStreams", id: 0x3, type: "list", access: "R V", conformance: "DPTZ", quality: "N" },
        Field({ name: "entry", type: "DPTZStruct" })
    ),
    Attribute({ name: "ZoomMax", id: 0x4, type: "uint8", access: "R V", conformance: "MZOOM", constraint: "2 to 100" }),
    Attribute({ name: "TiltMin", id: 0x5, type: "int16", access: "R V", conformance: "MTILT", constraint: "-180 to 0" }),
    Attribute({ name: "TiltMax", id: 0x6, type: "int16", access: "R V", conformance: "MTILT", constraint: "1 to 180" }),
    Attribute({ name: "PanMin", id: 0x7, type: "int16", access: "R V", conformance: "MPAN", constraint: "-180 to 0" }),
    Attribute({ name: "PanMax", id: 0x8, type: "int16", access: "R V", conformance: "MPAN", constraint: "1 to 180" }),
    Attribute({
        name: "MovementState", id: 0x9, type: "PhysicalMovementEnum", access: "R V",
        conformance: "MPAN | MTILT | MZOOM"
    }),

    Command(
        {
            name: "MptzSetPosition", id: 0x0, access: "O", conformance: "MPAN | MTILT | MZOOM",
            direction: "request", response: "status"
        },
        Field({ name: "Pan", id: 0x0, type: "int16", conformance: "[MPAN].b+", constraint: "panMin to panMax" }),
        Field({ name: "Tilt", id: 0x1, type: "int16", conformance: "[MTILT].b+", constraint: "tiltMin to tiltMax" }),
        Field({ name: "Zoom", id: 0x2, type: "uint8", conformance: "[MZOOM].b+", constraint: "1 to zoomMax" })
    ),

    Command(
        {
            name: "MptzRelativeMove", id: 0x1, access: "O", conformance: "MPAN | MTILT | MZOOM",
            direction: "request", response: "status"
        },
        Field({
            name: "PanDelta", id: 0x0, type: "int16", conformance: "[MPAN].c+",
            constraint: "-1 * (panMax - panMin) to panMax - panMin", default: 0
        }),
        Field({
            name: "TiltDelta", id: 0x1, type: "int16", conformance: "[MTILT].c+",
            constraint: "-1 * (tiltMax - tiltMin) to tiltMax - tiltMin", default: 0
        }),
        Field({
            name: "ZoomDelta", id: 0x2, type: "int8", conformance: "[MZOOM].c+",
            constraint: "-1 * (zoomMax - 1) to zoomMax - 1", default: 0
        })
    ),

    Command(
        {
            name: "MptzMoveToPreset", id: 0x2, access: "O", conformance: "MPRESETS", direction: "request",
            response: "status"
        },
        Field({ name: "PresetId", id: 0x0, type: "uint8", conformance: "M", constraint: "1 to maxPresets" })
    ),

    Command(
        {
            name: "MptzSavePreset", id: 0x3, access: "O", conformance: "MPRESETS", direction: "request",
            response: "status"
        },
        Field({ name: "PresetId", id: 0x0, type: "uint8", conformance: "O", constraint: "1 to maxPresets" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "M", constraint: "max 32" })
    ),

    Command(
        {
            name: "MptzRemovePreset", id: 0x4, access: "O", conformance: "MPRESETS", direction: "request",
            response: "status"
        },
        Field({ name: "PresetId", id: 0x0, type: "uint8", conformance: "M", constraint: "1 to maxPresets" })
    ),

    Command(
        {
            name: "DptzSetViewport", id: 0x5, access: "O", conformance: "DPTZ", direction: "request",
            response: "status"
        },
        Field({ name: "VideoStreamId", id: 0x0, type: "CameraAvStreamManagement.VideoStreamID", conformance: "M" }),
        Field({ name: "Viewport", id: 0x1, type: "ViewportStruct", conformance: "M" })
    ),

    Command(
        {
            name: "DptzRelativeMove", id: 0x6, access: "O", conformance: "[DPTZ]", direction: "request",
            response: "status"
        },
        Field({ name: "VideoStreamId", id: 0x0, type: "CameraAvStreamManagement.VideoStreamID", conformance: "M" }),
        Field({ name: "DeltaX", id: 0x1, type: "int16", conformance: "O.d+", default: 0 }),
        Field({ name: "DeltaY", id: 0x2, type: "int16", conformance: "O.d+", default: 0 }),
        Field({ name: "ZoomDelta", id: 0x3, type: "int8", conformance: "O.d+", constraint: "-100 to 100", default: 0 })
    ),

    Datatype(
        { name: "PhysicalMovementEnum", type: "enum8" },
        Field({ name: "Idle", id: 0x0, conformance: "M" }),
        Field({ name: "Moving", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "DPTZStruct", type: "struct" },
        Field({ name: "VideoStreamId", id: 0x0, type: "CameraAvStreamManagement.VideoStreamID", conformance: "M" }),
        Field({ name: "Viewport", id: 0x1, type: "ViewportStruct", conformance: "M" })
    ),

    Datatype(
        { name: "MPTZStruct", type: "struct" },
        Field({ name: "Pan", id: 0x0, type: "int16", conformance: "MPAN", constraint: "panMin to panMax" }),
        Field({ name: "Tilt", id: 0x1, type: "int16", conformance: "MTILT", constraint: "tiltMin to tiltMax" }),
        Field({ name: "Zoom", id: 0x2, type: "uint8", conformance: "MZOOM", constraint: "1 to zoomMax" })
    ),

    Datatype(
        { name: "MPTZPresetStruct", type: "struct" },
        Field({ name: "PresetId", id: 0x0, type: "uint8", conformance: "M", constraint: "1 to maxPresets" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "M", constraint: "max 32" }),
        Field({ name: "Settings", id: 0x2, type: "MPTZStruct", conformance: "M" })
    )
);

MatterDefinition.children.push(CameraAvSettingsUserLevelManagement);
