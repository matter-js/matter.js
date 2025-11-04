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

export const MicrowaveOvenMode = Cluster(
    { name: "MicrowaveOvenMode", id: 0x5e, type: "ModeBase", classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "DEPONOFF", conformance: "X", constraint: "0", title: "OnOff" })
    ),
    Attribute({ name: "SupportedModes", id: 0x0 }),
    Attribute({ name: "CurrentMode", id: 0x1 }),
    Attribute({ name: "StartUpMode", id: 0x2, conformance: "X" }),
    Attribute({ name: "OnMode", id: 0x3, conformance: "X" }),
    Command({ name: "ChangeToMode", id: 0x0, conformance: "X" }),
    Command({ name: "ChangeToModeResponse", id: 0x1, conformance: "X" }),

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
        Field({ name: "Day", id: 0x9 }),
        Field({ name: "Normal", id: 0x4000 }),
        Field({ name: "Defrost", id: 0x4001 })
    )
);

MatterDefinition.children.push(MicrowaveOvenMode);
