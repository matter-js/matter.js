/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "CommodityPrice", pics: "SEPR", xref: "cluster§9.9",
    details: "The Commodity Price Cluster provides the mechanism for communicating Gas, Energy, or Water pricing " +
        "information within the premises.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§9.9.4",
            children: [{ tag: "field", name: "FORE", details: "Forecasts upcoming pricing" }]
        },
        {
            tag: "attribute", name: "TariffUnit", xref: "cluster§9.9.6.1",
            details: "Indicates the unit of measure for all pricing reported by this cluster."
        },
        {
            tag: "attribute", name: "Currency", xref: "cluster§9.9.6.2",
            details: "Indicates the currency for all pricing reported by this cluster. If the current currency is unknown, " +
                "or cannot be determined, the value shall be null."
        },

        {
            tag: "attribute", name: "CurrentPrice", xref: "cluster§9.9.6.3",
            details: "Indicates the current price. If the current price is unknown, or cannot be determined, the value " +
                "shall be null." +
                "\n" +
                "The Description and Components fields shall be omitted in this attribute’s value."
        },

        {
            tag: "attribute", name: "PriceForecast", xref: "cluster§9.9.6.4",

            details: "Indicates the forecast of upcoming price changes. If the forecast is unable to be determined, this " +
                "list shall be empty." +
                "\n" +
                "The list entries shall be in time order:" +
                "\n" +
                "  - All entries except the last one shall have a non-null PeriodEnd." +
                "\n" +
                "  - For all entries except the first one, PeriodStart shall be greater than the previous entry’s " +
                "PeriodEnd." +
                "\n" +
                "The Description and Components fields shall be omitted from CommodityPriceStructs in this " +
                "attribute’s value." +
                "\n" +
                "If the PeriodEnd field is null on the value of the CurrentPrice attribute, then this list shall be " +
                "empty."
        },

        {
            tag: "event", name: "PriceChange", xref: "cluster§9.9.8.1",
            details: "This event shall be generated when the value of the CurrentPrice attribute changes.",
            children: [{
                tag: "field", name: "CurrentPrice", xref: "cluster§9.9.8.1.1",
                details: "This field shall be the new value of the CurrentPrice attribute."
            }]
        },

        {
            tag: "command", name: "GetDetailedPriceRequest", xref: "cluster§9.9.7.1",
            details: "Upon receipt, this shall generate a GetDetailedPrice Response command.",
            children: [{
                tag: "field", name: "Details", xref: "cluster§9.9.7.1.1",
                details: "This field shall indicate which fields on the CommodityPriceStruct in the " +
                    "GetDetailedPriceResponseCurrentPrice field will be included."
            }]
        },

        {
            tag: "command", name: "GetDetailedPriceResponse", xref: "cluster§9.9.7.2",
            details: "This command shall be generated in response to a GetDetailedPrice Request command.",

            children: [{
                tag: "field", name: "CurrentPrice", xref: "cluster§9.9.7.2.1",
                details: "This field shall indicate the current price. Unlike the value returned from the CurrentPrice " +
                    "attribute, the Description and Components fields may be populated based on the value of the " +
                    "GetDetailedPriceRequestDetails field." +
                    "\n" +
                    "If the current price is unknown, or cannot be determined, the value shall be null."
            }]
        },

        {
            tag: "command", name: "GetDetailedForecastRequest", xref: "cluster§9.9.7.3",
            details: "Upon receipt, this shall generate a GetDetailedForecast Response command.",
            children: [{
                tag: "field", name: "Details", xref: "cluster§9.9.7.3.1",
                details: "This field shall indicate which fields on the CommodityPriceStructs in the " +
                    "GetDetailedForecastResponsePriceForecast field will be included."
            }]
        },

        {
            tag: "command", name: "GetDetailedForecastResponse", xref: "cluster§9.9.7.4",
            details: "This command shall be generated in response to a GetDetailedForecast Request command.",

            children: [{
                tag: "field", name: "PriceForecast", xref: "cluster§9.9.7.4.1",
                details: "This field shall indicate the current forecast of upcoming price changes. Unlike the value returned " +
                    "from the PriceForecast attribute, the Description and Components fields may be populated on each " +
                    "CommodityPriceStruct based on the value of the GetDetailedPriceRequestDetails field." +
                    "\n" +
                    "If the forecast is unable to be determined, this list shall be empty."
            }]
        },

        {
            tag: "datatype", name: "CommodityPriceDetailBitmap", xref: "cluster§9.9.5.1",

            children: [
                {
                    tag: "field", name: "Description",
                    description: "A textual description of a price; e.g. the name of a rate plan."
                },
                {
                    tag: "field", name: "Components",
                    description: "A breakdown of the component parts of a price; e.g. generation, delivery, etc."
                }
            ]
        },

        {
            tag: "datatype", name: "CommodityPriceComponentStruct", xref: "cluster§9.9.5.2",
            details: "This represents a component of a given price; it is only used in the Components field.",

            children: [
                {
                    tag: "field", name: "Price", xref: "cluster§9.9.5.2.1",
                    details: "This field shall indicate the component price of the commodity per TariffUnit, with the currency " +
                        "indicated by the currency of the Price field of the parent CommodityPriceStruct."
                },
                {
                    tag: "field", name: "Source", xref: "cluster§9.9.5.2.3",
                    details: "This field shall indicate the source of the price component."
                },

                {
                    tag: "field", name: "Description", xref: "cluster§9.9.5.2.4",
                    details: "This field shall indicate a description of the pricing plan yielding the value of the Price field. " +
                        "For example, this field may contain the name of the current block of the selected billing plan, or " +
                        "the name of the time of usage tier."
                },

                {
                    tag: "field", name: "TariffComponentId", xref: "cluster§9.9.5.2.5",
                    details: "This field shall indicate the ID of the associated TariffComponent for this price component. If " +
                        "there is no associated TariffComponent, this field shall be omitted."
                }
            ]
        },

        {
            tag: "datatype", name: "CommodityPriceStruct", xref: "cluster§9.9.5.3",
            details: "This represents a price over a given period.",

            children: [
                {
                    tag: "field", name: "PeriodStart", xref: "cluster§9.9.5.3.1",
                    details: "This field shall indicate the beginning timestamp in UTC of the period covered by the price " +
                        "indicated in the Price field, or the price level indicated in the Price Level field, or both."
                },

                {
                    tag: "field", name: "PeriodEnd", xref: "cluster§9.9.5.3.2",
                    details: "This field shall indicate the ending timestamp in UTC of the period covered by the price indicated " +
                        "in the Price field, or the price level indicated in the Price Level field, or both." +
                        "\n" +
                        "If this field is null, then the period has no definite end."
                },

                {
                    tag: "field", name: "Price", xref: "cluster§9.9.5.3.3",
                    details: "This field shall indicate the price of the commodity per TariffUnit."
                },
                {
                    tag: "field", name: "PriceLevel", xref: "cluster§9.9.5.3.4",
                    details: "This field shall indicate the tariff price level."
                },
                {
                    tag: "field", name: "Description", xref: "cluster§9.9.5.3.5",
                    details: "This field shall indicate a description of the pricing plan yielding the value of the Price field, " +
                        "or the Price Level field. For example, this field may contain the name of the selected billing plan."
                },

                {
                    tag: "field", name: "Components", xref: "cluster§9.9.5.3.6",
                    details: "This field shall indicate a list of the components that comprise the value in the Price field. For " +
                        "example, if a pricing plan has a base price and a surcharge for a given time of day, it may have two " +
                        "entries in the Components field." +
                        "\n" +
                        "If this field is not empty, the Price fields in the list shall sum to the value in the Price field."
                }
            ]
        }
    ]
});
