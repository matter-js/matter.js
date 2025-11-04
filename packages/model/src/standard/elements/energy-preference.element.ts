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

export const EnergyPreference = Cluster(
    { name: "EnergyPreference", id: 0x9b, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "BALA", conformance: "O.a+", constraint: "0", title: "EnergyBalance" }),
        Field({ name: "LPMS", conformance: "O.a+", constraint: "1", title: "LowPowerModeSensitivity" })
    ),

    Attribute(
        {
            name: "EnergyBalances", id: 0x0, type: "list", access: "R V", conformance: "BALA",
            constraint: "2 to 10", quality: "F"
        },
        Field({ name: "entry", type: "BalanceStruct" })
    ),

    Attribute({ name: "CurrentEnergyBalance", id: 0x1, type: "uint8", access: "RW VO", conformance: "BALA", quality: "N" }),

    Attribute(
        {
            name: "EnergyPriorities", id: 0x2, type: "list", access: "R V", conformance: "BALA",
            constraint: "2", quality: "F"
        },
        Field({ name: "entry", type: "EnergyPriorityEnum" })
    ),

    Attribute(
        {
            name: "LowPowerModeSensitivities", id: 0x3, type: "list", access: "R V", conformance: "LPMS",
            constraint: "2 to 10", quality: "F"
        },
        Field({ name: "entry", type: "BalanceStruct" })
    ),

    Attribute({
        name: "CurrentLowPowerModeSensitivity", id: 0x4, type: "uint8", access: "RW VO",
        conformance: "LPMS", quality: "N"
    }),

    Datatype(
        { name: "EnergyPriorityEnum", type: "enum8" },
        Field({ name: "Comfort", id: 0x0, conformance: "M" }),
        Field({ name: "Speed", id: 0x1, conformance: "M" }),
        Field({ name: "Efficiency", id: 0x2, conformance: "M" }),
        Field({ name: "WaterConsumption", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "BalanceStruct", type: "struct" },
        Field({ name: "Step", id: 0x0, type: "percent", conformance: "M", quality: "F" }),
        Field({ name: "Label", id: 0x1, type: "string", conformance: "O", constraint: "max 64", quality: "F" })
    )
);

MatterDefinition.children.push(EnergyPreference);
