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
    EventElement as Event,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const Chime = Cluster(
    { name: "Chime", id: 0x556, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        {
            name: "InstalledChimeSounds", id: 0x0, type: "list", access: "R V", conformance: "M",
            constraint: "1 to 255"
        },
        Field({ name: "entry", type: "ChimeSoundStruct" })
    ),

    Attribute({ name: "SelectedChime", id: 0x1, type: "uint8", access: "RW VO", conformance: "M", quality: "N" }),
    Attribute({ name: "Enabled", id: 0x2, type: "bool", access: "RW VO", conformance: "M", quality: "N" }),
    Event(
        { name: "ChimeStartedPlaying", id: 0x0, access: "V", conformance: "P, Rev >= v2", priority: "info" },
        Field({ name: "ChimeId", id: 0x0, type: "uint8", conformance: "M" })
    ),
    Command(
        { name: "PlayChimeSound", id: 0x0, access: "O", conformance: "M", direction: "request" },
        Field({ name: "ChimeId", id: 0x0, type: "uint8", conformance: "P, [Rev >= v2]" })
    ),
    Datatype(
        { name: "ChimeSoundStruct", type: "struct" },
        Field({ name: "ChimeId", id: 0x0, type: "uint8", conformance: "M" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "M", constraint: "1 to 48" })
    )
);

MatterDefinition.children.push(Chime);
