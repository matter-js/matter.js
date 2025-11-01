/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "@matter/model";
import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ColorControl",

    children: [
        // 63353 (0xFFF) is used as "endless" when color is looping (hue/enhanced hue)
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

        // Override primary conformance using our ">" extension to conformance syntax
        { tag: "attribute", id: 0x11, name: "Primary1X", conformance: "NumberOfPrimaries > 0" },
        { tag: "attribute", id: 0x12, name: "Primary1Y", conformance: "NumberOfPrimaries > 0" },
        { tag: "attribute", id: 0x13, name: "Primary1Intensity", conformance: "NumberOfPrimaries > 0" },
        { tag: "attribute", id: 0x15, name: "Primary2X", conformance: "NumberOfPrimaries > 1" },
        { tag: "attribute", id: 0x16, name: "Primary2Y", conformance: "NumberOfPrimaries > 1" },
        { tag: "attribute", id: 0x17, name: "Primary2Intensity", conformance: "NumberOfPrimaries > 1" },
        { tag: "attribute", id: 0x19, name: "Primary3X", conformance: "NumberOfPrimaries > 2" },
        { tag: "attribute", id: 0x1a, name: "Primary3Y", conformance: "NumberOfPrimaries > 2" },
        { tag: "attribute", id: 0x1b, name: "Primary3Intensity", conformance: "NumberOfPrimaries > 2" },
        { tag: "attribute", id: 0x20, name: "Primary4X", conformance: "NumberOfPrimaries > 3" },
        { tag: "attribute", id: 0x21, name: "Primary4Y", conformance: "NumberOfPrimaries > 3" },
        { tag: "attribute", id: 0x22, name: "Primary4Intensity", conformance: "NumberOfPrimaries > 3" },
        { tag: "attribute", id: 0x24, name: "Primary5X", conformance: "NumberOfPrimaries > 4" },
        { tag: "attribute", id: 0x25, name: "Primary5Y", conformance: "NumberOfPrimaries > 4" },
        { tag: "attribute", id: 0x26, name: "Primary5Intensity", conformance: "NumberOfPrimaries > 4" },
        { tag: "attribute", id: 0x28, name: "Primary6X", conformance: "NumberOfPrimaries > 5" },
        { tag: "attribute", id: 0x29, name: "Primary6Y", conformance: "NumberOfPrimaries > 5" },
        { tag: "attribute", id: 0x2a, name: "Primary6Intensity", conformance: "NumberOfPrimaries > 5" },

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

        // Spec defines conformance on these as "CT | ColorTemperatureMireds" which doesn't make sense because
        // conformance on ColorTemperatureMireds is "CT"
        {
            tag: "attribute",
            id: 0x400d,
            name: "CoupleColorTempToLevelMinMireds",
            conformance: "CT & ColorTemperatureMireds",
        },
        {
            tag: "attribute",
            id: 0x4010,
            name: "StartUpColorTemperatureMireds",
            conformance: "CT & ColorTemperatureMireds",
        },

        // Spec states the values of this bitmap are the same as the feature map
        {
            tag: "attribute",
            id: 0x400a,
            name: "ColorCapabilities",
            type: "map16",
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
