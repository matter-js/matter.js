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
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const CommodityTariff = Cluster(
    { name: "CommodityTariff", id: 0x700, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PRICE", conformance: "O.a+", constraint: "0", title: "Pricing" }),
        Field({ name: "FCRED", conformance: "O.a+", constraint: "1", title: "FriendlyCredit" }),
        Field({ name: "AUXLD", conformance: "O.a+", constraint: "2", title: "AuxiliaryLoad" }),
        Field({ name: "PEAKP", conformance: "O", constraint: "3", title: "PeakPeriod" }),
        Field({ name: "PWRTHLD", conformance: "O", constraint: "4", title: "PowerThreshold" }),
        Field({ name: "RNDM", conformance: "O", constraint: "5", title: "Randomization" })
    ),

    Attribute(
        { name: "TariffInfo", id: 0x0, type: "TariffInformationStruct", access: "R V", conformance: "M", quality: "X" }
    ),
    Attribute({ name: "TariffUnit", id: 0x1, type: "TariffUnitEnum", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "StartDate", id: 0x2, type: "epoch-s", access: "R V", conformance: "M", constraint: "desc", quality: "X" }),

    Attribute(
        {
            name: "DayEntries", id: 0x3, type: "list", access: "R V", conformance: "M", constraint: "max 672",
            quality: "X"
        },
        Field({ name: "entry", type: "DayEntryStruct" })
    ),

    Attribute(
        {
            name: "DayPatterns", id: 0x4, type: "list", access: "R V", conformance: "M", constraint: "max 28",
            quality: "X"
        },
        Field({ name: "entry", type: "DayPatternStruct" })
    ),

    Attribute(
        {
            name: "CalendarPeriods", id: 0x5, type: "list", access: "R V", conformance: "M",
            constraint: "1 to 4", quality: "X"
        },
        Field({ name: "entry", type: "CalendarPeriodStruct" })
    ),

    Attribute(
        {
            name: "IndividualDays", id: 0x6, type: "list", access: "R V", conformance: "M",
            constraint: "max 50", quality: "X"
        },
        Field({ name: "entry", type: "DayStruct" })
    ),

    Attribute({ name: "CurrentDay", id: 0x7, type: "DayStruct", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "NextDay", id: 0x8, type: "DayStruct", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "CurrentDayEntry", id: 0x9, type: "DayEntryStruct", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "CurrentDayEntryDate", id: 0xa, type: "epoch-s", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "NextDayEntry", id: 0xb, type: "DayEntryStruct", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "NextDayEntryDate", id: 0xc, type: "epoch-s", access: "R V", conformance: "M", quality: "X" }),

    Attribute(
        {
            name: "TariffComponents", id: 0xd, type: "list", access: "R V", conformance: "M",
            constraint: "1 to 672", quality: "X"
        },
        Field({ name: "entry", type: "TariffComponentStruct" })
    ),

    Attribute(
        {
            name: "TariffPeriods", id: 0xe, type: "list", access: "R V", conformance: "M",
            constraint: "1 to 672", quality: "X"
        },
        Field({ name: "entry", type: "TariffPeriodStruct" })
    ),

    Attribute(
        {
            name: "CurrentTariffComponents", id: 0xf, type: "list", access: "R V", conformance: "M",
            constraint: "max 20", quality: "X"
        },
        Field({ name: "entry", type: "TariffComponentStruct" })
    ),

    Attribute(
        {
            name: "NextTariffComponents", id: 0x10, type: "list", access: "R V", conformance: "M",
            constraint: "max 20", quality: "X"
        },
        Field({ name: "entry", type: "TariffComponentStruct" })
    ),

    Attribute({
        name: "DefaultRandomizationOffset", id: 0x11, type: "int16", access: "R V", conformance: "RNDM",
        constraint: "desc", quality: "X"
    }),
    Attribute({
        name: "DefaultRandomizationType", id: 0x12, type: "DayEntryRandomizationTypeEnum", access: "R V",
        conformance: "RNDM", quality: "X"
    }),

    Command(
        {
            name: "GetTariffComponent", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "GetTariffComponentResponse"
        },
        Field({ name: "TariffComponentId", id: 0x0, type: "uint32", conformance: "M" })
    ),

    Command(
        { name: "GetTariffComponentResponse", id: 0x0, conformance: "M", direction: "response" },
        Field({ name: "Label", id: 0x0, type: "string", conformance: "M", constraint: "max 128", quality: "X" }),
        Field(
            { name: "DayEntryIDs", id: 0x1, type: "list", conformance: "M", constraint: "1 to 96" },
            Field({ name: "entry", type: "uint32" })
        ),
        Field({ name: "TariffComponent", id: 0x2, type: "TariffComponentStruct", conformance: "M" })
    ),

    Command(
        {
            name: "GetDayEntry", id: 0x1, access: "O", conformance: "M", direction: "request",
            response: "GetDayEntryResponse"
        },
        Field({ name: "DayEntryId", id: 0x0, type: "uint32", conformance: "M" })
    ),

    Command(
        { name: "GetDayEntryResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "DayEntry", id: 0x0, type: "DayEntryStruct", conformance: "M" })
    ),

    Datatype(
        { name: "DayPatternDayOfWeekBitmap", type: "map8" },
        Field({ name: "Sunday", constraint: "0" }),
        Field({ name: "Monday", constraint: "1" }),
        Field({ name: "Tuesday", constraint: "2" }),
        Field({ name: "Wednesday", constraint: "3" }),
        Field({ name: "Thursday", constraint: "4" }),
        Field({ name: "Friday", constraint: "5" }),
        Field({ name: "Saturday", constraint: "6" })
    ),

    Datatype(
        { name: "AuxiliaryLoadSettingEnum", type: "enum8" },
        Field({ name: "Off", id: 0x0, conformance: "M" }),
        Field({ name: "On", id: 0x1, conformance: "M" }),
        Field({ name: "None", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "DayTypeEnum", type: "enum8" },
        Field({ name: "Standard", id: 0x0, conformance: "M" }),
        Field({ name: "Holiday", id: 0x1, conformance: "M" }),
        Field({ name: "Dynamic", id: 0x2, conformance: "M" }),
        Field({ name: "Event", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "PeakPeriodSeverityEnum", type: "enum8" },
        Field({ name: "Unused", id: 0x0, conformance: "M" }),
        Field({ name: "Low", id: 0x1, conformance: "M" }),
        Field({ name: "Medium", id: 0x2, conformance: "M" }),
        Field({ name: "High", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "DayEntryRandomizationTypeEnum", type: "enum8" },
        Field({ name: "None", id: 0x0, conformance: "M" }),
        Field({ name: "Fixed", id: 0x1, conformance: "M" }),
        Field({ name: "Random", id: 0x2, conformance: "M" }),
        Field({ name: "RandomPositive", id: 0x3, conformance: "M" }),
        Field({ name: "RandomNegative", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "BlockModeEnum", type: "enum8" },
        Field({ name: "NoBlock", id: 0x0, conformance: "M" }),
        Field({ name: "Combined", id: 0x1, conformance: "M" }),
        Field({ name: "Individual", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "AuxiliaryLoadSwitchSettingsStruct", type: "struct" },
        Field({ name: "Number", id: 0x0, type: "uint8", conformance: "M" }),
        Field({ name: "RequiredState", id: 0x1, type: "AuxiliaryLoadSettingEnum", conformance: "M" })
    ),

    Datatype(
        { name: "AuxiliaryLoadSwitchesSettingsStruct", type: "struct" },
        Field(
            { name: "SwitchStates", id: 0x0, type: "list", conformance: "M", constraint: "max 8" },
            Field({ name: "entry", type: "AuxiliaryLoadSwitchSettingsStruct" })
        )
    ),

    Datatype(
        { name: "CalendarPeriodStruct", type: "struct" },
        Field({ name: "StartDate", id: 0x0, type: "epoch-s", conformance: "M", constraint: "min startDate", quality: "X" }),
        Field(
            { name: "DayPatternIDs", id: 0x1, type: "list", conformance: "M", constraint: "1 to 7" },
            Field({ name: "entry", type: "uint32" })
        )
    ),

    Datatype(
        { name: "DayEntryStruct", type: "struct" },
        Field({ name: "DayEntryId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "StartTime", id: 0x1, type: "uint16", conformance: "M", constraint: "max 1499" }),
        Field({ name: "Duration", id: 0x2, type: "uint16", conformance: "O", constraint: "max 1500 - startTime" }),
        Field({ name: "RandomizationOffset", id: 0x3, type: "int16", conformance: "[RNDM]" }),
        Field({
            name: "RandomizationType", id: 0x4, type: "DayEntryRandomizationTypeEnum", conformance: "[RNDM]",
            default: 0
        })
    ),

    Datatype(
        { name: "DayStruct", type: "struct" },
        Field({ name: "Date", id: 0x0, type: "epoch-s", conformance: "M" }),
        Field({ name: "DayType", id: 0x1, type: "DayTypeEnum", conformance: "M", constraint: "any" }),
        Field(
            { name: "DayEntryIDs", id: 0x2, type: "list", conformance: "M", constraint: "1 to 96" },
            Field({ name: "entry", type: "uint32" })
        )
    ),

    Datatype(
        { name: "DayPatternStruct", type: "struct" },
        Field({ name: "DayPatternId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "DaysOfWeek", id: 0x1, type: "DayPatternDayOfWeekBitmap", conformance: "M" }),
        Field(
            { name: "DayEntryIDs", id: 0x2, type: "list", conformance: "M", constraint: "1 to 96" },
            Field({ name: "entry", type: "uint32" })
        )
    ),

    Datatype(
        { name: "PeakPeriodStruct", type: "struct" },
        Field({ name: "Severity", id: 0x0, type: "PeakPeriodSeverityEnum", conformance: "M" }),
        Field({ name: "PeakPeriod", id: 0x1, type: "uint16", conformance: "M", constraint: "min 1" })
    ),

    Datatype(
        { name: "TariffInformationStruct", type: "struct" },
        Field({ name: "TariffLabel", id: 0x0, type: "string", conformance: "M", constraint: "max 128", quality: "X" }),
        Field({ name: "ProviderName", id: 0x1, type: "string", conformance: "M", constraint: "max 128", quality: "X" }),
        Field({ name: "Currency", id: 0x2, type: "currency", conformance: "PRICE", quality: "X" }),
        Field({ name: "BlockMode", id: 0x3, type: "BlockModeEnum", conformance: "M", quality: "X" })
    ),

    Datatype(
        { name: "TariffPriceStruct", type: "struct" },
        Field({ name: "PriceType", id: 0x0, type: "TariffPriceTypeEnum", conformance: "M" }),
        Field({ name: "Price", id: 0x1, type: "money", conformance: "O.c+" }),
        Field({ name: "PriceLevel", id: 0x2, type: "int16", conformance: "O.c+" })
    ),

    Datatype(
        { name: "TariffComponentStruct", type: "struct" },
        Field({ name: "TariffComponentId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "Price", id: 0x1, type: "TariffPriceStruct", conformance: "[PRICE].b+", quality: "X" }),
        Field({ name: "FriendlyCredit", id: 0x2, type: "bool", conformance: "[FCRED].b+" }),
        Field({ name: "AuxiliaryLoad", id: 0x3, type: "AuxiliaryLoadSwitchSettingsStruct", conformance: "[AUXLD].b+" }),
        Field({ name: "PeakPeriod", id: 0x4, type: "PeakPeriodStruct", conformance: "[PEAKP].b+", default: { type: "none" } }),
        Field({
            name: "PowerThreshold", id: 0x5, type: "PowerThresholdStruct", conformance: "[PWRTHLD].b+",
            default: { type: "none" }
        }),
        Field({ name: "Threshold", id: 0x6, type: "int64", conformance: "M", quality: "X" }),
        Field({ name: "Label", id: 0x7, type: "string", conformance: "O", constraint: "max 128", quality: "X" }),
        Field({ name: "Predicted", id: 0x8, type: "bool", conformance: "O" })
    ),

    Datatype(
        { name: "TariffPeriodStruct", type: "struct" },
        Field({ name: "Label", id: 0x0, type: "string", conformance: "M", constraint: "max 128", quality: "X" }),
        Field(
            { name: "DayEntryIDs", id: 0x1, type: "list", conformance: "M", constraint: "1 to 20" },
            Field({ name: "entry", type: "uint32" })
        ),
        Field(
            { name: "TariffComponentIDs", id: 0x2, type: "list", conformance: "M", constraint: "1 to 20" },
            Field({ name: "entry", type: "uint32" })
        )
    )
);

MatterDefinition.children.push(CommodityTariff);
