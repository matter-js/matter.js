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

export const ThreadNetworkDiagnostics = Cluster(
    { name: "ThreadNetworkDiagnostics", id: 0x35, classification: "node", quality: "K" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PKTCNT", constraint: "0", title: "PacketCounts" }),
        Field({ name: "ERRCNT", constraint: "1", title: "ErrorCounts" }),
        Field({ name: "MLECNT", constraint: "2", title: "MleCounts" }),
        Field({ name: "MACCNT", constraint: "3", title: "MacCounts" })
    ),

    Attribute({ name: "Channel", id: 0x0, type: "uint16", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "RoutingRole", id: 0x1, type: "RoutingRoleEnum", access: "R V", conformance: "M", quality: "X" }),
    Attribute({
        name: "NetworkName", id: 0x2, type: "string", access: "R V", conformance: "M", constraint: "max 16",
        quality: "X"
    }),
    Attribute({ name: "PanId", id: 0x3, type: "uint16", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "ExtendedPanId", id: 0x4, type: "uint64", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "MeshLocalPrefix", id: 0x5, type: "ipv6pre", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "OverrunCount", id: 0x6, type: "uint64", access: "R V", conformance: "ERRCNT", default: 0, quality: "C" }),
    Attribute(
        { name: "NeighborTable", id: 0x7, type: "list", access: "R V", conformance: "M", default: [] },
        Field({ name: "entry", type: "NeighborTableStruct" })
    ),
    Attribute(
        { name: "RouteTable", id: 0x8, type: "list", access: "R V", conformance: "M", default: [] },
        Field({ name: "entry", type: "RouteTableStruct" })
    ),
    Attribute({ name: "PartitionId", id: 0x9, type: "uint32", access: "R V", conformance: "M", quality: "X" }),
    Attribute({
        name: "Weighting", id: 0xa, type: "uint16", access: "R V", conformance: "M", constraint: "max 255",
        quality: "X"
    }),
    Attribute({
        name: "DataVersion", id: 0xb, type: "uint16", access: "R V", conformance: "M",
        constraint: "max 255", quality: "X"
    }),
    Attribute({
        name: "StableDataVersion", id: 0xc, type: "uint16", access: "R V", conformance: "M",
        constraint: "max 255", quality: "X"
    }),
    Attribute({
        name: "LeaderRouterId", id: 0xd, type: "uint8", access: "R V", conformance: "M",
        constraint: "max 62", quality: "X"
    }),
    Attribute({
        name: "DetachedRoleCount", id: 0xe, type: "uint16", access: "R V", conformance: "[MLECNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "ChildRoleCount", id: 0xf, type: "uint16", access: "R V", conformance: "[MLECNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "RouterRoleCount", id: 0x10, type: "uint16", access: "R V", conformance: "[MLECNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "LeaderRoleCount", id: 0x11, type: "uint16", access: "R V", conformance: "[MLECNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "AttachAttemptCount", id: 0x12, type: "uint16", access: "R V", conformance: "[MLECNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "PartitionIdChangeCount", id: 0x13, type: "uint16", access: "R V", conformance: "[MLECNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "BetterPartitionAttachAttemptCount", id: 0x14, type: "uint16", access: "R V",
        conformance: "[MLECNT]", default: 0, quality: "C"
    }),
    Attribute({
        name: "ParentChangeCount", id: 0x15, type: "uint16", access: "R V", conformance: "[MLECNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "TxTotalCount", id: 0x16, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "TxUnicastCount", id: 0x17, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "TxBroadcastCount", id: 0x18, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "TxAckRequestedCount", id: 0x19, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "TxAckedCount", id: 0x1a, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "TxNoAckRequestedCount", id: 0x1b, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({ name: "TxDataCount", id: 0x1c, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0, quality: "C" }),
    Attribute({
        name: "TxDataPollCount", id: 0x1d, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "TxBeaconCount", id: 0x1e, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "TxBeaconRequestCount", id: 0x1f, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "TxOtherCount", id: 0x20, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "TxRetryCount", id: 0x21, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "TxDirectMaxRetryExpiryCount", id: 0x22, type: "uint32", access: "R V",
        conformance: "[MACCNT]", default: 0, quality: "C"
    }),
    Attribute({
        name: "TxIndirectMaxRetryExpiryCount", id: 0x23, type: "uint32", access: "R V",
        conformance: "[MACCNT]", default: 0, quality: "C"
    }),
    Attribute({
        name: "TxErrCcaCount", id: 0x24, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "TxErrAbortCount", id: 0x25, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "TxErrBusyChannelCount", id: 0x26, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxTotalCount", id: 0x27, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "RxUnicastCount", id: 0x28, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxBroadcastCount", id: 0x29, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({ name: "RxDataCount", id: 0x2a, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0, quality: "C" }),
    Attribute({
        name: "RxDataPollCount", id: 0x2b, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxBeaconCount", id: 0x2c, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "RxBeaconRequestCount", id: 0x2d, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxOtherCount", id: 0x2e, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "RxAddressFilteredCount", id: 0x2f, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxDestAddrFilteredCount", id: 0x30, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxDuplicatedCount", id: 0x31, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxErrNoFrameCount", id: 0x32, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxErrUnknownNeighborCount", id: 0x33, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxErrInvalidSrcAddrCount", id: 0x34, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({
        name: "RxErrSecCount", id: 0x35, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "RxErrFcsCount", id: 0x36, type: "uint32", access: "R V", conformance: "[MACCNT]", default: 0,
        quality: "C"
    }),
    Attribute({
        name: "RxErrOtherCount", id: 0x37, type: "uint32", access: "R V", conformance: "[MACCNT]",
        default: 0, quality: "C"
    }),
    Attribute({ name: "ActiveTimestamp", id: 0x38, type: "uint64", access: "R V", conformance: "O", default: 0, quality: "X" }),
    Attribute({ name: "PendingTimestamp", id: 0x39, type: "uint64", access: "R V", conformance: "O", default: 0, quality: "X" }),
    Attribute({ name: "Delay", id: 0x3a, type: "uint32", access: "R V", conformance: "O", default: 0, quality: "X" }),
    Attribute({ name: "SecurityPolicy", id: 0x3b, type: "SecurityPolicy", access: "R V", conformance: "M", quality: "X" }),
    Attribute({
        name: "ChannelPage0Mask", id: 0x3c, type: "octstr", access: "R V", conformance: "M",
        constraint: "4", quality: "X"
    }),
    Attribute({
        name: "OperationalDatasetComponents", id: 0x3d, type: "OperationalDatasetComponents", access: "R V",
        conformance: "M", quality: "X"
    }),

    Attribute(
        {
            name: "ActiveNetworkFaultsList", id: 0x3e, type: "list", access: "R V", conformance: "M",
            constraint: "max 4"
        },
        Field({ name: "entry", type: "NetworkFaultEnum" })
    ),

    Attribute({ name: "ExtAddress", id: 0x3f, type: "uint64", access: "R V", conformance: "P, M", quality: "X" }),
    Attribute({ name: "Rloc16", id: 0x40, type: "uint16", access: "R V", conformance: "P, M", quality: "X" }),
    Event(
        { name: "ConnectionStatus", id: 0x0, access: "V", conformance: "O", priority: "info" },
        Field({ name: "ConnectionStatus", id: 0x0, type: "ConnectionStatusEnum", conformance: "M" })
    ),

    Event(
        { name: "NetworkFaultChange", id: 0x1, access: "V", conformance: "O", priority: "info" },
        Field(
            { name: "Current", id: 0x0, type: "list", conformance: "M", constraint: "max 4" },
            Field({ name: "entry", type: "NetworkFaultEnum" })
        ),
        Field(
            { name: "Previous", id: 0x1, type: "list", conformance: "M", constraint: "max 4" },
            Field({ name: "entry", type: "NetworkFaultEnum" })
        )
    ),

    Command({ name: "ResetCounts", id: 0x0, access: "M", conformance: "ERRCNT", direction: "request", response: "status" }),

    Datatype(
        { name: "NetworkFaultEnum", type: "enum8" },
        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
        Field({ name: "LinkDown", id: 0x1, conformance: "M" }),
        Field({ name: "HardwareFailure", id: 0x2, conformance: "M" }),
        Field({ name: "NetworkJammed", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "ConnectionStatusEnum", type: "enum8" },
        Field({ name: "Connected", id: 0x0, conformance: "M" }),
        Field({ name: "NotConnected", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "RoutingRoleEnum", type: "enum8" },
        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
        Field({ name: "Unassigned", id: 0x1, conformance: "M" }),
        Field({ name: "SleepyEndDevice", id: 0x2, conformance: "M" }),
        Field({ name: "EndDevice", id: 0x3, conformance: "M" }),
        Field({ name: "Reed", id: 0x4, conformance: "M" }),
        Field({ name: "Router", id: 0x5, conformance: "M" }),
        Field({ name: "Leader", id: 0x6, conformance: "M" })
    ),

    Datatype(
        { name: "NeighborTableStruct", type: "struct" },
        Field({ name: "ExtAddress", id: 0x0, type: "uint64", conformance: "M" }),
        Field({ name: "Age", id: 0x1, type: "uint32", conformance: "M" }),
        Field({ name: "Rloc16", id: 0x2, type: "uint16", conformance: "M" }),
        Field({ name: "LinkFrameCounter", id: 0x3, type: "uint32", conformance: "M" }),
        Field({ name: "MleFrameCounter", id: 0x4, type: "uint32", conformance: "M" }),
        Field({ name: "Lqi", id: 0x5, type: "uint8", conformance: "M", constraint: "0 to 255" }),
        Field({
            name: "AverageRssi", id: 0x6, type: "int8", conformance: "M", constraint: "-128 to 0",
            default: null, quality: "X"
        }),
        Field({
            name: "LastRssi", id: 0x7, type: "int8", conformance: "M", constraint: "-128 to 0", default: null,
            quality: "X"
        }),
        Field({ name: "FrameErrorRate", id: 0x8, type: "uint8", conformance: "M", constraint: "0 to 100", default: 0 }),
        Field({ name: "MessageErrorRate", id: 0x9, type: "uint8", conformance: "M", constraint: "0 to 100", default: 0 }),
        Field({ name: "RxOnWhenIdle", id: 0xa, type: "bool", conformance: "M" }),
        Field({ name: "FullThreadDevice", id: 0xb, type: "bool", conformance: "M" }),
        Field({ name: "FullNetworkData", id: 0xc, type: "bool", conformance: "M" }),
        Field({ name: "IsChild", id: 0xd, type: "bool", conformance: "M" })
    ),

    Datatype(
        { name: "RouteTableStruct", type: "struct" },
        Field({ name: "ExtAddress", id: 0x0, type: "uint64", conformance: "M" }),
        Field({ name: "Rloc16", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "RouterId", id: 0x2, type: "uint8", conformance: "M" }),
        Field({ name: "NextHop", id: 0x3, type: "uint8", conformance: "M" }),
        Field({ name: "PathCost", id: 0x4, type: "uint8", conformance: "M" }),
        Field({ name: "LqiIn", id: 0x5, type: "uint8", conformance: "M" }),
        Field({ name: "LqiOut", id: 0x6, type: "uint8", conformance: "M" }),
        Field({ name: "Age", id: 0x7, type: "uint8", conformance: "M" }),
        Field({ name: "Allocated", id: 0x8, type: "bool", conformance: "M" }),
        Field({ name: "LinkEstablished", id: 0x9, type: "bool", conformance: "M" })
    ),

    Datatype(
        { name: "SecurityPolicy", type: "struct" },
        Field({ name: "RotationTime", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "Flags", id: 0x1, type: "uint16", conformance: "M" })
    ),

    Datatype(
        { name: "OperationalDatasetComponents", type: "struct" },
        Field({ name: "ActiveTimestampPresent", id: 0x0, type: "bool", conformance: "M" }),
        Field({ name: "PendingTimestampPresent", id: 0x1, type: "bool", conformance: "M" }),
        Field({ name: "MasterKeyPresent", id: 0x2, type: "bool", conformance: "M" }),
        Field({ name: "NetworkNamePresent", id: 0x3, type: "bool", conformance: "M" }),
        Field({ name: "ExtendedPanIdPresent", id: 0x4, type: "bool", conformance: "M" }),
        Field({ name: "MeshLocalPrefixPresent", id: 0x5, type: "bool", conformance: "M" }),
        Field({ name: "DelayPresent", id: 0x6, type: "bool", conformance: "M" }),
        Field({ name: "PanIdPresent", id: 0x7, type: "bool", conformance: "M" }),
        Field({ name: "ChannelPresent", id: 0x8, type: "bool", conformance: "M" }),
        Field({ name: "PskcPresent", id: 0x9, type: "bool", conformance: "M" }),
        Field({ name: "SecurityPolicyPresent", id: 0xa, type: "bool", conformance: "M" }),
        Field({ name: "ChannelMaskPresent", id: 0xb, type: "bool", conformance: "M" })
    )
);

MatterDefinition.children.push(ThreadNetworkDiagnostics);
