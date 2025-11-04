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

export const ModeSelect = Cluster(
    { name: "ModeSelect", id: 0x50, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "DEPONOFF", constraint: "0", title: "OnOff" })
    ),
    Attribute({
        name: "Description", id: 0x0, type: "string", access: "R V", conformance: "M", constraint: "max 64",
        quality: "F"
    }),
    Attribute({
        name: "StandardNamespace", id: 0x1, type: "namespace", access: "R V", conformance: "M",
        constraint: "desc", default: null, quality: "X F"
    }),

    Attribute(
        {
            name: "SupportedModes", id: 0x2, type: "list", access: "R V", conformance: "M",
            constraint: "max 255", quality: "F"
        },
        Field({ name: "entry", type: "ModeOptionStruct" })
    ),

    Attribute({ name: "CurrentMode", id: 0x3, type: "uint8", access: "R V", conformance: "M", constraint: "desc", quality: "N" }),
    Attribute({
        name: "StartUpMode", id: 0x4, type: "uint8", access: "RW VO", conformance: "O", constraint: "desc",
        quality: "X N"
    }),
    Attribute({
        name: "OnMode", id: 0x5, type: "uint8", access: "RW VO", conformance: "DEPONOFF",
        constraint: "desc", default: null, quality: "X N"
    }),
    Command(
        { name: "ChangeToMode", id: 0x0, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "NewMode", id: 0x0, type: "uint8", conformance: "M", constraint: "desc" })
    ),
    Datatype(
        { name: "SemanticTagStruct", type: "struct" },
        Field({ name: "MfgCode", id: 0x0, type: "vendor-id", conformance: "M", constraint: "desc", quality: "F" }),
        Field({ name: "Value", id: 0x1, type: "uint16", conformance: "M", quality: "F" })
    ),

    Datatype(
        { name: "ModeOptionStruct", type: "struct" },
        Field({ name: "Label", id: 0x0, type: "string", conformance: "M", constraint: "max 64", quality: "F" }),
        Field({ name: "Mode", id: 0x1, type: "uint8", conformance: "M", quality: "F" }),
        Field(
            { name: "SemanticTags", id: 0x2, type: "list", conformance: "M", constraint: "max 64", quality: "F" },
            Field({ name: "entry", type: "SemanticTagStruct" })
        )
    )
);

MatterDefinition.children.push(ModeSelect);
