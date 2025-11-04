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
    CommandElement as Command
} from "../../elements/index.js";

export const MicrowaveOvenControl = Cluster(
    { name: "MicrowaveOvenControl", id: 0x5f, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PWRNUM", conformance: "O.a", constraint: "0", title: "PowerAsNumber" }),
        Field({ name: "WATTS", conformance: "P, O.a", constraint: "1", title: "PowerInWatts" }),
        Field({ name: "PWRLMTS", conformance: "[PWRNUM]", constraint: "2", title: "PowerNumberLimits" })
    ),

    Attribute({ name: "CookTime", id: 0x0, type: "elapsed-s", access: "R V", conformance: "M", constraint: "1 to maxCookTime" }),
    Attribute({
        name: "MaxCookTime", id: 0x1, type: "elapsed-s", access: "R V", conformance: "M",
        constraint: "1 to 86400", quality: "F"
    }),
    Attribute({ name: "PowerSetting", id: 0x2, type: "uint8", access: "R V", conformance: "PWRNUM", constraint: "desc" }),
    Attribute({
        name: "MinPower", id: 0x3, type: "uint8", access: "R V", conformance: "PWRLMTS",
        constraint: "1 to 99", quality: "F"
    }),
    Attribute({
        name: "MaxPower", id: 0x4, type: "uint8", access: "R V", conformance: "PWRLMTS",
        constraint: "minPower + 1 to 100", quality: "F"
    }),
    Attribute({
        name: "PowerStep", id: 0x5, type: "uint8", access: "R V", conformance: "PWRLMTS",
        constraint: "desc", quality: "F"
    }),

    Attribute(
        {
            name: "SupportedWatts", id: 0x6, type: "list", access: "R V", conformance: "P, WATTS",
            constraint: "1 to 10", quality: "F"
        },
        Field({ name: "entry", type: "uint16" })
    ),

    Attribute({ name: "SelectedWattIndex", id: 0x7, type: "uint8", access: "R V", conformance: "P, WATTS", constraint: "desc" }),
    Attribute({ name: "WattRating", id: 0x8, type: "uint16", access: "R V", conformance: "O", quality: "F" }),

    Command(
        {
            name: "SetCookingParameters", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "CookMode", id: 0x0, type: "uint8", conformance: "O.b+", constraint: "desc" }),
        Field({
            name: "CookTime", id: 0x1, type: "elapsed-s", conformance: "O.b+", constraint: "1 to maxCookTime",
            default: 30
        }),
        Field({
            name: "PowerSetting", id: 0x2, type: "uint8", conformance: "[PWRNUM].b+",
            constraint: "minPower to maxPower", default: { type: "reference", name: "MaxPower" }
        }),
        Field({ name: "WattSettingIndex", id: 0x3, type: "uint8", conformance: "[WATTS].b+", constraint: "desc" }),
        Field({ name: "StartAfterSetting", id: 0x4, type: "bool", conformance: "O", default: false })
    ),

    Command(
        { name: "AddMoreTime", id: 0x1, access: "O", conformance: "O", direction: "request", response: "status" },
        Field({ name: "TimeToAdd", id: 0x0, type: "elapsed-s", conformance: "M", constraint: "1 to maxCookTime" })
    )
);

MatterDefinition.children.push(MicrowaveOvenControl);
