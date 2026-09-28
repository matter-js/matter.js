/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "@matter/model";
import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ColorControl",

    children: [
        // 65535 (0xFFFF) is used as "endless" when color is looping (hue/enhanced hue)
        {
            tag: "attribute",
            name: "RemainingTime",
            id: 0x2,
            constraint: "0 to 65535",
        },

        // Adjust the constraints to match the spec
        {
            tag: "attribute",
            id: 0x7,
            name: "ColorTemperatureMireds",
            constraint: "ColorTempPhysicalMinMireds to ColorTempPhysicalMaxMireds",
        },

        // Remove the default of mandatory color mode field which points to (feature specific) color mode XY
        {
            tag: "attribute",
            id: 0x8,
            name: "ColorMode",
            default: FieldValue.None,
        },

        // Before 1.4 the specification states these as mandatory; state the conformance on NumberOfPrimaries that 1.4
        // introduced
        { tag: "attribute", id: 0x11, name: "Primary1X", until: "1.4", conformance: "NumberOfPrimaries > 0, O" },
        { tag: "attribute", id: 0x12, name: "Primary1Y", until: "1.4", conformance: "NumberOfPrimaries > 0, O" },
        {
            tag: "attribute",
            id: 0x13,
            name: "Primary1Intensity",
            until: "1.4",
            conformance: "NumberOfPrimaries > 0, O",
        },
        { tag: "attribute", id: 0x15, name: "Primary2X", until: "1.4", conformance: "NumberOfPrimaries > 1, O" },
        { tag: "attribute", id: 0x16, name: "Primary2Y", until: "1.4", conformance: "NumberOfPrimaries > 1, O" },
        {
            tag: "attribute",
            id: 0x17,
            name: "Primary2Intensity",
            until: "1.4",
            conformance: "NumberOfPrimaries > 1, O",
        },
        { tag: "attribute", id: 0x19, name: "Primary3X", until: "1.4", conformance: "NumberOfPrimaries > 2, O" },
        { tag: "attribute", id: 0x1a, name: "Primary3Y", until: "1.4", conformance: "NumberOfPrimaries > 2, O" },
        {
            tag: "attribute",
            id: 0x1b,
            name: "Primary3Intensity",
            until: "1.4",
            conformance: "NumberOfPrimaries > 2, O",
        },
        { tag: "attribute", id: 0x20, name: "Primary4X", until: "1.4", conformance: "NumberOfPrimaries > 3, O" },
        { tag: "attribute", id: 0x21, name: "Primary4Y", until: "1.4", conformance: "NumberOfPrimaries > 3, O" },
        {
            tag: "attribute",
            id: 0x22,
            name: "Primary4Intensity",
            until: "1.4",
            conformance: "NumberOfPrimaries > 3, O",
        },
        { tag: "attribute", id: 0x24, name: "Primary5X", until: "1.4", conformance: "NumberOfPrimaries > 4, O" },
        { tag: "attribute", id: 0x25, name: "Primary5Y", until: "1.4", conformance: "NumberOfPrimaries > 4, O" },
        {
            tag: "attribute",
            id: 0x26,
            name: "Primary5Intensity",
            until: "1.4",
            conformance: "NumberOfPrimaries > 4, O",
        },
        { tag: "attribute", id: 0x28, name: "Primary6X", until: "1.4", conformance: "NumberOfPrimaries > 5, O" },
        { tag: "attribute", id: 0x29, name: "Primary6Y", until: "1.4", conformance: "NumberOfPrimaries > 5, O" },
        {
            tag: "attribute",
            id: 0x2a,
            name: "Primary6Intensity",
            until: "1.4",
            conformance: "NumberOfPrimaries > 5, O",
        },

        // Convert the enum like number usage to an enum for convenience
        {
            tag: "attribute",
            id: 0x4002,
            name: "ColorLoopActive",
            type: "enum8",
            children: [
                { tag: "field", name: "Inactive", id: 0 },
                { tag: "field", name: "Active", id: 1 },
            ],
        },

        // Convert the enum like number usage to an enum for convenience
        {
            tag: "attribute",
            id: 0x4003,
            name: "ColorLoopDirection",
            type: "enum16",
            until: "1.4",
            children: [
                { tag: "field", name: "Decrement", id: 0 },
                { tag: "field", name: "Increment", id: 1 },
            ],
        },

        // In 1.4 they created ColorLoopDirectionEnum but left the type of ColorLoopDirection attribute as uint8
        {
            tag: "attribute",
            id: 0x4003,
            asOf: "1.4",
            name: "ColorLoopDirection",
            type: "ColorLoopDirectionEnum",
        },

        // Before 1.4.2 the specification states conformance on these as "CT | ColorTemperatureMireds", which is "CT"
        // because ColorTemperatureMireds is itself "CT"
        {
            tag: "attribute",
            id: 0x400d,
            name: "CoupleColorTempToLevelMinMireds",
            until: "1.4.2",
            conformance: "CT",
        },
        {
            tag: "attribute",
            id: 0x4010,
            name: "StartUpColorTemperatureMireds",
            until: "1.4.2",
            conformance: "CT",
        },

        // Spec states the values of this bitmap are the same as the feature map.
        // Fixed in spec 1.5 via ColorCapabilitiesBitmap type definition.
        {
            tag: "attribute",
            id: 0x400a,
            name: "ColorCapabilities",
            type: "map16",
            until: "1.4.2",
            children: [
                {
                    tag: "field",
                    name: "HueSaturation",
                    constraint: "0",
                },
                {
                    tag: "field",
                    name: "EnhancedHue",
                    constraint: "1",
                },
                {
                    tag: "field",
                    name: "ColorLoop",
                    constraint: "2",
                },
                {
                    tag: "field",
                    name: "XY",
                    constraint: "3",
                },
                {
                    tag: "field",
                    name: "ColorTemperature",
                    constraint: "4",
                },
            ],
        },

        // Set the correct type of MoveMode because just in the description
        {
            tag: "command",
            id: 0x4b,
            name: "MoveColorTemperature",
            until: "1.3",

            children: [
                { tag: "field", name: "MoveMode", id: 0x0, type: "MoveModeEnum", conformance: "M", constraint: "desc" },
            ],
        },

        // Set the correct type if StepMode because just in the description
        {
            tag: "command",
            id: 0x4c,
            name: "StepColorTemperature",
            until: "1.3",

            children: [
                { tag: "field", name: "StepMode", id: 0x0, type: "StepModeEnum", conformance: "M", constraint: "desc" },
            ],
        },
    ],
});
