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
    DatatypeElement as Datatype,
    CommandElement as Command,
    EventElement as Event
} from "../../elements/index.js";

export const Groupcast = Cluster(
    { name: "Groupcast", id: 0x65, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "LN", conformance: "O.a+", constraint: "0", title: "Listener" }),
        Field({ name: "SD", conformance: "O.a+", constraint: "1", title: "Sender" }),
        Field({ name: "PGA", conformance: "O", constraint: "2", title: "PerGroup" })
    ),

    Attribute(
        {
            name: "Membership", id: 0x0, type: "list", access: "R F V", conformance: "P, M", constraint: "desc",
            quality: "N"
        },
        Field({ name: "entry", type: "MembershipStruct" })
    ),

    Attribute({
        name: "MaxMembershipCount", id: 0x1, type: "uint16", access: "R V", conformance: "P, M",
        constraint: "min 10", quality: "F"
    }),
    Attribute({
        name: "MaxMcastAddrCount", id: 0x2, type: "uint16", access: "R V", conformance: "P, M",
        constraint: "min 1", quality: "F"
    }),
    Attribute({ name: "UsedMcastAddrCount", id: 0x3, type: "uint16", access: "R V", conformance: "P, M", quality: "F" }),
    Attribute({ name: "FabricUnderTest", id: 0x4, type: "fabric-idx", access: "R V", conformance: "P, M", default: 0 }),
    Datatype(
        { name: "MulticastAddrPolicyEnum", type: "enum8" },
        Field({ name: "IanaAddr", id: 0x0, conformance: "M" }),
        Field({ name: "PerGroup", id: 0x1, conformance: "PGA" })
    ),

    Datatype(
        { name: "GroupcastTestingEnum", type: "enum8" },
        Field({ name: "DisableTesting", id: 0x0, conformance: "M" }),
        Field({ name: "EnableListenerTesting", id: 0x1, conformance: "LN" }),
        Field({ name: "EnableSenderTesting", id: 0x2, conformance: "SD" })
    ),

    Datatype(
        { name: "GroupcastTestResultEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "GeneralError", id: 0x1, conformance: "M" }),
        Field({ name: "MessageReplay", id: 0x2, conformance: "M" }),
        Field({ name: "FailedAuth", id: 0x3, conformance: "M" }),
        Field({ name: "NoAvailableKey", id: 0x4, conformance: "M" }),
        Field({ name: "SendFailure", id: 0x5, conformance: "M" })
    ),

    Datatype(
        { name: "MembershipStruct", type: "struct" },
        Field({ name: "GroupId", id: 0x0, type: "group-id", access: "F", conformance: "M", constraint: "min 1" }),
        Field(
            { name: "Endpoints", id: 0x1, type: "list", access: "F", conformance: "LN", constraint: "max 255" },
            Field({ name: "entry", type: "endpoint-no" })
        ),
        Field({ name: "KeySetId", id: 0x2, type: "uint16", access: "S", conformance: "M" }),
        Field({ name: "HasAuxiliaryAcl", id: 0x3, type: "bool", access: "F", conformance: "LN" }),
        Field({
            name: "McastAddrPolicy", id: 0x4, type: "MulticastAddrPolicyEnum", access: "F", conformance: "M",
            default: 0
        }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Command(
        { name: "JoinGroup", id: 0x0, access: "F M", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "GroupId", id: 0x0, type: "group-id", conformance: "M", constraint: "min 1" }),
        Field(
            { name: "Endpoints", id: 0x1, type: "list", conformance: "M", constraint: "desc" },
            Field({ name: "entry", type: "endpoint-no" })
        ),
        Field({ name: "KeySetId", id: 0x2, type: "uint16", conformance: "M" }),
        Field({ name: "Key", id: 0x3, type: "octstr", conformance: "O", constraint: "16" }),
        Field({ name: "UseAuxiliaryAcl", id: 0x4, type: "bool", conformance: "[LN]" }),
        Field({ name: "ReplaceEndpoints", id: 0x5, type: "bool", conformance: "[LN]" }),
        Field({ name: "McastAddrPolicy", id: 0x6, type: "MulticastAddrPolicyEnum", conformance: "O" })
    ),

    Command(
        {
            name: "LeaveGroup", id: 0x1, access: "F M", conformance: "P, M", direction: "request",
            response: "LeaveGroupResponse"
        },
        Field({ name: "GroupId", id: 0x0, type: "group-id", conformance: "M" }),
        Field(
            { name: "Endpoints", id: 0x1, type: "list", conformance: "O", constraint: "1 to 20" },
            Field({ name: "entry", type: "endpoint-no" })
        )
    ),

    Command(
        { name: "LeaveGroupResponse", id: 0x2, conformance: "P, M", direction: "response" },
        Field({ name: "GroupId", id: 0x0, type: "group-id", conformance: "M" }),
        Field(
            { name: "Endpoints", id: 0x1, type: "list", conformance: "M", constraint: "max 20" },
            Field({ name: "entry", type: "endpoint-no" })
        )
    ),

    Command(
        {
            name: "UpdateGroupKey", id: 0x3, access: "F M", conformance: "P, M", direction: "request",
            response: "status"
        },
        Field({ name: "GroupId", id: 0x0, type: "group-id", conformance: "M", constraint: "min 1" }),
        Field({ name: "KeySetId", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "Key", id: 0x2, type: "octstr", conformance: "O", constraint: "16" })
    ),

    Command(
        {
            name: "ConfigureAuxiliaryAcl", id: 0x4, access: "F A", conformance: "P, LN", direction: "request",
            response: "status"
        },
        Field({ name: "GroupId", id: 0x0, type: "group-id", conformance: "M" }),
        Field({ name: "UseAuxiliaryAcl", id: 0x1, type: "bool", conformance: "M" })
    ),

    Command(
        {
            name: "GroupcastTesting", id: 0x5, access: "F A", conformance: "P, M", direction: "request",
            response: "status"
        },
        Field({ name: "TestOperation", id: 0x0, type: "GroupcastTestingEnum", conformance: "M" }),
        Field({ name: "DurationSeconds", id: 0x1, type: "uint16", conformance: "O", constraint: "10 to 1200", default: 60 })
    ),

    Event(
        { name: "GroupcastTesting", id: 0x0, access: "S A", conformance: "P, M", priority: "info" },
        Field({ name: "SourceIpAddress", id: 0x0, type: "ipv6adr", access: "S", conformance: "O" }),
        Field({ name: "DestinationIpAddress", id: 0x1, type: "ipv6adr", access: "S", conformance: "O" }),
        Field({ name: "GroupId", id: 0x2, type: "group-id", access: "S", conformance: "O" }),
        Field({ name: "EndpointId", id: 0x3, type: "endpoint-no", access: "S", conformance: "O" }),
        Field({ name: "ClusterId", id: 0x4, type: "cluster-id", access: "S", conformance: "O" }),
        Field({ name: "ElementId", id: 0x5, type: "uint32", access: "S", conformance: "O" }),
        Field({ name: "AccessAllowed", id: 0x6, type: "bool", access: "S", conformance: "O" }),
        Field({ name: "GroupcastTestResult", id: 0x7, type: "GroupcastTestResultEnum", access: "S", conformance: "M" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    )
);

MatterDefinition.children.push(Groupcast);
