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
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const LaundryWasherControls = Cluster(
    { name: "LaundryWasherControls", id: 0x53 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "SPIN", conformance: "O.a+", constraint: "0", title: "Spin" }),
        Field({ name: "RINSE", conformance: "O.a+", constraint: "1", title: "Rinse" })
    ),
    Attribute(
        { name: "SpinSpeeds", id: 0x0, type: "list", access: "R V", conformance: "SPIN", constraint: "max 16[max 64]" },
        Field({ name: "entry", type: "string" })
    ),
    Attribute({
        name: "SpinSpeedCurrent", id: 0x1, type: "uint8", access: "RW VO", conformance: "SPIN",
        constraint: "max 15", quality: "X"
    }),
    Attribute({
        name: "NumberOfRinses", id: 0x2, type: "NumberOfRinsesEnum", access: "RW VO", conformance: "RINSE",
        constraint: "desc"
    }),
    Attribute(
        { name: "SupportedRinses", id: 0x3, type: "list", access: "R V", conformance: "RINSE", constraint: "max 4" },
        Field({ name: "entry", type: "NumberOfRinsesEnum" })
    ),

    Datatype(
        { name: "NumberOfRinsesEnum", type: "enum8" },
        Field({ name: "None", id: 0x0, conformance: "RINSE" }),
        Field({ name: "Normal", id: 0x1, conformance: "RINSE" }),
        Field({ name: "Extra", id: 0x2, conformance: "RINSE" }),
        Field({ name: "Max", id: 0x3, conformance: "RINSE" })
    )
);

MatterDefinition.children.push(LaundryWasherControls);
