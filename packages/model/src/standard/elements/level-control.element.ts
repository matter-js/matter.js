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

export const LevelControl = Cluster(
    { name: "LevelControl", id: 0x8, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 6 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "OO", conformance: "O", constraint: "0", default: 1, title: "OnOff" }),
        Field({ name: "LT", conformance: "O", constraint: "1", default: 0, title: "Lighting" }),
        Field({ name: "FQ", conformance: "P", constraint: "2", default: 0, title: "Frequency" })
    ),

    Attribute({
        name: "CurrentLevel", id: 0x0, type: "uint8", access: "R V", conformance: "M",
        constraint: "minLevel to maxLevel", quality: "X N S Q"
    }),
    Attribute({ name: "RemainingTime", id: 0x1, type: "uint16", access: "R V", conformance: "LT", quality: "Q" }),
    Attribute({
        name: "MinLevel", id: 0x2, type: "uint8", access: "R V", conformance: "[LT]",
        constraint: "1 to 254", default: 1
    }),
    Attribute({
        name: "MinLevel", id: 0x2, type: "uint8", access: "R V", conformance: "[!LT]",
        constraint: "max 254", default: 0
    }),
    Attribute({
        name: "MaxLevel", id: 0x3, type: "uint8", access: "R V", conformance: "O",
        constraint: "minLevel to 254", default: 254
    }),
    Attribute({
        name: "CurrentFrequency", id: 0x4, type: "uint16", access: "R V", conformance: "FQ",
        constraint: "minFrequency to maxFrequency", quality: "S P Q"
    }),
    Attribute({ name: "MinFrequency", id: 0x5, type: "uint16", access: "R V", conformance: "FQ" }),
    Attribute({ name: "MaxFrequency", id: 0x6, type: "uint16", access: "R V", conformance: "FQ", constraint: "min minFrequency" }),
    Attribute({ name: "OnOffTransitionTime", id: 0x10, type: "uint16", access: "RW VO", conformance: "O", default: 0 }),
    Attribute({
        name: "OnLevel", id: 0x11, type: "uint8", access: "RW VO", conformance: "M",
        constraint: "minLevel to maxLevel", quality: "X"
    }),
    Attribute({
        name: "OnTransitionTime", id: 0x12, type: "uint16", access: "RW VO", conformance: "O",
        default: null, quality: "X"
    }),
    Attribute({
        name: "OffTransitionTime", id: 0x13, type: "uint16", access: "RW VO", conformance: "O",
        default: null, quality: "X"
    }),
    Attribute({
        name: "DefaultMoveRate", id: 0x14, type: "uint8", access: "RW VO", conformance: "O",
        constraint: "min 1", quality: "X"
    }),
    Attribute({ name: "Options", id: 0xf, type: "OptionsBitmap", access: "RW VO", conformance: "M", constraint: "desc" }),
    Attribute({
        name: "StartUpCurrentLevel", id: 0x4000, type: "uint8", access: "RW VM", conformance: "LT",
        constraint: "desc", quality: "X N"
    }),

    Command(
        { name: "MoveToLevel", id: 0x0, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "Level", id: 0x0, type: "uint8", conformance: "M", constraint: "max 254" }),
        Field({ name: "TransitionTime", id: 0x1, type: "uint16", conformance: "M", quality: "X" }),
        Field({ name: "OptionsMask", id: 0x2, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "Move", id: 0x1, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "MoveMode", id: 0x0, type: "MoveModeEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "Rate", id: 0x1, type: "uint8", conformance: "M", quality: "X" }),
        Field({ name: "OptionsMask", id: 0x2, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "Step", id: 0x2, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "StepMode", id: 0x0, type: "StepModeEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "StepSize", id: 0x1, type: "uint8", conformance: "M" }),
        Field({ name: "TransitionTime", id: 0x2, type: "uint16", conformance: "M", quality: "X" }),
        Field({ name: "OptionsMask", id: 0x3, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x4, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "Stop", id: 0x3, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "OptionsMask", id: 0x0, type: "OptionsBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "OptionsOverride", id: 0x1, type: "OptionsBitmap", conformance: "M", constraint: "desc" })
    ),
    Command({
        name: "MoveToLevelWithOnOff", id: 0x4, type: "MoveToLevel", access: "O", conformance: "M",
        direction: "request", response: "status"
    }),
    Command({
        name: "MoveWithOnOff", id: 0x5, type: "Move", access: "O", conformance: "M", direction: "request",
        response: "status"
    }),
    Command({
        name: "StepWithOnOff", id: 0x6, type: "Step", access: "O", conformance: "M", direction: "request",
        response: "status"
    }),
    Command({
        name: "StopWithOnOff", id: 0x7, type: "Stop", access: "O", conformance: "M", direction: "request",
        response: "status"
    }),

    Command(
        {
            name: "MoveToClosestFrequency", id: 0x8, access: "O", conformance: "FQ", direction: "request",
            response: "status"
        },
        Field({ name: "Frequency", id: 0x0, type: "uint16", conformance: "M" })
    ),

    Datatype(
        { name: "OptionsBitmap", type: "map8" },
        Field({ name: "ExecuteIfOff", constraint: "0" }),
        Field({ name: "CoupleColorTempToLevel", constraint: "1" })
    ),
    Datatype(
        { name: "MoveModeEnum", type: "enum8" },
        Field({ name: "Up", id: 0x0, conformance: "M" }),
        Field({ name: "Down", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "StepModeEnum", type: "enum8" },
        Field({ name: "Up", id: 0x0, conformance: "M" }),
        Field({ name: "Down", id: 0x1, conformance: "M" })
    )
);

MatterDefinition.children.push(LevelControl);
