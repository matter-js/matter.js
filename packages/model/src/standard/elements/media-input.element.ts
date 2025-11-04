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

export const MediaInput = Cluster(
    { name: "MediaInput", id: 0x507, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "NU", constraint: "0", title: "NameUpdates" })
    ),
    Attribute(
        { name: "InputList", id: 0x0, type: "list", access: "R V", conformance: "M" },
        Field({ name: "entry", type: "InputInfoStruct" })
    ),
    Attribute({ name: "CurrentInput", id: 0x1, type: "uint8", access: "R V", conformance: "M" }),
    Command(
        { name: "SelectInput", id: 0x0, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "Index", id: 0x0, type: "uint8", conformance: "M" })
    ),
    Command({ name: "ShowInputStatus", id: 0x1, access: "O", conformance: "M", direction: "request", response: "status" }),
    Command({ name: "HideInputStatus", id: 0x2, access: "O", conformance: "M", direction: "request", response: "status" }),
    Command(
        { name: "RenameInput", id: 0x3, access: "M", conformance: "NU", direction: "request", response: "status" },
        Field({ name: "Index", id: 0x0, type: "uint8", conformance: "M" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "M" })
    ),

    Datatype(
        { name: "InputTypeEnum", type: "enum8" },
        Field({ name: "Internal", id: 0x0, conformance: "M" }),
        Field({ name: "Aux", id: 0x1, conformance: "M" }),
        Field({ name: "Coax", id: 0x2, conformance: "M" }),
        Field({ name: "Composite", id: 0x3, conformance: "M" }),
        Field({ name: "Hdmi", id: 0x4, conformance: "M" }),
        Field({ name: "Input", id: 0x5, conformance: "M" }),
        Field({ name: "Line", id: 0x6, conformance: "M" }),
        Field({ name: "Optical", id: 0x7, conformance: "M" }),
        Field({ name: "Video", id: 0x8, conformance: "M" }),
        Field({ name: "Scart", id: 0x9, conformance: "M" }),
        Field({ name: "Usb", id: 0xa, conformance: "M" }),
        Field({ name: "Other", id: 0xb, conformance: "M" })
    ),

    Datatype(
        { name: "InputInfoStruct", type: "struct" },
        Field({ name: "Index", id: 0x0, type: "uint8", conformance: "M" }),
        Field({ name: "InputType", id: 0x1, type: "InputTypeEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "Name", id: 0x2, type: "string", conformance: "M" }),
        Field({ name: "Description", id: 0x3, type: "string", conformance: "M" })
    )
);

MatterDefinition.children.push(MediaInput);
