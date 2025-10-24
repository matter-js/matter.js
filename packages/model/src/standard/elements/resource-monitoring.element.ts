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

export const ResourceMonitoring = Cluster(
    { name: "ResourceMonitoring" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "CON", conformance: "O", constraint: "0", title: "Condition" }),
        Field({ name: "WRN", conformance: "O", constraint: "1", title: "Warning" }),
        Field({ name: "REP", conformance: "O", constraint: "2", title: "ReplacementProductList" })
    ),

    Attribute({ name: "Condition", id: 0x0, type: "percent", access: "R V", conformance: "CON" }),
    Attribute({
        name: "DegradationDirection", id: 0x1, type: "DegradationDirectionEnum", access: "R V",
        conformance: "CON", constraint: "desc", quality: "F"
    }),
    Attribute({ name: "ChangeIndication", id: 0x2, type: "ChangeIndicationEnum", access: "R V", conformance: "M" }),
    Attribute({ name: "InPlaceIndicator", id: 0x3, type: "bool", access: "R V", conformance: "O" }),
    Attribute({
        name: "LastChangedTime", id: 0x4, type: "epoch-s", access: "RW VO", conformance: "O", default: null,
        quality: "X N"
    }),

    Attribute(
        {
            name: "ReplacementProductList", id: 0x5, type: "list", access: "R V", conformance: "REP",
            constraint: "max 5", quality: "F"
        },
        Field({ name: "entry", type: "ReplacementProductStruct" })
    ),

    Command({ name: "ResetCondition", id: 0x0, access: "O", conformance: "O", direction: "request", response: "status" }),
    Datatype(
        { name: "DegradationDirectionEnum", type: "enum8" },
        Field({ name: "Up", id: 0x0, conformance: "M" }),
        Field({ name: "Down", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "ChangeIndicationEnum", type: "enum8" },
        Field({ name: "Ok", id: 0x0, conformance: "M" }),
        Field({ name: "Warning", id: 0x1, conformance: "WRN" }),
        Field({ name: "Critical", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "ProductIdentifierTypeEnum", type: "enum8" },
        Field({ name: "Upc", id: 0x0, conformance: "M" }),
        Field({ name: "Gtin8", id: 0x1, conformance: "M" }),
        Field({ name: "Ean", id: 0x2, conformance: "M" }),
        Field({ name: "Gtin14", id: 0x3, conformance: "M" }),
        Field({ name: "Oem", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "ReplacementProductStruct", type: "struct" },
        Field({
            name: "ProductIdentifierType", id: 0x0, type: "ProductIdentifierTypeEnum", conformance: "M",
            constraint: "desc"
        }),
        Field({ name: "ProductIdentifierValue", id: 0x1, type: "string", conformance: "M", constraint: "max 20" })
    )
);

MatterDefinition.children.push(ResourceMonitoring);
