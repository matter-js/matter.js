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

export const GroupKeyManagement = Cluster(
    { name: "GroupKeyManagement", id: 0x3f, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "CS", conformance: "P", constraint: "0", title: "CacheAndSync" })
    ),

    Attribute(
        {
            name: "GroupKeyMap", id: 0x0, type: "list", access: "RW F VM", conformance: "M", constraint: "desc",
            default: [], quality: "N"
        },
        Field({ name: "entry", type: "GroupKeyMapStruct" })
    ),

    Attribute(
        {
            name: "GroupTable", id: 0x1, type: "list", access: "R F V", conformance: "M", constraint: "desc",
            default: []
        },
        Field({ name: "entry", type: "GroupInfoMapStruct" })
    ),

    Attribute({ name: "MaxGroupsPerFabric", id: 0x2, type: "uint16", access: "R V", conformance: "M", default: 0, quality: "F" }),
    Attribute({
        name: "MaxGroupKeysPerFabric", id: 0x3, type: "uint16", access: "R V", conformance: "M",
        constraint: "1 to 65535", default: 1, quality: "F"
    }),
    Command(
        { name: "KeySetWrite", id: 0x0, access: "F A", conformance: "M", direction: "request", response: "status" },
        Field({ name: "GroupKeySet", id: 0x0, type: "GroupKeySetStruct", conformance: "M" })
    ),

    Command(
        {
            name: "KeySetRead", id: 0x1, access: "F A", conformance: "M", direction: "request",
            response: "KeySetReadResponse"
        },
        Field({ name: "GroupKeySetId", id: 0x0, type: "uint16", conformance: "M" })
    ),

    Command(
        { name: "KeySetReadResponse", id: 0x2, conformance: "M", direction: "response" },
        Field({ name: "GroupKeySet", id: 0x0, type: "GroupKeySetStruct", conformance: "M" })
    ),
    Command(
        { name: "KeySetRemove", id: 0x3, access: "F A", conformance: "M", direction: "request", response: "status" },
        Field({ name: "GroupKeySetId", id: 0x0, type: "uint16", conformance: "M" })
    ),

    Command(
        {
            name: "KeySetReadAllIndices", id: 0x4, access: "F A", conformance: "M", direction: "request",
            response: "KeySetReadAllIndicesResponse"
        },
        Field({ name: "DoNotUse", id: 0x0, conformance: "X" })
    ),

    Command(
        { name: "KeySetReadAllIndicesResponse", id: 0x5, conformance: "M", direction: "response" },
        Field(
            { name: "GroupKeySetIDs", id: 0x0, type: "list", conformance: "M" },
            Field({ name: "entry", type: "uint16" })
        )
    ),

    Datatype(
        { name: "GroupKeySecurityPolicyEnum", type: "enum8" },
        Field({ name: "TrustFirst", id: 0x0, conformance: "M" }),
        Field({ name: "CacheAndSync", id: 0x1, conformance: "CS" })
    ),
    Datatype(
        { name: "GroupKeyMulticastPolicyEnum", type: "enum8" },
        Field({ name: "PerGroupId", id: 0x0, conformance: "M" }),
        Field({ name: "AllNodes", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "GroupKeyMapStruct", type: "struct" },
        Field({ name: "GroupId", id: 0x1, type: "group-id", access: "F", conformance: "M" }),
        Field({ name: "GroupKeySetId", id: 0x2, type: "uint16", access: "F", conformance: "M", constraint: "1 to 65535" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype(
        { name: "GroupKeySetStruct", type: "struct" },
        Field({ name: "GroupKeySetId", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "GroupKeySecurityPolicy", id: 0x1, type: "GroupKeySecurityPolicyEnum", access: "S", conformance: "M" }),
        Field({ name: "EpochKey0", id: 0x2, type: "octstr", access: "S", conformance: "M", constraint: "16", quality: "X" }),
        Field({ name: "EpochStartTime0", id: 0x3, type: "epoch-us", access: "S", conformance: "M", quality: "X" }),
        Field({ name: "EpochKey1", id: 0x4, type: "octstr", access: "S", conformance: "M", constraint: "16", quality: "X" }),
        Field({ name: "EpochStartTime1", id: 0x5, type: "epoch-us", access: "S", conformance: "M", quality: "X" }),
        Field({ name: "EpochKey2", id: 0x6, type: "octstr", access: "S", conformance: "M", constraint: "16", quality: "X" }),
        Field({ name: "EpochStartTime2", id: 0x7, type: "epoch-us", access: "S", conformance: "M", quality: "X" }),
        Field({
            name: "GroupKeyMulticastPolicy", id: 0x8, type: "GroupKeyMulticastPolicyEnum", access: "S",
            conformance: "O", default: 0
        })
    ),

    Datatype(
        { name: "GroupInfoMapStruct", type: "struct" },
        Field({ name: "GroupId", id: 0x1, type: "group-id", access: "F", conformance: "M" }),
        Field(
            { name: "Endpoints", id: 0x2, type: "list", access: "F", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "endpoint-no" })
        ),
        Field({ name: "GroupName", id: 0x3, type: "string", access: "F", conformance: "O", constraint: "max 16" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    )
);

MatterDefinition.children.push(GroupKeyManagement);
