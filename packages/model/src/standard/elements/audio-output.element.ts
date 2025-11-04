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

export const AudioOutput = Cluster(
    { name: "AudioOutput", id: 0x50b, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "NU", constraint: "0", title: "NameUpdates" })
    ),
    Attribute(
        { name: "OutputList", id: 0x0, type: "list", access: "R V", conformance: "M" },
        Field({ name: "entry", type: "OutputInfoStruct" })
    ),
    Attribute({ name: "CurrentOutput", id: 0x1, type: "uint8", access: "R V", conformance: "M" }),
    Command(
        { name: "SelectOutput", id: 0x0, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "Index", id: 0x0, type: "uint8", conformance: "M" })
    ),
    Command(
        { name: "RenameOutput", id: 0x1, access: "M", conformance: "NU", direction: "request", response: "status" },
        Field({ name: "Index", id: 0x0, type: "uint8", conformance: "M" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "M" })
    ),

    Datatype(
        { name: "OutputTypeEnum", type: "enum8" },
        Field({ name: "Hdmi", id: 0x0, conformance: "M" }),
        Field({ name: "Bt", id: 0x1, conformance: "M" }),
        Field({ name: "Optical", id: 0x2, conformance: "M" }),
        Field({ name: "Headphone", id: 0x3, conformance: "M" }),
        Field({ name: "Internal", id: 0x4, conformance: "M" }),
        Field({ name: "Other", id: 0x5, conformance: "M" })
    ),

    Datatype(
        { name: "OutputInfoStruct", type: "struct" },
        Field({ name: "Index", id: 0x0, type: "uint8", conformance: "M" }),
        Field({ name: "OutputType", id: 0x1, type: "OutputTypeEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "Name", id: 0x2, type: "string", conformance: "M" })
    )
);

MatterDefinition.children.push(AudioOutput);
