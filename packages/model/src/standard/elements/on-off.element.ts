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

export const OnOff = Cluster(
    { name: "OnOff", id: 0x6, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 6 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "LT", conformance: "[!OFFONLY]", constraint: "0", title: "Lighting" }),
        Field({ name: "DF", conformance: "[!OFFONLY]", constraint: "1", title: "DeadFrontBehavior" }),
        Field({ name: "OFFONLY", conformance: "[!LT | DF]", constraint: "2", title: "OffOnly" })
    ),

    Attribute({ name: "OnOff", id: 0x0, type: "bool", access: "R V", conformance: "M", quality: "N S" }),
    Attribute({ name: "GlobalSceneControl", id: 0x4000, type: "bool", access: "R V", conformance: "LT" }),
    Attribute({ name: "OnTime", id: 0x4001, type: "uint16", access: "RW VO", conformance: "LT" }),
    Attribute({ name: "OffWaitTime", id: 0x4002, type: "uint16", access: "RW VO", conformance: "LT" }),
    Attribute({
        name: "StartUpOnOff", id: 0x4003, type: "StartUpOnOffEnum", access: "RW VM", conformance: "LT",
        constraint: "desc", quality: "X N"
    }),
    Command({ name: "Off", id: 0x0, access: "O", conformance: "M", direction: "request", response: "status" }),
    Command({ name: "On", id: 0x1, access: "O", conformance: "!OFFONLY", direction: "request", response: "status" }),
    Command({ name: "Toggle", id: 0x2, access: "O", conformance: "!OFFONLY", direction: "request", response: "status" }),
    Command(
        { name: "OffWithEffect", id: 0x40, access: "O", conformance: "LT", direction: "request", response: "status" },
        Field({ name: "EffectIdentifier", id: 0x0, type: "EffectIdentifierEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "EffectVariant", id: 0x1, type: "enum8", conformance: "M", constraint: "desc" })
    ),
    Command({
        name: "OnWithRecallGlobalScene", id: 0x41, access: "O", conformance: "LT", direction: "request",
        response: "status"
    }),

    Command(
        { name: "OnWithTimedOff", id: 0x42, access: "O", conformance: "LT", direction: "request", response: "status" },
        Field({ name: "OnOffControl", id: 0x0, type: "OnOffControlBitmap", conformance: "M", constraint: "0 to 1" }),
        Field({ name: "OnTime", id: 0x1, type: "uint16", conformance: "M", constraint: "max 65534" }),
        Field({ name: "OffWaitTime", id: 0x2, type: "uint16", conformance: "M", constraint: "max 65534" })
    ),

    Datatype({ name: "OnOffControlBitmap", type: "map8" }, Field({ name: "AcceptOnlyWhenOn", constraint: "0" })),

    Datatype(
        { name: "StartUpOnOffEnum", type: "enum8" },
        Field({ name: "Off", id: 0x0, conformance: "M" }),
        Field({ name: "On", id: 0x1, conformance: "M" }),
        Field({ name: "Toggle", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "EffectIdentifierEnum", type: "enum8" },
        Field({ name: "DelayedAllOff", id: 0x0, conformance: "M" }),
        Field({ name: "DyingLight", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "DelayedAllOffEffectVariantEnum", type: "enum8" },
        Field({ name: "DelayedOffFastFade", id: 0x0, conformance: "M" }),
        Field({ name: "NoFade", id: 0x1, conformance: "M" }),
        Field({ name: "DelayedOffSlowFade", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "DyingLightEffectVariantEnum", type: "enum8" },
        Field({ name: "DyingLightFadeOff", id: 0x0, conformance: "M" })
    )
);

MatterDefinition.children.push(OnOff);
