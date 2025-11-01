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

export const ColorControl = Cluster(
    { name: "ColorControl", id: 0x300 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 7 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "HS", conformance: "EHUE, O", constraint: "0", title: "HueSaturation" }),
        Field({ name: "EHUE", conformance: "CL, O", constraint: "1", title: "EnhancedHue" }),
        Field({ name: "CL", conformance: "O", constraint: "2", title: "ColorLoop" }),
        Field({ name: "XY", conformance: "O", constraint: "3", title: "Xy" }),
        Field({ name: "CT", conformance: "O", constraint: "4", title: "ColorTemperature" })
    ),

    Attribute({
        name: "CurrentHue", id: 0x0, type: "uint8", access: "R V", conformance: "HS", constraint: "max 254",
        quality: "N P Q"
    }),
    Attribute({
        name: "CurrentSaturation", id: 0x1, type: "uint8", access: "R V", conformance: "HS",
        constraint: "max 254", quality: "N S P Q"
    }),
    Attribute({
        name: "RemainingTime", id: 0x2, type: "uint16", access: "R V", conformance: "O",
        constraint: "0 to 65535", default: 0, quality: "Q"
    }),
    Attribute({
        name: "CurrentX", id: 0x3, type: "uint16", access: "R V", conformance: "XY",
        constraint: "max 65279", quality: "N S P Q"
    }),
    Attribute({
        name: "CurrentY", id: 0x4, type: "uint16", access: "R V", conformance: "XY",
        constraint: "max 65279", quality: "N S P Q"
    }),
    Attribute({ name: "DriftCompensation", id: 0x5, type: "DriftCompensationEnum", access: "R V", conformance: "O" }),
    Attribute(
        { name: "CompensationText", id: 0x6, type: "string", access: "R V", conformance: "O", constraint: "max 254" }
    ),
    Attribute({
        name: "ColorTemperatureMireds", id: 0x7, type: "uint16", access: "R V", conformance: "CT",
        constraint: "colorTempPhysicalMinMireds to colorTempPhysicalMaxMireds", quality: "N S P Q"
    }),
    Attribute({ name: "ColorMode", id: 0x8, type: "ColorModeEnum", access: "R V", conformance: "M", quality: "N" }),
    Attribute({ name: "Options", id: 0xf, type: "OptionsBitmap", access: "RW VO", conformance: "M", constraint: "desc" }),
    Attribute({
        name: "NumberOfPrimaries", id: 0x10, type: "uint8", access: "R V", conformance: "M",
        constraint: "max 6", quality: "X F"
    }),
    Attribute({
        name: "Primary1X", id: 0x11, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 0",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary1Y", id: 0x12, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 0",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary1Intensity", id: 0x13, type: "uint8", access: "R V",
        conformance: "NumberOfPrimaries > 0", quality: "X F"
    }),
    Attribute({
        name: "Primary2X", id: 0x15, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 1",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary2Y", id: 0x16, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 1",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary2Intensity", id: 0x17, type: "uint8", access: "R V",
        conformance: "NumberOfPrimaries > 1", quality: "X F"
    }),
    Attribute({
        name: "Primary3X", id: 0x19, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 2",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary3Y", id: 0x1a, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 2",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary3Intensity", id: 0x1b, type: "uint8", access: "R V",
        conformance: "NumberOfPrimaries > 2", quality: "X F"
    }),
    Attribute({
        name: "Primary4X", id: 0x20, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 3",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary4Y", id: 0x21, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 3",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary4Intensity", id: 0x22, type: "uint8", access: "R V",
        conformance: "NumberOfPrimaries > 3", quality: "X F"
    }),
    Attribute({
        name: "Primary5X", id: 0x24, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 4",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary5Y", id: 0x25, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 4",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary5Intensity", id: 0x26, type: "uint8", access: "R V",
        conformance: "NumberOfPrimaries > 4", quality: "X F"
    }),
    Attribute({
        name: "Primary6X", id: 0x28, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 5",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary6Y", id: 0x29, type: "uint16", access: "R V", conformance: "NumberOfPrimaries > 5",
        constraint: "max 65279", quality: "F"
    }),
    Attribute({
        name: "Primary6Intensity", id: 0x2a, type: "uint8", access: "R V",
        conformance: "NumberOfPrimaries > 5", quality: "X F"
    }),
    Attribute(
        { name: "WhitePointX", id: 0x30, type: "uint16", access: "RW VM", conformance: "O", constraint: "max 65279" }
    ),
    Attribute(
        { name: "WhitePointY", id: 0x31, type: "uint16", access: "RW VM", conformance: "O", constraint: "max 65279" }
    ),
    Attribute(
        { name: "ColorPointRx", id: 0x32, type: "uint16", access: "RW VM", conformance: "O", constraint: "max 65279" }
    ),
    Attribute(
        { name: "ColorPointRy", id: 0x33, type: "uint16", access: "RW VM", conformance: "O", constraint: "max 65279" }
    ),
    Attribute({ name: "ColorPointRIntensity", id: 0x34, type: "uint8", access: "RW VM", conformance: "O", quality: "X" }),
    Attribute(
        { name: "ColorPointGx", id: 0x36, type: "uint16", access: "RW VM", conformance: "O", constraint: "max 65279" }
    ),
    Attribute(
        { name: "ColorPointGy", id: 0x37, type: "uint16", access: "RW VM", conformance: "O", constraint: "max 65279" }
    ),
    Attribute({ name: "ColorPointGIntensity", id: 0x38, type: "uint8", access: "RW VM", conformance: "O", quality: "X" }),
    Attribute(
        { name: "ColorPointBx", id: 0x3a, type: "uint16", access: "RW VM", conformance: "O", constraint: "max 65279" }
    ),
    Attribute(
        { name: "ColorPointBy", id: 0x3b, type: "uint16", access: "RW VM", conformance: "O", constraint: "max 65279" }
    ),
    Attribute({ name: "ColorPointBIntensity", id: 0x3c, type: "uint8", access: "RW VM", conformance: "O", quality: "X" }),
    Attribute({ name: "EnhancedCurrentHue", id: 0x4000, type: "uint16", access: "R V", conformance: "EHUE", quality: "N S Q" }),
    Attribute({
        name: "EnhancedColorMode", id: 0x4001, type: "EnhancedColorModeEnum", access: "R V",
        conformance: "M", quality: "N S"
    }),

    Attribute(
        {
            name: "ColorLoopActive", id: 0x4002, type: "enum8", access: "R V", conformance: "CL",
            constraint: "max 1", quality: "N S"
        },
        Field({ name: "Inactive", id: 0x0 }),
        Field({ name: "Active", id: 0x1 })
    ),

    Attribute({
        name: "ColorLoopDirection", id: 0x4003, type: "ColorLoopDirectionEnum", access: "R V",
        conformance: "CL", quality: "N S"
    }),
    Attribute({ name: "ColorLoopTime", id: 0x4004, type: "uint16", access: "R V", conformance: "CL", quality: "N S" }),
    Attribute({ name: "ColorLoopStartEnhancedHue", id: 0x4005, type: "uint16", access: "R V", conformance: "CL" }),
    Attribute({ name: "ColorLoopStoredEnhancedHue", id: 0x4006, type: "uint16", access: "R V", conformance: "CL" }),

    Attribute(
        { name: "ColorCapabilities", id: 0x400a, type: "map16", access: "R V", conformance: "M", constraint: "max 31" },
        Field({ name: "HueSaturation", constraint: "0" }),
        Field({ name: "EnhancedHue", constraint: "1" }),
        Field({ name: "ColorLoop", constraint: "2" }),
        Field({ name: "XY", constraint: "3" }),
        Field({ name: "ColorTemperature", constraint: "4" })
    ),

    Attribute({
        name: "ColorTempPhysicalMinMireds", id: 0x400b, type: "uint16", access: "R V", conformance: "CT",
        constraint: "1 to 65279"
    }),
    Attribute({
        name: "ColorTempPhysicalMaxMireds", id: 0x400c, type: "uint16", access: "R V", conformance: "CT",
        constraint: "max 65279"
    }),
    Attribute({
        name: "CoupleColorTempToLevelMinMireds", id: 0x400d, type: "uint16", access: "R V",
        conformance: "CT & ColorTemperatureMireds",
        constraint: "colorTempPhysicalMinMireds to colorTemperatureMireds"
    }),
    Attribute({
        name: "StartUpColorTemperatureMireds", id: 0x4010, type: "uint16", access: "RW VM",
        conformance: "CT & ColorTemperatureMireds", constraint: "1 to 65279", quality: "X N"
    }),

    Command(
        { name: "MoveToHue", id: 0x0, access: "O", conformance: "HS", direction: "request", response: "status" },
        Field({ name: "Hue", id: 0x0, type: "uint8", conformance: "M", constraint: "max 254" }),
        Field({ name: "Direction", id: 0x1, type: "DirectionEnum", conformance: "M" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "MoveHue", id: 0x1, access: "O", conformance: "HS", direction: "request", response: "status" },
        Field({ name: "MoveMode", id: 0x0, type: "MoveModeEnum", conformance: "M" }),
        Field({ name: "Rate", id: 0x1, type: "uint8", conformance: "M" }),
        Field({ name: "OptionsMask", id: 0x2, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "StepHue", id: 0x2, access: "O", conformance: "HS", direction: "request", response: "status" },
        Field({ name: "StepMode", id: 0x0, type: "StepModeEnum", conformance: "M" }),
        Field({ name: "StepSize", id: 0x1, type: "uint8", conformance: "M" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint8", conformance: "M" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "MoveToSaturation", id: 0x3, access: "O", conformance: "HS", direction: "request", response: "status" },
        Field({ name: "Saturation", id: 0x0, type: "uint8", conformance: "M", constraint: "max 254" }),
        Field({ name: "TransitionTime", id: 0x1, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x2, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "MoveSaturation", id: 0x4, access: "O", conformance: "HS", direction: "request", response: "status" },
        Field({ name: "MoveMode", id: 0x0, type: "MoveModeEnum", conformance: "M" }),
        Field({ name: "Rate", id: 0x1, type: "uint8", conformance: "M" }),
        Field({ name: "OptionsMask", id: 0x2, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "StepSaturation", id: 0x5, access: "O", conformance: "HS", direction: "request", response: "status" },
        Field({ name: "StepMode", id: 0x0, type: "StepModeEnum", conformance: "M" }),
        Field({ name: "StepSize", id: 0x1, type: "uint8", conformance: "M" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint8", conformance: "M" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "MoveToHueAndSaturation", id: 0x6, access: "O", conformance: "HS", direction: "request",
            response: "status"
        },
        Field({ name: "Hue", id: 0x0, type: "uint8", conformance: "M", constraint: "max 254" }),
        Field({ name: "Saturation", id: 0x1, type: "uint8", conformance: "M", constraint: "max 254" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "MoveToColor", id: 0x7, access: "O", conformance: "XY", direction: "request", response: "status" },
        Field({ name: "ColorX", id: 0x0, type: "uint16", conformance: "M", constraint: "max 65279" }),
        Field({ name: "ColorY", id: 0x1, type: "uint16", conformance: "M", constraint: "max 65279" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "MoveColor", id: 0x8, access: "O", conformance: "XY", direction: "request", response: "status" },
        Field({ name: "RateX", id: 0x0, type: "int16", conformance: "M" }),
        Field({ name: "RateY", id: 0x1, type: "int16", conformance: "M" }),
        Field({ name: "OptionsMask", id: 0x2, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "StepColor", id: 0x9, access: "O", conformance: "XY", direction: "request", response: "status" },
        Field({ name: "StepX", id: 0x0, type: "int16", conformance: "M" }),
        Field({ name: "StepY", id: 0x1, type: "int16", conformance: "M" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "MoveToColorTemperature", id: 0xa, access: "O", conformance: "CT", direction: "request",
            response: "status"
        },
        Field({ name: "ColorTemperatureMireds", id: 0x0, type: "uint16", conformance: "M", constraint: "max 65279" }),
        Field({ name: "TransitionTime", id: 0x1, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x2, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "EnhancedMoveToHue", id: 0x40, access: "O", conformance: "EHUE", direction: "request",
            response: "status"
        },
        Field({ name: "EnhancedHue", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "Direction", id: 0x1, type: "DirectionEnum", conformance: "M" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "EnhancedMoveHue", id: 0x41, access: "O", conformance: "EHUE", direction: "request",
            response: "status"
        },
        Field({ name: "MoveMode", id: 0x0, type: "MoveModeEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "Rate", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "OptionsMask", id: 0x2, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "EnhancedStepHue", id: 0x42, access: "O", conformance: "EHUE", direction: "request",
            response: "status"
        },
        Field({ name: "StepMode", id: 0x0, type: "StepModeEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "StepSize", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "EnhancedMoveToHueAndSaturation", id: 0x43, access: "O", conformance: "EHUE",
            direction: "request", response: "status"
        },
        Field({ name: "EnhancedHue", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "Saturation", id: 0x1, type: "uint8", conformance: "M", constraint: "max 254" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "ColorLoopSet", id: 0x44, access: "O", conformance: "CL", direction: "request", response: "status" },
        Field({ name: "UpdateFlags", id: 0x0, type: "UpdateFlagsBitmap", conformance: "M" }),
        Field({ name: "Action", id: 0x1, type: "ColorLoopActionEnum", conformance: "M" }),
        Field({ name: "Direction", id: 0x2, type: "ColorLoopDirectionEnum", conformance: "M" }),
        Field({ name: "Time", id: 0x3, type: "uint16", conformance: "M" }),
        Field({ name: "StartHue", id: 0x4, type: "uint16", conformance: "M" }),
        Field({ name: "OptionsMask", id: 0x5, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x6, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "StopMoveStep", id: 0x47, access: "O", conformance: "HS | XY | CT", direction: "request",
            response: "status"
        },
        Field({ name: "OptionsMask", id: 0x0, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x1, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "MoveColorTemperature", id: 0x4b, access: "O", conformance: "CT", direction: "request",
            response: "status"
        },
        Field({ name: "MoveMode", id: 0x0, type: "MoveModeEnum", conformance: "M" }),
        Field({ name: "Rate", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "ColorTemperatureMinimumMireds", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65279" }),
        Field({ name: "ColorTemperatureMaximumMireds", id: 0x3, type: "uint16", conformance: "M", constraint: "max 65279" }),
        Field({ name: "OptionsMask", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x5, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        {
            name: "StepColorTemperature", id: 0x4c, access: "O", conformance: "CT", direction: "request",
            response: "status"
        },
        Field({ name: "StepMode", id: 0x0, type: "StepModeEnum", conformance: "M" }),
        Field({ name: "StepSize", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "ColorTemperatureMinimumMireds", id: 0x3, type: "uint16", conformance: "M", constraint: "max 65279" }),
        Field({ name: "ColorTemperatureMaximumMireds", id: 0x4, type: "uint16", conformance: "M", constraint: "max 65279" }),
        Field({ name: "OptionsMask", id: 0x5, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x6, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Datatype({ name: "OptionsBitmap", type: "map8" }, Field({ name: "ExecuteIfOff", constraint: "0" })),

    Datatype(
        { name: "UpdateFlagsBitmap", type: "map8" },
        Field({ name: "UpdateAction", constraint: "0" }),
        Field({ name: "UpdateDirection", constraint: "1" }),
        Field({ name: "UpdateTime", constraint: "2" }),
        Field({ name: "UpdateStartHue", constraint: "3" })
    ),

    Datatype(
        { name: "DriftCompensationEnum", type: "enum8" },
        Field({ name: "None", id: 0x0, conformance: "M" }),
        Field({ name: "OtherOrUnknown", id: 0x1, conformance: "M" }),
        Field({ name: "TemperatureMonitoring", id: 0x2, conformance: "M" }),
        Field({ name: "OpticalLuminanceMonitoringAndFeedback", id: 0x3, conformance: "M" }),
        Field({ name: "OpticalColorMonitoringAndFeedback", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "ColorModeEnum", type: "enum8" },
        Field({ name: "CurrentHueAndCurrentSaturation", id: 0x0, conformance: "M" }),
        Field({ name: "CurrentXAndCurrentY", id: 0x1, conformance: "M" }),
        Field({ name: "ColorTemperatureMireds", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "EnhancedColorModeEnum", type: "enum8" },
        Field({ name: "CurrentHueAndCurrentSaturation", id: 0x0, conformance: "M" }),
        Field({ name: "CurrentXAndCurrentY", id: 0x1, conformance: "M" }),
        Field({ name: "ColorTemperatureMireds", id: 0x2, conformance: "M" }),
        Field({ name: "EnhancedCurrentHueAndCurrentSaturation", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "DirectionEnum", type: "enum8" },
        Field({ name: "Shortest", id: 0x0, conformance: "M" }),
        Field({ name: "Longest", id: 0x1, conformance: "M" }),
        Field({ name: "Up", id: 0x2, conformance: "M" }),
        Field({ name: "Down", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "MoveModeEnum", type: "enum8" },
        Field({ name: "Stop", id: 0x0, conformance: "M" }),
        Field({ name: "Up", id: 0x1, conformance: "M" }),
        Field({ name: "Down", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "StepModeEnum", type: "enum8" },
        Field({ name: "Up", id: 0x1, conformance: "M" }),
        Field({ name: "Down", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "ColorLoopActionEnum", type: "enum8" },
        Field({ name: "Deactivate", id: 0x0, conformance: "M" }),
        Field({ name: "ActivateFromColorLoopStartEnhancedHue", id: 0x1, conformance: "M" }),
        Field({ name: "ActivateFromEnhancedCurrentHue", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "ColorLoopDirectionEnum", type: "enum8" },
        Field({ name: "Decrement", id: 0x0, conformance: "M" }),
        Field({ name: "Increment", id: 0x1, conformance: "M" })
    )
);

MatterDefinition.children.push(ColorControl);
