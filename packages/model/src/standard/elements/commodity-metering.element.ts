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
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const CommodityMetering = Cluster(
    { name: "CommodityMetering", id: 0xb07, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        {
            name: "MeteredQuantity", id: 0x0, type: "list", access: "R V", conformance: "M",
            constraint: "max maximumMeteredQuantities", quality: "X"
        },
        Field({ name: "entry", type: "MeteredQuantityStruct" })
    ),

    Attribute(
        { name: "MeteredQuantityTimestamp", id: 0x1, type: "epoch-s", access: "R V", conformance: "M", quality: "X" }
    ),
    Attribute({ name: "TariffUnit", id: 0x2, type: "TariffUnitEnum", access: "R V", conformance: "M", quality: "X" }),
    Attribute({
        name: "MaximumMeteredQuantities", id: 0x3, type: "uint16", access: "R V", conformance: "M",
        constraint: "min 1", quality: "X"
    }),

    Datatype(
        { name: "MeteredQuantityStruct", type: "struct" },
        Field(
            { name: "TariffComponentIDs", id: 0x0, type: "list", conformance: "M", constraint: "max 128" },
            Field({ name: "entry", type: "uint32" })
        ),
        Field({ name: "Quantity", id: 0x1, type: "int64", conformance: "M" })
    )
);

MatterDefinition.children.push(CommodityMetering);
