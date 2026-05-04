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

export const ClosureDimension = Cluster(
    { name: "ClosureDimension", id: 0x105, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PS", conformance: "O.a+", constraint: "0", title: "Positioning" }),
        Field({ name: "LT", conformance: "O.a+", constraint: "1", title: "MotionLatching" }),
        Field({ name: "UT", conformance: "[PS]", constraint: "2", title: "Unit" }),
        Field({ name: "LM", conformance: "[PS]", constraint: "3", title: "Limitation" }),
        Field({ name: "SP", conformance: "[PS]", constraint: "4", title: "Speed" }),
        Field({ name: "TR", conformance: "[PS].b", constraint: "5", title: "Translation" }),
        Field({ name: "RO", conformance: "[PS].b", constraint: "6", title: "Rotation" }),
        Field({ name: "MD", conformance: "[PS].b", constraint: "7", title: "Modulation" })
    ),

    Attribute({
        name: "CurrentState", id: 0x0, type: "DimensionStateStruct", access: "R V", conformance: "M",
        constraint: "desc", default: null, quality: "X Q"
    }),
    Attribute({
        name: "TargetState", id: 0x1, type: "DimensionStateStruct", access: "R V", conformance: "M",
        constraint: "desc", default: null, quality: "X"
    }),
    Attribute({
        name: "Resolution", id: 0x2, type: "percent100ths", access: "R V", conformance: "PS",
        constraint: "min 0.01%", default: { type: "percent", value: 0 }, quality: "F"
    }),
    Attribute({
        name: "StepValue", id: 0x3, type: "percent100ths", access: "R V", conformance: "PS",
        constraint: "min 0.01%", default: { type: "percent", value: 0 }, quality: "F"
    }),
    Attribute({ name: "Unit", id: 0x4, type: "ClosureUnitEnum", access: "R V", conformance: "UT", quality: "F" }),
    Attribute({
        name: "UnitRange", id: 0x5, type: "UnitRangeStruct", access: "R V", conformance: "UT",
        constraint: "desc", default: null, quality: "X"
    }),
    Attribute({
        name: "LimitRange", id: 0x6, type: "RangePercent100thsStruct", access: "R V", conformance: "LM",
        constraint: "desc"
    }),
    Attribute({
        name: "TranslationDirection", id: 0x7, type: "TranslationDirectionEnum", access: "R V",
        conformance: "TR", quality: "F"
    }),
    Attribute({ name: "RotationAxis", id: 0x8, type: "RotationAxisEnum", access: "R V", conformance: "RO", quality: "F" }),
    Attribute({ name: "Overflow", id: 0x9, type: "OverflowEnum", access: "R V", conformance: "RO", quality: "F" }),
    Attribute(
        { name: "ModulationType", id: 0xa, type: "ModulationTypeEnum", access: "R V", conformance: "MD", quality: "F" }
    ),
    Attribute({
        name: "LatchControlModes", id: 0xb, type: "LatchControlModesBitmap", access: "R V",
        conformance: "LT", quality: "F"
    }),

    Command(
        { name: "SetTarget", id: 0x0, access: "O T", conformance: "M", direction: "request", response: "status" },
        Field({ name: "Position", id: 0x0, type: "percent100ths", conformance: "O.a+" }),
        Field({ name: "Latch", id: 0x1, type: "bool", conformance: "O.a+" }),
        Field({ name: "Speed", id: 0x2, type: "ThreeLevelAutoEnum", conformance: "O.a+", default: 0 })
    ),

    Command(
        { name: "Step", id: 0x1, access: "O T", conformance: "PS", direction: "request", response: "status" },
        Field({ name: "Direction", id: 0x0, type: "StepDirectionEnum", conformance: "M" }),
        Field({ name: "NumberOfSteps", id: 0x1, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "Speed", id: 0x2, type: "ThreeLevelAutoEnum", conformance: "[SP]", constraint: "desc", default: 0 })
    ),

    Datatype(
        { name: "TranslationDirectionEnum", type: "enum8" },
        Field({ name: "Downward", id: 0x0, conformance: "M" }),
        Field({ name: "Upward", id: 0x1, conformance: "M" }),
        Field({ name: "VerticalMask", id: 0x2, conformance: "M" }),
        Field({ name: "VerticalSymmetry", id: 0x3, conformance: "M" }),
        Field({ name: "Leftward", id: 0x4, conformance: "M" }),
        Field({ name: "Rightward", id: 0x5, conformance: "M" }),
        Field({ name: "HorizontalMask", id: 0x6, conformance: "M" }),
        Field({ name: "HorizontalSymmetry", id: 0x7, conformance: "M" }),
        Field({ name: "Forward", id: 0x8, conformance: "M" }),
        Field({ name: "Backward", id: 0x9, conformance: "M" }),
        Field({ name: "DepthMask", id: 0xa, conformance: "M" }),
        Field({ name: "DepthSymmetry", id: 0xb, conformance: "M" })
    ),

    Datatype(
        { name: "RotationAxisEnum", type: "enum8" },
        Field({ name: "Left", id: 0x0, conformance: "M" }),
        Field({ name: "CenteredVertical", id: 0x1, conformance: "M" }),
        Field({ name: "LeftAndRight", id: 0x2, conformance: "M" }),
        Field({ name: "Right", id: 0x3, conformance: "M" }),
        Field({ name: "Top", id: 0x4, conformance: "M" }),
        Field({ name: "CenteredHorizontal", id: 0x5, conformance: "M" }),
        Field({ name: "TopAndBottom", id: 0x6, conformance: "M" }),
        Field({ name: "Bottom", id: 0x7, conformance: "M" }),
        Field({ name: "LeftBarrier", id: 0x8, conformance: "M" }),
        Field({ name: "LeftAndRightBarriers", id: 0x9, conformance: "M" }),
        Field({ name: "RightBarrier", id: 0xa, conformance: "M" })
    ),

    Datatype(
        { name: "OverflowEnum", type: "enum8" },
        Field({ name: "NoOverflow", id: 0x0, conformance: "M" }),
        Field({ name: "Inside", id: 0x1, conformance: "M" }),
        Field({ name: "Outside", id: 0x2, conformance: "M" }),
        Field({ name: "TopInside", id: 0x3, conformance: "M" }),
        Field({ name: "TopOutside", id: 0x4, conformance: "M" }),
        Field({ name: "BottomInside", id: 0x5, conformance: "M" }),
        Field({ name: "BottomOutside", id: 0x6, conformance: "M" }),
        Field({ name: "LeftInside", id: 0x7, conformance: "M" }),
        Field({ name: "LeftOutside", id: 0x8, conformance: "M" }),
        Field({ name: "RightInside", id: 0x9, conformance: "M" }),
        Field({ name: "RightOutside", id: 0xa, conformance: "M" })
    ),

    Datatype(
        { name: "ModulationTypeEnum", type: "enum8" },
        Field({ name: "SlatsOrientation", id: 0x0, conformance: "M" }),
        Field({ name: "SlatsOpenwork", id: 0x1, conformance: "M" }),
        Field({ name: "StripesAlignment", id: 0x2, conformance: "M" }),
        Field({ name: "Opacity", id: 0x3, conformance: "M" }),
        Field({ name: "Ventilation", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "ClosureUnitEnum", type: "enum8" },
        Field({ name: "Millimeter", id: 0x0, conformance: "M" }),
        Field({ name: "Degree", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "StepDirectionEnum", type: "enum8" },
        Field({ name: "Decrease", id: 0x0, conformance: "M" }),
        Field({ name: "Increase", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "RangePercent100thsStruct", type: "struct" },
        Field({ name: "Min", id: 0x0, type: "percent100ths", conformance: "M" }),
        Field({ name: "Max", id: 0x1, type: "percent100ths", conformance: "M" })
    ),
    Datatype(
        { name: "UnitRangeStruct", type: "struct" },
        Field({ name: "Min", id: 0x0, type: "int16", conformance: "M" }),
        Field({ name: "Max", id: 0x1, type: "int16", conformance: "M" })
    ),

    Datatype(
        { name: "DimensionStateStruct", type: "struct" },
        Field({
            name: "Position", id: 0x0, type: "percent100ths", conformance: "PS", constraint: "desc",
            default: null, quality: "X"
        }),
        Field({ name: "Latch", id: 0x1, type: "bool", conformance: "LT", constraint: "desc", default: null, quality: "X" }),
        Field({ name: "Speed", id: 0x2, type: "ThreeLevelAutoEnum", conformance: "SP", constraint: "desc" })
    ),

    Datatype(
        { name: "LatchControlModesBitmap", type: "map8" },
        Field({ name: "RemoteLatching", constraint: "0" }),
        Field({ name: "RemoteUnlatching", constraint: "1" })
    )
);

MatterDefinition.children.push(ClosureDimension);
