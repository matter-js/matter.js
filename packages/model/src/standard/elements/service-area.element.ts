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

export const ServiceArea = Cluster(
    { name: "ServiceArea", id: 0x150 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "SELRUN", constraint: "0", title: "SelectWhileRunning" }),
        Field({ name: "PROG", constraint: "1", title: "ProgressReporting" }),
        Field({ name: "MAPS", constraint: "2", title: "Maps" })
    ),

    Attribute(
        { name: "SupportedAreas", id: 0x0, type: "list", access: "R V", conformance: "M", constraint: "max 255" },
        Field({ name: "entry", type: "AreaStruct" })
    ),
    Attribute(
        { name: "SupportedMaps", id: 0x1, type: "list", access: "R V", conformance: "MAPS", constraint: "max 255" },
        Field({ name: "entry", type: "MapStruct" })
    ),

    Attribute(
        {
            name: "SelectedAreas", id: 0x2, type: "list", access: "R V", conformance: "M", constraint: "desc",
            default: []
        },
        Field({ name: "entry", type: "uint32" })
    ),

    Attribute({
        name: "CurrentArea", id: 0x3, type: "uint32", access: "R V", conformance: "desc",
        constraint: "desc", default: null, quality: "X"
    }),
    Attribute({
        name: "EstimatedEndTime", id: 0x4, type: "epoch-s", access: "R V", conformance: "[CurrentArea]",
        default: null, quality: "X Q"
    }),

    Attribute(
        {
            name: "Progress", id: 0x5, type: "list", access: "R V", conformance: "PROG", constraint: "max 255",
            default: []
        },
        Field({ name: "entry", type: "ProgressStruct" })
    ),

    Command(
        {
            name: "SelectAreas", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "SelectAreasResponse"
        },
        Field(
            { name: "NewAreas", id: 0x0, type: "list", conformance: "M", constraint: "desc" },
            Field({ name: "entry", type: "uint32" })
        )
    ),

    Command(
        { name: "SelectAreasResponse", id: 0x1, access: "O", conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "SelectAreasStatus", conformance: "M" }),
        Field({ name: "StatusText", id: 0x1, type: "string", conformance: "M", constraint: "max 256" })
    ),

    Command(
        {
            name: "SkipArea", id: 0x2, access: "O", conformance: "[CurrentArea | Progress]",
            direction: "request", response: "SkipAreaResponse"
        },
        Field({ name: "SkippedArea", id: 0x0, type: "uint32", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "SkipAreaResponse", id: 0x3, access: "O", conformance: "SkipArea", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "SkipAreaStatus", conformance: "M" }),
        Field({ name: "StatusText", id: 0x1, type: "string", conformance: "M", constraint: "max 256" })
    ),
    Datatype(
        { name: "LandmarkInfoStruct", type: "struct" },
        Field({ name: "LandmarkTag", id: 0x0, type: "tag", conformance: "M" }),
        Field({ name: "RelativePositionTag", id: 0x1, type: "tag", conformance: "M", quality: "X" })
    ),
    Datatype(
        { name: "AreaInfoStruct", type: "struct" },
        Field({ name: "LocationInfo", id: 0x0, type: "locationdesc", conformance: "M", quality: "X" }),
        Field({ name: "LandmarkInfo", id: 0x1, type: "LandmarkInfoStruct", conformance: "M", quality: "X" })
    ),
    Datatype(
        { name: "MapStruct", type: "struct" },
        Field({ name: "MapId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "M", constraint: "max 64" })
    ),

    Datatype(
        { name: "AreaStruct", type: "struct" },
        Field({ name: "AreaId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "MapId", id: 0x1, type: "uint32", conformance: "M", constraint: "desc", quality: "X" }),
        Field({ name: "AreaInfo", id: 0x2, type: "AreaInfoStruct", conformance: "M" })
    ),

    Datatype(
        { name: "ProgressStruct", type: "struct" },
        Field({ name: "AreaId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "Status", id: 0x1, type: "OperationalStatusEnum", conformance: "M" }),
        Field({ name: "TotalOperationalTime", id: 0x2, type: "elapsed-s", conformance: "O", quality: "X" }),
        Field({ name: "EstimatedTime", id: 0x3, type: "elapsed-s", conformance: "O", quality: "X" })
    ),

    Datatype(
        { name: "OperationalStatusEnum", type: "enum8" },
        Field({ name: "Pending", id: 0x0, conformance: "M" }),
        Field({ name: "Operating", id: 0x1, conformance: "M" }),
        Field({ name: "Skipped", id: 0x2, conformance: "M" }),
        Field({ name: "Completed", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "SelectAreasStatus", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "UnsupportedArea", id: 0x1, conformance: "M" }),
        Field({ name: "InvalidInMode", id: 0x2, conformance: "M" }),
        Field({ name: "InvalidSet", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "SkipAreaStatus", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "InvalidAreaList", id: 0x1, conformance: "M" }),
        Field({ name: "InvalidInMode", id: 0x2, conformance: "M" }),
        Field({ name: "InvalidSkippedArea", id: 0x3, conformance: "M" })
    )
);

MatterDefinition.children.push(ServiceArea);
