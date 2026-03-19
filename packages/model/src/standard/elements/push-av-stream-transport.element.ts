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

export const PushAvStreamTransport = Cluster(
    { name: "PushAvStreamTransport", id: 0x555, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PERZONESENS", conformance: "O", constraint: "0", title: "PerZoneSensitivity" }),
        Field({ name: "METADATA", conformance: "P, O", constraint: "1", title: "Metadata" })
    ),

    Attribute(
        {
            name: "SupportedFormats", id: 0x0, type: "list", access: "R V", conformance: "M",
            constraint: "min 1", quality: "F"
        },
        Field({ name: "entry", type: "SupportedFormatStruct" })
    ),

    Attribute(
        {
            name: "CurrentConnections", id: 0x1, type: "list", access: "R S V", conformance: "M",
            constraint: "desc", quality: "N"
        },
        Field({ name: "entry", type: "TransportConfigurationStruct" })
    ),

    Event(
        { name: "PushTransportBegin", id: 0x0, access: "V", conformance: "M", priority: "info" },
        Field({
            name: "ConnectionId", id: 0x0, type: "PushTransportConnectionID", conformance: "M",
            constraint: "0 to 65534"
        }),
        Field({ name: "TriggerType", id: 0x1, type: "TransportTriggerTypeEnum", conformance: "M" }),
        Field({
            name: "ActivationReason", id: 0x2, type: "TriggerActivationReasonEnum",
            conformance: "TriggerType == Command"
        })
    ),

    Event(
        { name: "PushTransportEnd", id: 0x1, access: "V", conformance: "M", priority: "info" },
        Field({
            name: "ConnectionId", id: 0x0, type: "PushTransportConnectionID", conformance: "M",
            constraint: "0 to 65534"
        })
    ),

    Command(
        {
            name: "AllocatePushTransport", id: 0x0, access: "F M", conformance: "M", direction: "request",
            quality: "L", response: "AllocatePushTransportResponse"
        },
        Field({ name: "TransportOptions", id: 0x0, type: "TransportOptionsStruct", conformance: "M" })
    ),

    Command(
        { name: "AllocatePushTransportResponse", id: 0x1, conformance: "M", direction: "response", quality: "L" },
        Field({ name: "TransportConfiguration", id: 0x0, type: "TransportConfigurationStruct", conformance: "M" })
    ),

    Command(
        {
            name: "DeallocatePushTransport", id: 0x2, access: "F M", conformance: "M", direction: "request",
            response: "status"
        },
        Field({
            name: "ConnectionId", id: 0x0, type: "PushTransportConnectionID", conformance: "M",
            constraint: "0 to 65534"
        })
    ),

    Command(
        {
            name: "ModifyPushTransport", id: 0x3, access: "F M", conformance: "M", direction: "request",
            response: "status"
        },
        Field({
            name: "ConnectionId", id: 0x0, type: "PushTransportConnectionID", conformance: "M",
            constraint: "0 to 65534"
        }),
        Field({ name: "TransportOptions", id: 0x1, type: "TransportOptionsStruct", conformance: "M" })
    ),

    Command(
        {
            name: "SetTransportStatus", id: 0x4, access: "F M", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "ConnectionId", id: 0x0, type: "PushTransportConnectionID", conformance: "M", quality: "X" }),
        Field({ name: "TransportStatus", id: 0x1, type: "TransportStatusEnum", conformance: "M" })
    ),

    Command(
        {
            name: "ManuallyTriggerTransport", id: 0x5, access: "F O", conformance: "M", direction: "request",
            response: "status"
        },
        Field({
            name: "ConnectionId", id: 0x0, type: "PushTransportConnectionID", conformance: "M",
            constraint: "0 to 65534"
        }),
        Field({ name: "ActivationReason", id: 0x1, type: "TriggerActivationReasonEnum", conformance: "M" }),
        Field({ name: "TimeControl", id: 0x2, type: "TransportMotionTriggerTimeControlStruct", conformance: "O" }),
        Field({ name: "UserDefined", id: 0x3, type: "octstr", conformance: "[METADATA]", constraint: "max 256" })
    ),

    Command(
        {
            name: "FindTransport", id: 0x6, access: "F O", conformance: "M", direction: "request", quality: "L",
            response: "FindTransportResponse"
        },
        Field({ name: "ConnectionId", id: 0x0, type: "PushTransportConnectionID", conformance: "M", quality: "X" })
    ),

    Command(
        { name: "FindTransportResponse", id: 0x7, conformance: "M", direction: "response", quality: "L" },
        Field(
            { name: "TransportConfigurations", id: 0x0, type: "list", conformance: "M" },
            Field({ name: "entry", type: "TransportConfigurationStruct" })
        )
    ),

    Datatype(
        { name: "TransportTriggerTypeEnum", type: "enum8" },
        Field({ name: "Command", id: 0x0, conformance: "M" }),
        Field({ name: "Motion", id: 0x1, conformance: "M" }),
        Field({ name: "Continuous", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "TransportStatusEnum", type: "enum8" },
        Field({ name: "Active", id: 0x0, conformance: "M" }),
        Field({ name: "Inactive", id: 0x1, conformance: "M" })
    ),
    Datatype({ name: "ContainerFormatEnum", type: "enum8" }, Field({ name: "Cmaf", id: 0x0, conformance: "M" })),
    Datatype({ name: "IngestMethodsEnum", type: "enum8" }, Field({ name: "CmafIngest", id: 0x0, conformance: "M" })),

    Datatype(
        { name: "TriggerActivationReasonEnum", type: "enum8" },
        Field({ name: "UserInitiated", id: 0x0, conformance: "M" }),
        Field({ name: "Automation", id: 0x1, conformance: "M" }),
        Field({ name: "Emergency", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "SupportedFormatStruct", type: "struct" },
        Field({ name: "ContainerFormat", id: 0x0, type: "ContainerFormatEnum", conformance: "M" }),
        Field({ name: "IngestMethod", id: 0x1, type: "IngestMethodsEnum", conformance: "M" })
    ),

    Datatype(
        { name: "CMAFInterfaceEnum", type: "enum8" },
        Field({ name: "Interface1", id: 0x0, conformance: "M" }),
        Field({ name: "Interface2Dash", id: 0x1, conformance: "P, M" }),
        Field({ name: "Interface2Hls", id: 0x2, conformance: "P, M" })
    ),

    Datatype(
        { name: "CMAFContainerOptionsStruct", type: "struct" },
        Field({ name: "CmafInterface", id: 0x0, type: "CMAFInterfaceEnum", conformance: "M" }),
        Field({ name: "SegmentDuration", id: 0x1, type: "uint16", conformance: "M", constraint: "500 to 65500" }),
        Field({ name: "ChunkDuration", id: 0x2, type: "uint16", conformance: "M", constraint: "0 to segmentDuration / 2" }),
        Field({ name: "SessionGroup", id: 0x3, type: "uint8", conformance: "M" }),
        Field({ name: "TrackName", id: 0x4, type: "string", conformance: "M", constraint: "1 to 16" }),
        Field({ name: "CencKey", id: 0x5, type: "octstr", conformance: "P, O", constraint: "16" }),
        Field({ name: "CencKeyId", id: 0x6, type: "octstr", conformance: "P, CENCKey", constraint: "16" }),
        Field({ name: "MetadataEnabled", id: 0x7, type: "bool", conformance: "[METADATA]" })
    ),

    Datatype(
        { name: "ContainerOptionsStruct", type: "struct" },
        Field({ name: "ContainerType", id: 0x0, type: "ContainerFormatEnum", conformance: "M" }),
        Field({
            name: "CmafContainerOptions", id: 0x1, type: "CMAFContainerOptionsStruct",
            conformance: "ContainerType == CMAF"
        })
    ),

    Datatype(
        { name: "TransportZoneOptionsStruct", type: "struct" },
        Field({ name: "Zone", id: 0x0, type: "ZoneManagement.ZoneID", conformance: "M", quality: "X" }),
        Field({ name: "Sensitivity", id: 0x1, type: "uint8", conformance: "PERZONESENS", constraint: "1 to 10" })
    ),

    Datatype(
        { name: "TransportTriggerOptionsStruct", type: "struct" },
        Field({ name: "TriggerType", id: 0x0, type: "TransportTriggerTypeEnum", conformance: "M" }),
        Field(
            { name: "MotionZones", id: 0x1, type: "list", conformance: "TriggerType == Motion", quality: "X" },
            Field({ name: "entry", type: "TransportZoneOptionsStruct" })
        ),
        Field({
            name: "MotionSensitivity", id: 0x2, type: "uint8",
            conformance: "TriggerType == Motion & !PERZONESENS", constraint: "1 to 10", quality: "X"
        }),
        Field({
            name: "MotionTimeControl", id: 0x3, type: "TransportMotionTriggerTimeControlStruct",
            conformance: "TriggerType == Motion"
        }),
        Field({
            name: "MaxPreRollLen", id: 0x4, type: "uint16",
            conformance: "TriggerType == Command | TriggerType == Motion"
        })
    ),

    Datatype(
        { name: "TransportMotionTriggerTimeControlStruct", type: "struct" },
        Field({ name: "InitialDuration", id: 0x0, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "AugmentationDuration", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "MaxDuration", id: 0x2, type: "elapsed-s", conformance: "M", constraint: "min 1" }),
        Field({ name: "BlindDuration", id: 0x3, type: "uint16", conformance: "M" })
    ),

    Datatype(
        { name: "TransportOptionsStruct", type: "struct" },
        Field({ name: "StreamUsage", id: 0x0, type: "StreamUsageEnum", conformance: "M" }),
        Field({
            name: "VideoStreamId", id: 0x1, type: "CameraAvStreamManagement.VideoStreamID", conformance: "O.a+",
            quality: "X"
        }),
        Field({
            name: "AudioStreamId", id: 0x2, type: "CameraAvStreamManagement.AudioStreamID", conformance: "O.a+",
            quality: "X"
        }),
        Field({
            name: "TlsEndpointId", id: 0x3, type: "TlsClientManagement.TLSEndpointID", conformance: "M",
            constraint: "0 to 65534"
        }),
        Field({ name: "Url", id: 0x4, type: "string", conformance: "M", constraint: "13 to 2000" }),
        Field({ name: "TriggerOptions", id: 0x5, type: "TransportTriggerOptionsStruct", conformance: "M" }),
        Field({ name: "IngestMethod", id: 0x6, type: "IngestMethodsEnum", conformance: "M" }),
        Field({ name: "ContainerOptions", id: 0x7, type: "ContainerOptionsStruct", conformance: "M" }),
        Field({ name: "ExpiryTime", id: 0x8, type: "epoch-s", conformance: "O" })
    ),

    Datatype(
        { name: "TransportConfigurationStruct", type: "struct" },
        Field({
            name: "ConnectionId", id: 0x0, type: "PushTransportConnectionID", access: "F", conformance: "M",
            constraint: "0 to 65534"
        }),
        Field({ name: "TransportStatus", id: 0x1, type: "TransportStatusEnum", access: "F", conformance: "M" }),
        Field({ name: "TransportOptions", id: 0x2, type: "TransportOptionsStruct", access: "F", conformance: "O" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype({ name: "PushTransportConnectionID", type: "uint16" }),

    Datatype(
        { name: "StatusCodeEnum", type: "enum8" },
        Field({ name: "InvalidTlsEndpoint", id: 0x2, conformance: "M" }),
        Field({ name: "InvalidStream", id: 0x3, conformance: "M" }),
        Field({ name: "InvalidUrl", id: 0x4, conformance: "M" }),
        Field({ name: "InvalidZone", id: 0x5, conformance: "M" }),
        Field({ name: "InvalidCombination", id: 0x6, conformance: "M" }),
        Field({ name: "InvalidTriggerType", id: 0x7, conformance: "M" }),
        Field({ name: "InvalidTransportStatus", id: 0x8, conformance: "M" }),
        Field({ name: "InvalidOptions", id: 0x9, conformance: "M" }),
        Field({ name: "InvalidStreamUsage", id: 0xa, conformance: "M" }),
        Field({ name: "InvalidTime", id: 0xb, conformance: "M" })
    )
);

MatterDefinition.children.push(PushAvStreamTransport);
