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

export const Chime = Cluster(
    { name: "Chime", id: 0x556, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        {
            name: "InstalledChimeSounds", id: 0x0, type: "list", access: "R V", conformance: "M",
            constraint: "1 to 255", quality: "F"
        },
        Field({ name: "entry", type: "ChimeSoundStruct" })
    ),

    Attribute({ name: "SelectedChime", id: 0x1, type: "uint8", access: "RW VO", conformance: "M", quality: "N" }),
    Attribute({ name: "Enabled", id: 0x2, type: "bool", access: "RW VO", conformance: "M", quality: "N" }),
    Command({ name: "PlayChimeSound", id: 0x0, access: "O", conformance: "M", direction: "request" }),
    Datatype(
        { name: "ChimeSoundStruct", type: "struct" },
        Field({ name: "ChimeId", id: 0x0, type: "uint8", conformance: "M" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "M", constraint: "1 to 48" })
    )
);

MatterDefinition.children.push(Chime);
