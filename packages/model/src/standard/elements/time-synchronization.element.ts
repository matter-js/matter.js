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
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const TimeSynchronization = Cluster(
    { name: "TimeSynchronization", id: 0x38 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "TZ", constraint: "0", title: "TimeZone" }),
        Field({ name: "NTPC", constraint: "1", title: "NtpClient" }),
        Field({ name: "NTPS", constraint: "2", title: "NtpServer" }),
        Field({ name: "TSC", constraint: "3", title: "TimeSyncClient" })
    ),

    Attribute(
        { name: "UtcTime", id: 0x0, type: "epoch-us", access: "R V", conformance: "M", default: null, quality: "X C" }
    ),
    Attribute({
        name: "Granularity", id: 0x1, type: "GranularityEnum", access: "R V", conformance: "M",
        constraint: "desc", default: 0
    }),
    Attribute({
        name: "TimeSource", id: 0x2, type: "TimeSourceEnum", access: "R V", conformance: "O",
        constraint: "desc", default: 0
    }),
    Attribute({
        name: "TrustedTimeSource", id: 0x3, type: "TrustedTimeSourceStruct", access: "R V",
        conformance: "TSC", default: null, quality: "X N"
    }),
    Attribute({
        name: "DefaultNtp", id: 0x4, type: "string", access: "R V", conformance: "NTPC",
        constraint: "max 128", default: null, quality: "X N"
    }),

    Attribute(
        {
            name: "TimeZone", id: 0x5, type: "list", access: "R V", conformance: "TZ", constraint: "1 to 2",
            default: [ { type: "properties", properties: { offset: 0, validAt: 0 } } ], quality: "N"
        },
        Field({ name: "entry", type: "TimeZoneStruct" })
    ),

    Attribute(
        { name: "DstOffset", id: 0x6, type: "list", access: "R V", conformance: "TZ", default: [], quality: "N" },
        Field({ name: "entry", type: "DSTOffsetStruct" })
    ),
    Attribute({ name: "LocalTime", id: 0x7, type: "epoch-us", access: "R V", conformance: "TZ", default: null, quality: "X C" }),
    Attribute({
        name: "TimeZoneDatabase", id: 0x8, type: "TimeZoneDatabaseEnum", access: "R V", conformance: "TZ",
        default: 2, quality: "F"
    }),
    Attribute({ name: "NtpServerAvailable", id: 0x9, type: "bool", access: "R V", conformance: "NTPS", default: false }),
    Attribute({
        name: "TimeZoneListMaxSize", id: 0xa, type: "uint8", access: "R V", conformance: "TZ",
        constraint: "1 to 2", quality: "F"
    }),
    Attribute({
        name: "DstOffsetListMaxSize", id: 0xb, type: "uint8", access: "R V", conformance: "TZ",
        constraint: "min 1", quality: "F"
    }),
    Attribute({
        name: "SupportsDnsResolve", id: 0xc, type: "bool", access: "R V", conformance: "NTPC",
        default: false, quality: "F"
    }),
    Event({ name: "DstTableEmpty", id: 0x0, access: "V", conformance: "TZ", priority: "info" }),
    Event(
        { name: "DstStatus", id: 0x1, access: "V", conformance: "TZ", priority: "info" },
        Field({ name: "DstOffsetActive", id: 0x0, type: "bool", conformance: "M" })
    ),
    Event(
        { name: "TimeZoneStatus", id: 0x2, access: "V", conformance: "TZ", priority: "info" },
        Field({ name: "Offset", id: 0x0, type: "int32", conformance: "M", constraint: "-43200 to 50400" }),
        Field({ name: "Name", id: 0x1, type: "string", conformance: "O", constraint: "0 to 64" })
    ),
    Event({ name: "TimeFailure", id: 0x3, access: "V", conformance: "M", priority: "info" }),
    Event({ name: "MissingTrustedTimeSource", id: 0x4, access: "V", conformance: "TSC", priority: "info" }),

    Command(
        { name: "SetUtcTime", id: 0x0, access: "A", conformance: "M", direction: "request", response: "status" },
        Field({ name: "UtcTime", id: 0x0, type: "epoch-us", conformance: "M", default: 0 }),
        Field({ name: "Granularity", id: 0x1, type: "GranularityEnum", conformance: "M", default: 0 }),
        Field({ name: "TimeSource", id: 0x2, type: "TimeSourceEnum", conformance: "O", default: 0 })
    ),

    Command(
        {
            name: "SetTrustedTimeSource", id: 0x1, access: "F A", conformance: "TSC", direction: "request",
            response: "status"
        },
        Field({
            name: "TrustedTimeSource", id: 0x0, type: "FabricScopedTrustedTimeSourceStruct", access: "F",
            conformance: "M", quality: "X"
        }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Command(
        {
            name: "SetTimeZone", id: 0x2, access: "M", conformance: "TZ", direction: "request",
            response: "SetTimeZoneResponse"
        },
        Field(
            { name: "TimeZone", id: 0x0, type: "list", conformance: "M", constraint: "1 to 2" },
            Field({ name: "entry", type: "TimeZoneStruct" })
        )
    ),

    Command(
        { name: "SetTimeZoneResponse", id: 0x3, conformance: "TZ", direction: "response" },
        Field({ name: "DstOffsetRequired", id: 0x0, type: "bool", conformance: "M", default: true })
    ),

    Command(
        { name: "SetDstOffset", id: 0x4, access: "M", conformance: "TZ", direction: "request", response: "status" },
        Field(
            { name: "DstOffset", id: 0x0, type: "list", conformance: "M" },
            Field({ name: "entry", type: "DSTOffsetStruct" })
        )
    ),

    Command(
        { name: "SetDefaultNtp", id: 0x5, access: "A", conformance: "NTPC", direction: "request", response: "status" },
        Field({ name: "DefaultNtp", id: 0x0, type: "string", conformance: "M", constraint: "max 128", quality: "X" })
    ),

    Datatype(
        { name: "GranularityEnum", type: "enum8" },
        Field({ name: "NoTimeGranularity", id: 0x0, conformance: "M" }),
        Field({ name: "MinutesGranularity", id: 0x1, conformance: "M" }),
        Field({ name: "SecondsGranularity", id: 0x2, conformance: "M" }),
        Field({ name: "MillisecondsGranularity", id: 0x3, conformance: "M" }),
        Field({ name: "MicrosecondsGranularity", id: 0x4, conformance: "M" })
    ),

    Datatype(
        { name: "TimeSourceEnum", type: "enum8" },
        Field({ name: "None", id: 0x0, conformance: "M" }),
        Field({ name: "Unknown", id: 0x1, conformance: "M" }),
        Field({ name: "Admin", id: 0x2, conformance: "M" }),
        Field({ name: "NodeTimeCluster", id: 0x3, conformance: "M" }),
        Field({ name: "NonMatterSntp", id: 0x4, conformance: "M" }),
        Field({ name: "NonMatterNtp", id: 0x5, conformance: "M" }),
        Field({ name: "MatterSntp", id: 0x6, conformance: "M" }),
        Field({ name: "MatterNtp", id: 0x7, conformance: "M" }),
        Field({ name: "MixedNtp", id: 0x8, conformance: "M" }),
        Field({ name: "NonMatterSntpnts", id: 0x9, conformance: "M" }),
        Field({ name: "NonMatterNtpnts", id: 0xa, conformance: "M" }),
        Field({ name: "MatterSntpnts", id: 0xb, conformance: "M" }),
        Field({ name: "MatterNtpnts", id: 0xc, conformance: "M" }),
        Field({ name: "MixedNtpnts", id: 0xd, conformance: "M" }),
        Field({ name: "CloudSource", id: 0xe, conformance: "M" }),
        Field({ name: "Ptp", id: 0xf, conformance: "M" }),
        Field({ name: "Gnss", id: 0x10, conformance: "M" })
    ),

    Datatype(
        { name: "TimeZoneDatabaseEnum", type: "enum8" },
        Field({ name: "Full", id: 0x0, conformance: "M" }),
        Field({ name: "Partial", id: 0x1, conformance: "M" }),
        Field({ name: "None", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "TrustedTimeSourceStruct", type: "struct" },
        Field({ name: "FabricIndex", id: 0x0, type: "fabric-idx", conformance: "M" }),
        Field({ name: "NodeId", id: 0x1, type: "node-id", conformance: "M" }),
        Field({ name: "Endpoint", id: 0x2, type: "endpoint-no", conformance: "M" })
    ),

    Datatype(
        { name: "FabricScopedTrustedTimeSourceStruct", type: "struct" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "Endpoint", id: 0x1, type: "endpoint-no", conformance: "M" })
    ),

    Datatype(
        { name: "TimeZoneStruct", type: "struct" },
        Field({ name: "Offset", id: 0x0, type: "int32", conformance: "M", constraint: "-43200 to 50400" }),
        Field({ name: "ValidAt", id: 0x1, type: "epoch-us", conformance: "M" }),
        Field({ name: "Name", id: 0x2, type: "string", conformance: "O", constraint: "0 to 64" })
    ),

    Datatype(
        { name: "DSTOffsetStruct", type: "struct" },
        Field({ name: "Offset", id: 0x0, type: "int32", conformance: "M", constraint: "desc" }),
        Field({ name: "ValidStarting", id: 0x1, type: "epoch-us", conformance: "M" }),
        Field({ name: "ValidUntil", id: 0x2, type: "epoch-us", conformance: "M", quality: "X" })
    ),

    Datatype({ name: "StatusCodeEnum", type: "enum8" }, Field({ name: "TimeNotAccepted", id: 0x2, conformance: "M" }))
);

MatterDefinition.children.push(TimeSynchronization);
