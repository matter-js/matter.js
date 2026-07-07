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

export const CommodityPrice = Cluster(
    { name: "CommodityPrice", id: 0x95, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 4 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "FORE", conformance: "O", constraint: "0", title: "Forecasting" })
    ),
    Attribute({ name: "TariffUnit", id: 0x0, type: "TariffUnitEnum", access: "R V", conformance: "M" }),
    Attribute({ name: "Currency", id: 0x1, type: "currency", access: "R V", conformance: "M", quality: "X" }),
    Attribute(
        { name: "CurrentPrice", id: 0x2, type: "CommodityPriceStruct", access: "R V", conformance: "M", quality: "X" }
    ),
    Attribute(
        { name: "PriceForecast", id: 0x3, type: "list", access: "R V", conformance: "FORE", constraint: "max 56" },
        Field({ name: "entry", type: "CommodityPriceStruct" })
    ),
    Event(
        { name: "PriceChange", id: 0x0, access: "V", conformance: "O", priority: "info" },
        Field({ name: "CurrentPrice", id: 0x0, type: "CommodityPriceStruct", conformance: "M", quality: "X" })
    ),

    Command(
        {
            name: "GetDetailedPriceRequest", id: 0x0, access: "O", conformance: "O", direction: "request",
            response: "GetDetailedPriceResponse"
        },
        Field({ name: "Details", id: 0x0, type: "CommodityPriceDetailBitmap", conformance: "M" })
    ),

    Command(
        { name: "GetDetailedPriceResponse", id: 0x1, conformance: "GetDetailedPriceRequest", direction: "response" },
        Field({ name: "CurrentPrice", id: 0x0, type: "CommodityPriceStruct", conformance: "M", quality: "X" })
    ),

    Command(
        {
            name: "GetDetailedForecastRequest", id: 0x2, access: "O", conformance: "[FORE]",
            direction: "request", quality: "L", response: "GetDetailedForecastResponse"
        },
        Field({ name: "Details", id: 0x0, type: "CommodityPriceDetailBitmap", conformance: "M" })
    ),

    Command(
        {
            name: "GetDetailedForecastResponse", id: 0x3, conformance: "GetDetailedForecastRequest",
            direction: "response", quality: "L"
        },
        Field(
            { name: "PriceForecast", id: 0x0, type: "list", conformance: "M", constraint: "max 56" },
            Field({ name: "entry", type: "CommodityPriceStruct" })
        )
    ),

    Datatype(
        { name: "CommodityPriceDetailBitmap", type: "map16" },
        Field({ name: "Description", constraint: "0" }),
        Field({ name: "Components", constraint: "1" })
    ),

    Datatype(
        { name: "CommodityPriceComponentStruct", type: "struct" },
        Field({ name: "Price", id: 0x0, type: "money", conformance: "M" }),
        Field({ name: "Source", id: 0x1, type: "TariffPriceTypeEnum", conformance: "M" }),
        Field({ name: "Description", id: 0x2, type: "string", conformance: "O", constraint: "max 32" }),
        Field({ name: "TariffComponentId", id: 0x3, type: "uint32", conformance: "O" })
    ),

    Datatype(
        { name: "CommodityPriceStruct", type: "struct" },
        Field({ name: "PeriodStart", id: 0x0, type: "epoch-s", conformance: "M" }),
        Field({
            name: "PeriodEnd", id: 0x1, type: "epoch-s", conformance: "M", constraint: "min periodStart + 1",
            quality: "X"
        }),
        Field({ name: "Price", id: 0x2, type: "money", conformance: "O.b+" }),
        Field({ name: "PriceLevel", id: 0x3, type: "int16", conformance: "O.b+" }),
        Field({ name: "Description", id: 0x4, type: "string", conformance: "O", constraint: "max 32" }),
        Field(
            { name: "Components", id: 0x5, type: "list", conformance: "[Price]", constraint: "max 10", default: [] },
            Field({ name: "entry", type: "CommodityPriceComponentStruct" })
        )
    )
);

MatterDefinition.children.push(CommodityPrice);
