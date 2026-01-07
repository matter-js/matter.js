/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterElement as Cluster } from "@matter/model";
import { LocalMatter } from "../local.js";

LocalMatter.children.push(
    Cluster({
        tag: "cluster",
        name: "WindowCovering",

        children: [
            // Formal definition of operational status bitmap fields
            {
                tag: "datatype",
                type: "enum8",
                name: "MovementStatus",
                details: "Values for OperationalStatus attribute fields.",

                children: [
                    {
                        tag: "field",
                        id: 0,
                        name: "Stopped",
                        details: "Covering is not moving",
                    },
                    {
                        tag: "field",
                        id: 1,
                        name: "Opening",
                        details: "Covering is moving from closed to open",
                    },
                    {
                        tag: "field",
                        id: 2,
                        name: "Closing",
                        details: "Covering is moving from open to closed",
                    },
                ],
            },

            // Set Mode field names.  They're correct in chip.ts but only placeholders in spec.ts.  Since spec overrides
            // chip for names we need to re-write them here
            {
                tag: "attribute",
                id: 0x17,
                name: "Mode",

                // Spec fixed in 1.2
                until: "1.2",

                children: [
                    { tag: "field", name: "MotorDirectionReversed", constraint: "0" },
                    { tag: "field", name: "CalibrationMode", constraint: "1" },
                    { tag: "field", name: "MaintenanceMode", constraint: "2" },
                    { tag: "field", name: "LedFeedback", constraint: "3" },
                ],
            },

            // Set the name of the ConfigStatus config fields.  Same issue as for Mode
            {
                tag: "attribute",
                id: 7,
                name: "ConfigStatus",

                // Spec fixed in 1.2
                until: "1.2",

                children: [
                    { tag: "field", name: "Operational", constraint: "0" },
                    { tag: "field", name: "OnlineReserved", constraint: "1" },
                    { tag: "field", name: "LiftMovementReversed", constraint: "2" },
                    { tag: "field", name: "LiftPositionAware", constraint: "3" },
                    { tag: "field", name: "TiltPositionAware", constraint: "4" },
                    { tag: "field", name: "LiftEncoderControlled", constraint: "5" },
                    { tag: "field", name: "TiltEncoderControlled", constraint: "6" },
                ],
            },

            // Add conformance to the Type attribute
            {
                tag: "attribute",
                id: 0,
                name: "Type",

                // In 1.2 conformance is still defined incorrectly but definitions moved to TypeEnum (see next
                // definition)
                until: "1.2",

                children: [
                    { tag: "field", name: "Rollershade", id: 0, conformance: "LF & !TL" },
                    { tag: "field", name: "Rollershade2Motor", id: 1, conformance: "LF & !TL" },
                    { tag: "field", name: "RollershadeExterior", id: 2, conformance: "LF & !TL" },
                    { tag: "field", name: "RollershadeExterior2Motor", id: 3, conformance: "LF & !TL" },
                    { tag: "field", name: "Drapery", id: 4, conformance: "LF & !TL" },
                    { tag: "field", name: "Awning", id: 5, conformance: "LF & !TL" },
                    // see https://github.com/project-chip/connectedhomeip/issues/33135
                    { tag: "field", name: "Shutter", id: 6, conformance: "LF | TL" },
                    { tag: "field", name: "TiltBlindTiltOnly", id: 7, conformance: "!LF & TL" },
                    { tag: "field", name: "TiltBlindLift", id: 8, conformance: "LF & TL" },
                    { tag: "field", name: "ProjectorScreen", id: 9, conformance: "LF & !TL" },
                    { tag: "field", name: "Unknown", id: 255, conformance: "O" },
                ],
            },

            // Add conformance to TypeEnum
            {
                tag: "datatype",
                name: "TypeEnum",

                asOf: "1.2",

                children: [
                    { tag: "field", name: "Rollershade", id: 0, conformance: "LF & !TL" },
                    { tag: "field", name: "Rollershade2Motor", id: 1, conformance: "LF & !TL" },
                    { tag: "field", name: "RollershadeExterior", id: 2, conformance: "LF & !TL" },
                    { tag: "field", name: "RollershadeExterior2Motor", id: 3, conformance: "LF & !TL" },
                    { tag: "field", name: "Drapery", id: 4, conformance: "LF & !TL" },
                    { tag: "field", name: "Awning", id: 5, conformance: "LF & !TL" },
                    // see https://github.com/project-chip/connectedhomeip/issues/33135
                    { tag: "field", name: "Shutter", id: 6, conformance: "LF | TL" },
                    { tag: "field", name: "TiltBlindTiltOnly", id: 7, conformance: "!LF & TL" },
                    { tag: "field", name: "TiltBlindLift", id: 8, conformance: "LF & TL" },
                    { tag: "field", name: "ProjectorScreen", id: 9, conformance: "LF & !TL" },
                    { tag: "field", name: "Unknown", id: 255, conformance: "O" },
                ],
            },

            // Add Conformance field to the EndProductType attribute.  Unclear if "LF" actually means "LF & !TL" and
            // such
            {
                tag: "attribute",
                id: 13,
                name: "EndProductType",

                // In 1.2 conformance is present (and definitions moved to EndProductTypeEnum)
                until: "1.2",

                children: [
                    { tag: "field", name: "RollerShade", id: 0, conformance: "LF" },
                    { tag: "field", name: "RomanShade", id: 1, conformance: "LF" },
                    { tag: "field", name: "BalloonShade", id: 2, conformance: "LF" },
                    { tag: "field", name: "WovenWood", id: 3, conformance: "LF" },
                    { tag: "field", name: "PleatedShade", id: 4, conformance: "LF" },
                    { tag: "field", name: "CellularShade", id: 5, conformance: "LF" },
                    { tag: "field", name: "LayeredShade", id: 6, conformance: "LF" },
                    { tag: "field", name: "LayeredShade2D", id: 7, conformance: "LF" },
                    { tag: "field", name: "SheerShade", id: 8, conformance: "LF & TL" },
                    { tag: "field", name: "TiltOnlyInteriorBlind", id: 9, conformance: "TL" },
                    { tag: "field", name: "InteriorBlind", id: 10, conformance: "LF & TL" },
                    { tag: "field", name: "VerticalBlindStripCurtain", id: 11, conformance: "LF & TL" },
                    { tag: "field", name: "InteriorVenetianBlind", id: 12, conformance: "LF & TL" },
                    { tag: "field", name: "ExteriorVenetianBlind", id: 13, conformance: "LF & TL" },
                    { tag: "field", name: "LateralLeftCurtain", id: 14, conformance: "LF" },
                    { tag: "field", name: "LateralRightCurtain", id: 15, conformance: "LF" },
                    { tag: "field", name: "CentralCurtain", id: 16, conformance: "LF" },
                    { tag: "field", name: "RollerShutter", id: 17, conformance: "LF" },
                    { tag: "field", name: "ExteriorVerticalScreen", id: 18, conformance: "LF" },
                    { tag: "field", name: "AwningTerrace", id: 19, conformance: "LF" },
                    { tag: "field", name: "AwningVerticalScreen", id: 20, conformance: "LF" },
                    { tag: "field", name: "TiltOnlyPergola", id: 21, conformance: "LF | TL" },
                    { tag: "field", name: "SwingingShutter", id: 22, conformance: "LF | TL" },
                    { tag: "field", name: "SlidingShutter", id: 23, conformance: "LF | TL" },
                    { tag: "field", name: "Unknown", id: 255, conformance: "O" },
                ],
            },

            // Set the name, type and description of the OperationalStatus config fields.  Otherwise name would be a
            // placeholder, type would be a bare number and the description would be overly-verbose bit-level
            // descriptions from the spec
            {
                tag: "attribute",
                id: 10,
                name: "OperationalStatus",

                // Fixed in 1.2, but we still need to install "MovementStatus" as the type (see below)
                until: "1.2",

                children: [
                    {
                        tag: "field",
                        name: "Global",
                        type: "MovementStatus",
                        constraint: "0 to 1",
                        description: "Movement status of the cover",
                    },
                    {
                        tag: "field",
                        name: "Lift",
                        type: "MovementStatus",
                        constraint: "2 to 3",
                        description: "Movement status of the cover's lift function",
                    },
                    {
                        tag: "field",
                        name: "Tilt",
                        type: "MovementStatus",
                        constraint: "4 to 5",
                        description: "Movement status of the cover's tilt function",
                    },
                ],
            },

            // Set the type of the bit fields so code generates with our "MovementStatus" enum
            {
                tag: "datatype",
                name: "OperationalStatusBitmap",

                // The type is correct but need to set here so model logic knows to use the constraint for matching
                type: "map8",

                children: [
                    // Note constraint is correct but we need to include for matching
                    { tag: "field", name: "Global", type: "MovementStatus", constraint: "0 to 1" },
                    { tag: "field", name: "Lift", type: "MovementStatus", constraint: "2 to 3" },
                    { tag: "field", name: "Tilt", type: "MovementStatus", constraint: "4 to 5" },
                ],
            },

            // Adjust the constraints for the GoToLiftValue command parameter to allow automatic validation
            {
                tag: "command",
                name: "GoToLiftValue",
                id: 4,
                children: [
                    {
                        tag: "field",
                        name: "LiftValue",
                        id: 0,
                        type: "uint16",
                        conformance: "M",
                        constraint: "InstalledOpenLimitLift to InstalledClosedLimitLift",
                    },
                ],
            },

            // Adjust the constraints for the GoToTiltValue command parameter to allow automatic validation
            {
                tag: "command",
                name: "GoToTiltValue",
                id: 7,
                children: [
                    {
                        tag: "field",
                        name: "TiltValue",
                        id: 0,
                        type: "uint16",
                        conformance: "M",
                        constraint: "InstalledOpenLimitTilt to InstalledClosedLimitTilt",
                    },
                ],
            },

            // The spec defines two fields but CHIP only uses the first one with a different datatype.  So necessary to
            // follow defacto standard rather than specification here
            {
                tag: "command",
                name: "GoToLiftPercentage",
                id: 0x5,

                children: [
                    {
                        id: 0,
                        tag: "field",
                        name: "LiftPercent100thsValue",
                        type: "percent100ths",
                        conformance: "M",
                    },
                    {
                        id: 1,
                        tag: "field",
                        name: "Ignored",
                        conformance: "X",
                    },
                ],
            },

            // Same issue as for GoToLiftPercentage
            {
                tag: "command",
                name: "GoToTiltPercentage",
                id: 0x8,
                children: [
                    {
                        id: 0,
                        tag: "field",
                        name: "TiltPercent100thsValue",
                        type: "percent100ths",
                        conformance: "M",
                    },
                    {
                        id: 1,
                        tag: "field",
                        name: "Ignored",
                        conformance: "X",
                    },
                ],
            },
        ],
    }),
);
