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

export const ModeBase = Cluster(
    { name: "ModeBase" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "DEPONOFF", constraint: "0", title: "OnOff" })
    ),

    Attribute(
        {
            name: "SupportedModes", id: 0x0, type: "list", access: "R V", conformance: "M",
            constraint: "2 to 255", quality: "F"
        },
        Field({ name: "entry", type: "ModeOptionStruct" })
    ),

    Attribute({ name: "CurrentMode", id: 0x1, type: "uint8", access: "R V", conformance: "M", constraint: "desc", quality: "N" }),
    Attribute({
        name: "StartUpMode", id: 0x2, type: "uint8", access: "RW VO", conformance: "O", constraint: "desc",
        quality: "X N"
    }),
    Attribute({
        name: "OnMode", id: 0x3, type: "uint8", access: "RW VO", conformance: "DEPONOFF",
        constraint: "desc", quality: "X N"
    }),

    Command(
        {
            name: "ChangeToMode", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "ChangeToModeResponse"
        },
        Field({ name: "NewMode", id: 0x0, type: "uint8", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "ChangeToModeResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "ModeChangeStatus", conformance: "M", constraint: "desc" }),
        Field({ name: "StatusText", id: 0x1, type: "string", conformance: "[Status == Success], M", constraint: "max 64" })
    ),
    Datatype(
        { name: "ModeTagStruct", type: "struct" },
        Field({ name: "MfgCode", id: 0x0, type: "vendor-id", conformance: "O", constraint: "desc" }),
        Field({ name: "Value", id: 0x1, type: "ModeTag", conformance: "M" })
    ),

    Datatype(
        { name: "ModeOptionStruct", type: "struct" },
        Field({ name: "Label", id: 0x0, type: "string", conformance: "M", constraint: "max 64", quality: "F" }),
        Field({ name: "Mode", id: 0x1, type: "uint8", conformance: "M", quality: "F" }),
        Field(
            { name: "ModeTags", id: 0x2, type: "list", conformance: "M", constraint: "max 8", quality: "F" },
            Field({ name: "entry", type: "ModeTagStruct" })
        )
    ),

    Datatype(
        { name: "ModeChangeStatus", type: "enum8" },
        Field({ name: "Success", id: 0x0 }),
        Field({ name: "UnsupportedMode", id: 0x1 }),
        Field({ name: "GenericFailure", id: 0x2 }),
        Field({ name: "InvalidInMode", id: 0x3 })
    ),

    Datatype(
        { name: "ModeTag", type: "enum16" },
        Field({ name: "Auto", id: 0x0 }),
        Field({ name: "Quick", id: 0x1 }),
        Field({ name: "Quiet", id: 0x2 }),
        Field({ name: "LowNoise", id: 0x3 }),
        Field({ name: "LowEnergy", id: 0x4 }),
        Field({ name: "Vacation", id: 0x5 }),
        Field({ name: "Min", id: 0x6 }),
        Field({ name: "Max", id: 0x7 }),
        Field({ name: "Night", id: 0x8 }),
        Field({ name: "Day", id: 0x9 })
    )
);

MatterDefinition.children.push(ModeBase);
