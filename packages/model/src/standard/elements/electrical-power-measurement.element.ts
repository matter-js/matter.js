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
    EventElement as Event,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const ElectricalPowerMeasurement = Cluster(
    { name: "ElectricalPowerMeasurement", id: 0x90, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "DIRC", conformance: "O.a+", constraint: "0", title: "DirectCurrent" }),
        Field({ name: "ALTC", conformance: "O.a+", constraint: "1", title: "AlternatingCurrent" }),
        Field({ name: "POLY", conformance: "[ALTC]", constraint: "2", title: "PolyphasePower" }),
        Field({ name: "HARM", conformance: "[ALTC]", constraint: "3", title: "Harmonics" }),
        Field({ name: "PWRQ", conformance: "[ALTC]", constraint: "4", title: "PowerQuality" })
    ),

    Attribute({ name: "PowerMode", id: 0x0, type: "PowerModeEnum", access: "R V", conformance: "M" }),
    Attribute({
        name: "NumberOfMeasurementTypes", id: 0x1, type: "uint8", access: "R V", conformance: "M",
        constraint: "max 32", quality: "F"
    }),

    Attribute(
        {
            name: "Accuracy", id: 0x2, type: "list", access: "R V", conformance: "M",
            constraint: "1 to numberOfMeasurementTypes", quality: "F"
        },
        Field({ name: "entry", type: "MeasurementAccuracyStruct" })
    ),

    Attribute(
        {
            name: "Ranges", id: 0x3, type: "list", access: "R V", conformance: "O",
            constraint: "0 to numberOfMeasurementTypes", default: [], quality: "Q"
        },
        Field({ name: "entry", type: "MeasurementRangeStruct" })
    ),

    Attribute({ name: "Voltage", id: 0x4, type: "voltage-mV", access: "R V", conformance: "O", default: null, quality: "X Q" }),
    Attribute({
        name: "ActiveCurrent", id: 0x5, type: "amperage-mA", access: "R V", conformance: "O", default: null,
        quality: "X Q"
    }),
    Attribute({
        name: "ReactiveCurrent", id: 0x6, type: "amperage-mA", access: "R V", conformance: "[ALTC]",
        default: null, quality: "X Q"
    }),
    Attribute({
        name: "ApparentCurrent", id: 0x7, type: "amperage-mA", access: "R V", conformance: "[ALTC]",
        default: null, quality: "X Q"
    }),
    Attribute({ name: "ActivePower", id: 0x8, type: "power-mW", access: "R V", conformance: "M", quality: "X Q" }),
    Attribute({
        name: "ReactivePower", id: 0x9, type: "power-mVAR", access: "R V", conformance: "[ALTC]",
        default: null, quality: "X Q"
    }),
    Attribute({
        name: "ApparentPower", id: 0xa, type: "power-mVA", access: "R V", conformance: "[ALTC]",
        default: null, quality: "X Q"
    }),
    Attribute({
        name: "RmsVoltage", id: 0xb, type: "voltage-mV", access: "R V", conformance: "[ALTC]",
        default: null, quality: "X Q"
    }),
    Attribute({
        name: "RmsCurrent", id: 0xc, type: "amperage-mA", access: "R V", conformance: "[ALTC]",
        default: null, quality: "X Q"
    }),
    Attribute({
        name: "RmsPower", id: 0xd, type: "power-mW", access: "R V", conformance: "[ALTC]", default: null,
        quality: "X Q"
    }),
    Attribute({
        name: "Frequency", id: 0xe, type: "int64", access: "R V", conformance: "[ALTC]",
        constraint: "0 to 1000000", default: null, quality: "X Q"
    }),

    Attribute(
        {
            name: "HarmonicCurrents", id: 0xf, type: "list", access: "R V", conformance: "HARM",
            constraint: "max 25", quality: "X Q"
        },
        Field({ name: "entry", type: "HarmonicMeasurementStruct" })
    ),

    Attribute(
        {
            name: "HarmonicPhases", id: 0x10, type: "list", access: "R V", conformance: "PWRQ",
            constraint: "max 25", quality: "X Q"
        },
        Field({ name: "entry", type: "HarmonicMeasurementStruct" })
    ),

    Attribute({
        name: "PowerFactor", id: 0x11, type: "int64", access: "R V", conformance: "[ALTC]",
        constraint: "-10000 to 10000", default: null, quality: "X Q"
    }),
    Attribute({
        name: "NeutralCurrent", id: 0x12, type: "amperage-mA", access: "R V", conformance: "[POLY]",
        default: null, quality: "X Q"
    }),

    Event(
        { name: "MeasurementPeriodRanges", id: 0x0, access: "V", conformance: "Ranges", priority: "info" },

        Field(
            {
                name: "Ranges", id: 0x0, type: "list", access: "R V", conformance: "M",
                constraint: "1 to numberOfMeasurementTypes", default: []
            },
            Field({ name: "entry", type: "MeasurementRangeStruct" })
        )
    ),

    Datatype(
        { name: "PowerModeEnum", type: "enum8" },
        Field({ name: "Unknown", id: 0x0, conformance: "M" }),
        Field({ name: "Dc", id: 0x1, conformance: "M" }),
        Field({ name: "Ac", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "MeasurementTypeEnum", type: "enum16" },
        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
        Field({ name: "Voltage", id: 0x1, conformance: "M" }),
        Field({ name: "ActiveCurrent", id: 0x2, conformance: "M" }),
        Field({ name: "ReactiveCurrent", id: 0x3, conformance: "M" }),
        Field({ name: "ApparentCurrent", id: 0x4, conformance: "M" }),
        Field({ name: "ActivePower", id: 0x5, conformance: "M" }),
        Field({ name: "ReactivePower", id: 0x6, conformance: "M" }),
        Field({ name: "ApparentPower", id: 0x7, conformance: "M" }),
        Field({ name: "RmsVoltage", id: 0x8, conformance: "M" }),
        Field({ name: "RmsCurrent", id: 0x9, conformance: "M" }),
        Field({ name: "RmsPower", id: 0xa, conformance: "M" }),
        Field({ name: "Frequency", id: 0xb, conformance: "M" }),
        Field({ name: "PowerFactor", id: 0xc, conformance: "M" }),
        Field({ name: "NeutralCurrent", id: 0xd, conformance: "M" }),
        Field({ name: "ElectricalEnergy", id: 0xe, conformance: "M" }),
        Field({ name: "ReactiveEnergy", id: 0xf, conformance: "M" }),
        Field({ name: "ApparentEnergy", id: 0x10, conformance: "M" })
    ),

    Datatype(
        { name: "MeasurementRangeStruct", type: "struct" },
        Field({ name: "MeasurementType", id: 0x0, type: "MeasurementTypeEnum", conformance: "M" }),
        Field({ name: "Min", id: 0x1, type: "int64", conformance: "M" }),
        Field({ name: "Max", id: 0x2, type: "int64", conformance: "M" }),
        Field({ name: "StartTimestamp", id: 0x3, type: "epoch-s", conformance: "EndTimestamp" }),
        Field({ name: "EndTimestamp", id: 0x4, type: "epoch-s", conformance: "desc", constraint: "min startTimestamp + 1" }),
        Field({ name: "MinTimestamp", id: 0x5, type: "epoch-s", conformance: "EndTimestamp" }),
        Field({
            name: "MaxTimestamp", id: 0x6, type: "epoch-s", conformance: "EndTimestamp",
            constraint: "min minTimestamp + 1"
        }),
        Field({ name: "StartSystime", id: 0x7, type: "systime-ms", conformance: "EndSystime" }),
        Field({ name: "EndSystime", id: 0x8, type: "systime-ms", conformance: "desc", constraint: "min startSystime + 1" }),
        Field({ name: "MinSystime", id: 0x9, type: "systime-ms", conformance: "EndSystime" }),
        Field({
            name: "MaxSystime", id: 0xa, type: "systime-ms", conformance: "EndSystime",
            constraint: "min minSystime + 1"
        })
    ),

    Datatype(
        { name: "HarmonicMeasurementStruct", type: "struct" },
        Field({ name: "Order", id: 0x0, type: "uint8", conformance: "M", constraint: "min 1" }),
        Field({ name: "Measurement", id: 0x1, type: "int64", conformance: "M", quality: "X" })
    )
);

MatterDefinition.children.push(ElectricalPowerMeasurement);
