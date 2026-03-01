/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Matter 1.6 Groupcast Cluster (0x0065) — provisional
// Spec: src/service_device_management/Groupcast.adoc
// Replaces the legacy Groups cluster; consolidates group membership, addressing,
// key management, and ACL permissions into one cluster.

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "Groupcast",
    id: 0x65,
    classification: "node",
    pics: "GC",

    children: [
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", type: "ClusterRevision", default: 1 },

        // Features
        {
            tag: "attribute",
            id: 0xfffc,
            name: "FeatureMap",
            type: "FeatureMap",
            children: [
                {
                    tag: "field",
                    name: "LN",
                    constraint: "0",
                    conformance: "O.a+",
                    title: "Listener",
                    details: "Supports joining a multicast group of nodes as a listener.",
                },
                {
                    tag: "field",
                    name: "SD",
                    constraint: "1",
                    conformance: "O.a+",
                    title: "Sender",
                    details: "Supports sending multicast message to a targeted group of nodes.",
                },
                {
                    tag: "field",
                    name: "PGA",
                    constraint: "2",
                    conformance: "O",
                    title: "PerGroup",
                    details: "Supports PerGroup multicast addresses.",
                },
            ],
        },

        // Enums

        {
            tag: "datatype",
            name: "MulticastAddrPolicyEnum",
            type: "enum8",
            children: [
                {
                    tag: "field",
                    id: 0x0,
                    name: "IanaAddr",
                    conformance: "M",
                    details: "Group uses the IANA-assigned multicast address FF05::FA (default).",
                },
                {
                    tag: "field",
                    id: 0x1,
                    name: "PerGroup",
                    conformance: "PGA",
                    details: "Group uses multicast address scoped to Fabric ID and Group ID.",
                },
            ],
        },

        {
            tag: "datatype",
            name: "GroupcastTestingEnum",
            type: "enum8",
            children: [
                { tag: "field", id: 0x0, name: "DisableTesting", conformance: "M" },
                { tag: "field", id: 0x1, name: "EnableListenerTesting", conformance: "LN" },
                { tag: "field", id: 0x2, name: "EnableSenderTesting", conformance: "SD" },
            ],
        },

        {
            tag: "datatype",
            name: "GroupcastTestResultEnum",
            type: "enum8",
            children: [
                { tag: "field", id: 0x0, name: "Success", conformance: "M" },
                { tag: "field", id: 0x1, name: "GeneralError", conformance: "M" },
                { tag: "field", id: 0x2, name: "MessageReplay", conformance: "M" },
                { tag: "field", id: 0x3, name: "FailedAuth", conformance: "M" },
                { tag: "field", id: 0x4, name: "NoAvailableKey", conformance: "M" },
                { tag: "field", id: 0x5, name: "SendFailure", conformance: "M" },
            ],
        },

        // Fabric-Scoped membership struct
        {
            tag: "datatype",
            name: "MembershipStruct",
            type: "struct",
            children: [
                { tag: "field", id: 0x0, name: "GroupId", type: "group-id", access: "F", conformance: "M", constraint: "min 1" },
                {
                    tag: "field",
                    id: 0x1,
                    name: "Endpoints",
                    type: "list",
                    access: "F",
                    conformance: "LN",
                    constraint: "max 255",
                    children: [{ tag: "field", name: "entry", type: "endpoint-no" }],
                },
                { tag: "field", id: 0x2, name: "KeySetId", type: "uint16", access: "S", conformance: "M" },
                { tag: "field", id: 0x3, name: "HasAuxiliaryAcl", type: "bool", access: "F", conformance: "LN" },
                {
                    tag: "field",
                    id: 0x4,
                    name: "McastAddrPolicy",
                    type: "MulticastAddrPolicyEnum",
                    access: "F",
                    conformance: "M",
                    default: 0,
                },
                { tag: "field", id: 0xfe, name: "FabricIndex", type: "FabricIndex" },
            ],
        },

        // Attributes

        {
            tag: "attribute",
            id: 0x0000,
            name: "Membership",
            type: "list",
            access: "R V F",
            conformance: "P, M",
            constraint: "desc",
            quality: "N",
            children: [{ tag: "field", name: "entry", type: "MembershipStruct" }],
        },
        {
            tag: "attribute",
            id: 0x0001,
            name: "MaxMembershipCount",
            type: "uint16",
            access: "R V",
            conformance: "P, M",
            constraint: "min 10",
            quality: "F",
        },
        {
            tag: "attribute",
            id: 0x0002,
            name: "MaxMcastAddrCount",
            type: "uint16",
            access: "R V",
            conformance: "P, M",
            constraint: "min 1",
            quality: "F",
        },
        {
            tag: "attribute",
            id: 0x0003,
            name: "UsedMcastAddrCount",
            type: "uint16",
            access: "R V",
            conformance: "P, M",
            quality: "F",
        },
        {
            tag: "attribute",
            id: 0x0004,
            name: "FabricUnderTest",
            type: "fabric-idx",
            access: "R V",
            conformance: "P, M",
            default: 0,
        },

        // Commands

        {
            tag: "command",
            id: 0x00,
            name: "JoinGroup",
            access: "M F",
            conformance: "P, M",
            direction: "request",
            response: "status",
            children: [
                { tag: "field", id: 0x0, name: "GroupId", type: "group-id", conformance: "M", constraint: "min 1" },
                {
                    tag: "field",
                    id: 0x1,
                    name: "Endpoints",
                    type: "list",
                    conformance: "M",
                    constraint: "desc",
                    children: [{ tag: "field", name: "entry", type: "endpoint-no" }],
                },
                { tag: "field", id: 0x2, name: "KeySetId", type: "uint16", conformance: "M" },
                { tag: "field", id: 0x3, name: "Key", type: "octstr", conformance: "O", constraint: "16" },
                { tag: "field", id: 0x4, name: "UseAuxiliaryAcl", type: "bool", conformance: "[LN]" },
                { tag: "field", id: 0x5, name: "ReplaceEndpoints", type: "bool", conformance: "[LN]" },
                {
                    tag: "field",
                    id: 0x6,
                    name: "McastAddrPolicy",
                    type: "MulticastAddrPolicyEnum",
                    conformance: "O",
                },
            ],
        },

        {
            tag: "command",
            id: 0x01,
            name: "LeaveGroup",
            access: "M F",
            conformance: "P, M",
            direction: "request",
            response: "LeaveGroupResponse",
            children: [
                { tag: "field", id: 0x0, name: "GroupId", type: "group-id", conformance: "M" },
                {
                    tag: "field",
                    id: 0x1,
                    name: "Endpoints",
                    type: "list",
                    conformance: "O",
                    constraint: "1 to 20",
                    children: [{ tag: "field", name: "entry", type: "endpoint-no" }],
                },
            ],
        },

        {
            tag: "command",
            id: 0x02,
            name: "LeaveGroupResponse",
            conformance: "P, M",
            direction: "response",
            children: [
                { tag: "field", id: 0x0, name: "GroupId", type: "group-id", conformance: "M" },
                {
                    tag: "field",
                    id: 0x1,
                    name: "Endpoints",
                    type: "list",
                    conformance: "M",
                    constraint: "max 20",
                    children: [{ tag: "field", name: "entry", type: "endpoint-no" }],
                },
            ],
        },

        {
            tag: "command",
            id: 0x03,
            name: "UpdateGroupKey",
            access: "M F",
            conformance: "P, M",
            direction: "request",
            response: "status",
            children: [
                { tag: "field", id: 0x0, name: "GroupId", type: "group-id", conformance: "M", constraint: "min 1" },
                { tag: "field", id: 0x1, name: "KeySetId", type: "uint16", conformance: "M" },
                { tag: "field", id: 0x2, name: "Key", type: "octstr", conformance: "O", constraint: "16" },
            ],
        },

        {
            tag: "command",
            id: 0x04,
            name: "ConfigureAuxiliaryAcl",
            access: "A F",
            conformance: "P, LN",
            direction: "request",
            response: "status",
            children: [
                { tag: "field", id: 0x0, name: "GroupId", type: "group-id", conformance: "M" },
                { tag: "field", id: 0x1, name: "UseAuxiliaryAcl", type: "bool", conformance: "M" },
            ],
        },

        {
            tag: "command",
            id: 0x05,
            name: "GroupcastTesting",
            access: "A F",
            conformance: "P, M",
            direction: "request",
            response: "status",
            children: [
                {
                    tag: "field",
                    id: 0x0,
                    name: "TestOperation",
                    type: "GroupcastTestingEnum",
                    conformance: "M",
                },
                {
                    tag: "field",
                    id: 0x1,
                    name: "DurationSeconds",
                    type: "uint16",
                    conformance: "O",
                    constraint: "10 to 1200",
                    default: 60,
                },
            ],
        },

        // Event

        {
            tag: "event",
            id: 0x00,
            name: "GroupcastTesting",
            access: "S A",
            conformance: "P, M",
            priority: "info",
            children: [
                { tag: "field", id: 0x00, name: "SourceIpAddress", type: "ipv6adr", access: "S", conformance: "O" },
                {
                    tag: "field",
                    id: 0x01,
                    name: "DestinationIpAddress",
                    type: "ipv6adr",
                    access: "S",
                    conformance: "O",
                },
                { tag: "field", id: 0x02, name: "GroupId", type: "group-id", access: "S", conformance: "O" },
                { tag: "field", id: 0x03, name: "EndpointId", type: "endpoint-no", access: "S", conformance: "O" },
                { tag: "field", id: 0x04, name: "ClusterId", type: "cluster-id", access: "S", conformance: "O" },
                { tag: "field", id: 0x05, name: "ElementId", type: "uint32", access: "S", conformance: "O" },
                { tag: "field", id: 0x06, name: "AccessAllowed", type: "bool", access: "S", conformance: "O" },
                {
                    tag: "field",
                    id: 0x07,
                    name: "GroupcastTestResult",
                    type: "GroupcastTestResultEnum",
                    access: "S",
                    conformance: "M",
                },
                { tag: "field", id: 0xfe, name: "FabricIndex", type: "FabricIndex" },
            ],
        },
    ],
});
