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

export const TimeFormatLocalization = Cluster(
    { name: "TimeFormatLocalization", id: 0x2c, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "CALFMT", constraint: "0", title: "CalendarFormat" })
    ),
    Attribute({ name: "HourFormat", id: 0x0, type: "HourFormatEnum", access: "RW VM", conformance: "M", quality: "N" }),
    Attribute({
        name: "ActiveCalendarType", id: 0x1, type: "CalendarTypeEnum", access: "RW VM",
        conformance: "CALFMT", constraint: "in SupportedCalendarTypes", quality: "N"
    }),

    Attribute(
        {
            name: "SupportedCalendarTypes", id: 0x2, type: "list", access: "R V", conformance: "CALFMT",
            constraint: "desc", quality: "F"
        },
        Field({ name: "entry", type: "CalendarTypeEnum" })
    ),

    Datatype(
        { name: "HourFormatEnum", type: "enum8" },
        Field({ name: "12Hr", id: 0x0, conformance: "M" }),
        Field({ name: "24Hr", id: 0x1, conformance: "M" }),
        Field({ name: "UseActiveLocale", id: 0xff, conformance: "M" })
    ),

    Datatype(
        { name: "CalendarTypeEnum", type: "enum8" },
        Field({ name: "Buddhist", id: 0x0, conformance: "O.a+" }),
        Field({ name: "Chinese", id: 0x1, conformance: "O.a+" }),
        Field({ name: "Coptic", id: 0x2, conformance: "O.a+" }),
        Field({ name: "Ethiopian", id: 0x3, conformance: "O.a+" }),
        Field({ name: "Gregorian", id: 0x4, conformance: "O.a+" }),
        Field({ name: "Hebrew", id: 0x5, conformance: "O.a+" }),
        Field({ name: "Indian", id: 0x6, conformance: "O.a+" }),
        Field({ name: "Islamic", id: 0x7, conformance: "O.a+" }),
        Field({ name: "Japanese", id: 0x8, conformance: "O.a+" }),
        Field({ name: "Korean", id: 0x9, conformance: "O.a+" }),
        Field({ name: "Persian", id: 0xa, conformance: "O.a+" }),
        Field({ name: "Taiwanese", id: 0xb, conformance: "O.a+" }),
        Field({ name: "UseActiveLocale", id: 0xff, conformance: "O.a+" })
    )
);

MatterDefinition.children.push(TimeFormatLocalization);
