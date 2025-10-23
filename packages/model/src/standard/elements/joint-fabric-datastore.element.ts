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

export const JointFabricDatastore = Cluster(
    { name: "JointFabricDatastore", id: 0x752 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({ name: "AnchorRootCa", id: 0x0, type: "octstr", access: "R A", conformance: "P, M" }),
    Attribute({ name: "AnchorNodeId", id: 0x1, type: "node-id", access: "R A", conformance: "P, M" }),
    Attribute({ name: "AnchorVendorId", id: 0x2, type: "vendor-id", access: "R A", conformance: "P, M" }),
    Attribute({ name: "FriendlyName", id: 0x3, type: "string", access: "R A", conformance: "P, M", constraint: "max 32" }),
    Attribute(
        { name: "GroupKeySetList", id: 0x4, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreGroupKeySetStruct" })
    ),
    Attribute(
        { name: "GroupList", id: 0x5, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreGroupInformationEntryStruct" })
    ),
    Attribute(
        { name: "NodeList", id: 0x6, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreNodeInformationEntryStruct" })
    ),
    Attribute(
        { name: "AdminList", id: 0x7, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreAdministratorInformationEntryStruct" })
    ),
    Attribute({ name: "Status", id: 0x8, type: "DatastoreStatusEntryStruct", access: "R A", conformance: "P, M" }),
    Attribute(
        { name: "EndpointGroupIdList", id: 0x9, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreEndpointGroupIDEntryStruct" })
    ),
    Attribute(
        { name: "EndpointBindingList", id: 0xa, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreEndpointBindingEntryStruct" })
    ),
    Attribute(
        { name: "NodeKeySetList", id: 0xb, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreNodeKeySetEntryStruct" })
    ),
    Attribute(
        { name: "NodeAclList", id: 0xc, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreACLEntryStruct" })
    ),
    Attribute(
        { name: "NodeEndpointList", id: 0xd, type: "list", access: "R A", conformance: "P, M" },
        Field({ name: "entry", type: "DatastoreEndpointEntryStruct" })
    ),
    Command(
        { name: "AddKeySet", id: 0x0, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "GroupKeySet", id: 0x0, type: "DatastoreGroupKeySetStruct", conformance: "M" })
    ),
    Command(
        { name: "UpdateKeySet", id: 0x1, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "GroupKeySet", id: 0x0, type: "DatastoreGroupKeySetStruct", conformance: "M" })
    ),
    Command(
        { name: "RemoveKeySet", id: 0x2, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "GroupKeySetId", id: 0x0, type: "uint16", conformance: "M" })
    ),

    Command(
        { name: "AddGroup", id: 0x3, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "GroupId", id: 0x0, type: "group-id", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x1, type: "string", conformance: "M", constraint: "max 32" }),
        Field({ name: "GroupKeySetId", id: 0x2, type: "uint16", conformance: "M", constraint: "1 to 65534", quality: "X" }),
        Field({ name: "GroupCat", id: 0x3, type: "uint16", conformance: "M", constraint: "desc", quality: "X" }),
        Field({ name: "GroupCatVersion", id: 0x4, type: "uint16", conformance: "M", constraint: "1 to 65534", quality: "X" }),
        Field({ name: "GroupPermission", id: 0x5, type: "DatastoreAccessControlEntryPrivilegeEnum", conformance: "M" })
    ),

    Command(
        { name: "UpdateGroup", id: 0x4, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "GroupId", id: 0x0, type: "group-id", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x1, type: "string", conformance: "M", constraint: "max 32", quality: "X" }),
        Field({ name: "GroupKeySetId", id: 0x2, type: "uint16", conformance: "M", constraint: "1 to 65535", quality: "X" }),
        Field({ name: "GroupCat", id: 0x3, type: "uint16", conformance: "M", constraint: "desc", quality: "X" }),
        Field({ name: "GroupCatVersion", id: 0x4, type: "uint16", conformance: "M", constraint: "1 to 65535", quality: "X" }),
        Field({
            name: "GroupPermission", id: 0x5, type: "DatastoreAccessControlEntryPrivilegeEnum",
            conformance: "M", constraint: "x"
        })
    ),

    Command(
        { name: "RemoveGroup", id: 0x5, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "GroupId", id: 0x0, type: "group-id", conformance: "M" })
    ),

    Command(
        { name: "AddAdmin", id: 0x6, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "NodeId", id: 0x1, type: "node-id", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x2, type: "string", conformance: "M", constraint: "max 32" }),
        Field({ name: "VendorId", id: 0x3, type: "vendor-id", conformance: "M" }),
        Field({ name: "Icac", id: 0x4, type: "octstr", conformance: "M", constraint: "max 400" })
    ),

    Command(
        { name: "UpdateAdmin", id: 0x7, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M", quality: "X" }),
        Field({ name: "FriendlyName", id: 0x1, type: "string", conformance: "M", constraint: "max 32", quality: "X" }),
        Field({ name: "Icac", id: 0x2, type: "octstr", conformance: "M", constraint: "max 400", quality: "X" })
    ),

    Command(
        { name: "RemoveAdmin", id: 0x8, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" })
    ),
    Command(
        { name: "AddPendingNode", id: 0x9, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x1, type: "string", conformance: "M", constraint: "max 32" })
    ),
    Command(
        { name: "RefreshNode", id: 0xa, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" })
    ),
    Command(
        { name: "UpdateNode", id: 0xb, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x1, type: "string", conformance: "M", constraint: "max 32" })
    ),
    Command(
        { name: "RemoveNode", id: 0xc, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" })
    ),

    Command(
        {
            name: "UpdateEndpointForNode", id: 0xd, access: "A", conformance: "P, M", direction: "request",
            response: "status"
        },
        Field({ name: "EndpointId", id: 0x0, type: "endpoint-no", conformance: "M" }),
        Field({ name: "NodeId", id: 0x1, type: "node-id", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x2, type: "string", conformance: "M", constraint: "max 32" })
    ),

    Command(
        {
            name: "AddGroupIdToEndpointForNode", id: 0xe, access: "A", conformance: "P, M",
            direction: "request", response: "status"
        },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "EndpointId", id: 0x1, type: "endpoint-no", conformance: "M" }),
        Field({ name: "GroupId", id: 0x2, type: "group-id", conformance: "M" })
    ),

    Command(
        {
            name: "RemoveGroupIdFromEndpointForNode", id: 0xf, access: "A", conformance: "P, M",
            direction: "request", response: "status"
        },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "EndpointId", id: 0x1, type: "endpoint-no", conformance: "M" }),
        Field({ name: "GroupId", id: 0x2, type: "group-id", conformance: "M" })
    ),

    Command(
        {
            name: "AddBindingToEndpointForNode", id: 0x10, access: "A", conformance: "P, M",
            direction: "request", response: "status"
        },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "EndpointId", id: 0x1, type: "endpoint-no", conformance: "M" }),
        Field({ name: "Binding", id: 0x2, type: "DatastoreBindingTargetStruct", conformance: "M" })
    ),

    Command(
        {
            name: "RemoveBindingFromEndpointForNode", id: 0x11, access: "A", conformance: "P, M",
            direction: "request", response: "status"
        },
        Field({ name: "ListId", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "EndpointId", id: 0x1, type: "endpoint-no", conformance: "M" }),
        Field({ name: "NodeId", id: 0x2, type: "node-id", conformance: "M" })
    ),

    Command(
        { name: "AddAclToNode", id: 0x12, access: "A", conformance: "P, M", direction: "request", response: "status" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", conformance: "M" }),
        Field({ name: "AclEntry", id: 0x1, type: "DatastoreAccessControlEntryStruct", conformance: "M" })
    ),

    Command(
        {
            name: "RemoveAclFromNode", id: 0x13, access: "A", conformance: "P, M", direction: "request",
            response: "status"
        },
        Field({ name: "ListId", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "NodeId", id: 0x1, type: "node-id", conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreStateEnum", type: "enum8" },
        Field({ name: "Pending", id: 0x0, conformance: "M" }),
        Field({ name: "Committed", id: 0x1, conformance: "M" }),
        Field({ name: "DeletePending", id: 0x2, conformance: "M" }),
        Field({ name: "CommitFailed", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreStatusEntryStruct", type: "struct" },
        Field({ name: "State", id: 0x0, type: "DatastoreStateEnum", access: "R V", conformance: "M", default: 0 }),
        Field({ name: "UpdateTimestamp", id: 0x1, type: "epoch-s", access: "R V", conformance: "M" }),
        Field({ name: "FailureCode", id: 0x2, type: "status", access: "R V", conformance: "M", default: 0 })
    ),

    Datatype(
        { name: "DatastoreNodeKeySetEntryStruct", type: "struct" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", access: "R V", conformance: "M" }),
        Field({ name: "GroupKeySetId", id: 0x1, type: "uint16", access: "R V", conformance: "M" }),
        Field({ name: "StatusEntry", id: 0x2, type: "DatastoreStatusEntryStruct", access: "R V", conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreAccessControlEntryPrivilegeEnum", type: "enum8" },
        Field({ name: "View", id: 0x1, conformance: "M" }),
        Field({ name: "ProxyView", id: 0x2, conformance: "D" }),
        Field({ name: "Operate", id: 0x3, conformance: "M" }),
        Field({ name: "Manage", id: 0x4, conformance: "M" }),
        Field({ name: "Administer", id: 0x5, conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreGroupInformationEntryStruct", type: "struct" },
        Field({ name: "GroupId", id: 0x0, type: "uint64", access: "R V", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x1, type: "string", access: "R V", conformance: "M", constraint: "max 32" }),
        Field({
            name: "GroupKeySetId", id: 0x2, type: "uint16", access: "R V", conformance: "M",
            constraint: "1 to 65534", quality: "X"
        }),
        Field({
            name: "GroupCat", id: 0x3, type: "uint16", access: "R V", conformance: "M", constraint: "desc",
            quality: "X"
        }),
        Field({
            name: "GroupCatVersion", id: 0x4, type: "uint16", access: "R V", conformance: "M",
            constraint: "1 to 65534", quality: "X"
        }),
        Field({
            name: "GroupPermission", id: 0x5, type: "DatastoreAccessControlEntryPrivilegeEnum", access: "R V",
            conformance: "M"
        })
    ),

    Datatype(
        { name: "DatastoreBindingTargetStruct", type: "struct" },
        Field({ name: "Node", id: 0x1, type: "node-id", conformance: "Endpoint" }),
        Field({ name: "Group", id: 0x2, type: "group-id", conformance: "!Endpoint", constraint: "min 1" }),
        Field({ name: "Endpoint", id: 0x3, type: "endpoint-no", conformance: "!Group" }),
        Field({ name: "Cluster", id: 0x4, type: "cluster-id", conformance: "O" })
    ),

    Datatype(
        { name: "DatastoreEndpointBindingEntryStruct", type: "struct" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", access: "R V", conformance: "M" }),
        Field({ name: "EndpointId", id: 0x1, type: "endpoint-no", access: "R V", conformance: "M" }),
        Field({ name: "ListId", id: 0x2, type: "uint16", access: "R V", conformance: "M" }),
        Field({
            name: "Binding", id: 0x3, type: "DatastoreBindingTargetStruct", access: "R V", conformance: "M",
            constraint: "desc"
        }),
        Field({ name: "StatusEntry", id: 0x4, type: "DatastoreStatusEntryStruct", access: "R V", conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreEndpointGroupIDEntryStruct", type: "struct" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", access: "R V", conformance: "M" }),
        Field({ name: "EndpointId", id: 0x1, type: "endpoint-no", access: "R V", conformance: "M" }),
        Field({ name: "GroupId", id: 0x2, type: "group-id", access: "R V", conformance: "M" }),
        Field({ name: "StatusEntry", id: 0x3, type: "DatastoreStatusEntryStruct", access: "R V", conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreEndpointEntryStruct", type: "struct" },
        Field({ name: "EndpointId", id: 0x0, type: "endpoint-no", access: "R V", conformance: "M" }),
        Field({ name: "NodeId", id: 0x1, type: "node-id", access: "R V", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x2, type: "string", access: "R V", conformance: "M", constraint: "max 32" }),
        Field({ name: "StatusEntry", id: 0x3, type: "DatastoreStatusEntryStruct", access: "R V", conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreAccessControlEntryAuthModeEnum", type: "enum8" },
        Field({ name: "Pase", id: 0x1, conformance: "M" }),
        Field({ name: "Case", id: 0x2, conformance: "M" }),
        Field({ name: "Group", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreAccessControlTargetStruct", type: "struct" },
        Field({ name: "Cluster", id: 0x0, type: "cluster-id", conformance: "M", quality: "X" }),
        Field({ name: "Endpoint", id: 0x1, type: "endpoint-no", conformance: "M", quality: "X" }),
        Field({ name: "DeviceType", id: 0x2, type: "devtype-id", conformance: "M", quality: "X" })
    ),

    Datatype(
        { name: "DatastoreAccessControlEntryStruct", type: "struct" },
        Field({ name: "Privilege", id: 0x1, type: "DatastoreAccessControlEntryPrivilegeEnum", conformance: "M" }),
        Field({ name: "AuthMode", id: 0x2, type: "DatastoreAccessControlEntryAuthModeEnum", conformance: "M" }),

        Field(
            {
                name: "Subjects", id: 0x3, type: "list", conformance: "M",
                constraint: "max subjectsPerAccessControlEntry", quality: "X"
            },
            Field({ name: "entry", type: "subject-id" })
        ),

        Field(
            {
                name: "Targets", id: 0x4, type: "list", conformance: "M",
                constraint: "max targetsPerAccessControlEntry", quality: "X"
            },
            Field({ name: "entry", type: "DatastoreAccessControlTargetStruct" })
        )
    ),

    Datatype(
        { name: "DatastoreACLEntryStruct", type: "struct" },
        Field({ name: "NodeId", id: 0x0, type: "node-id", access: "R V", conformance: "M" }),
        Field({ name: "ListId", id: 0x1, type: "uint16", access: "R V", conformance: "M" }),
        Field({ name: "AclEntry", id: 0x2, type: "DatastoreAccessControlEntryStruct", access: "R V", conformance: "M" }),
        Field({ name: "StatusEntry", id: 0x3, type: "DatastoreStatusEntryStruct", access: "R V", conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreNodeInformationEntryStruct", type: "struct" },
        Field({ name: "NodeId", id: 0x1, type: "node-id", access: "R V", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x2, type: "string", access: "R V", conformance: "M", constraint: "max 32" }),
        Field({
            name: "CommissioningStatusEntry", id: 0x3, type: "DatastoreStatusEntryStruct", access: "R V",
            conformance: "M"
        })
    ),

    Datatype(
        { name: "DatastoreAdministratorInformationEntryStruct", type: "struct" },
        Field({ name: "NodeId", id: 0x1, type: "node-id", access: "R V", conformance: "M" }),
        Field({ name: "FriendlyName", id: 0x2, type: "string", access: "R V", conformance: "M", constraint: "max 32" }),
        Field({ name: "VendorId", id: 0x3, type: "vendor-id", access: "R V", conformance: "M" }),
        Field({ name: "Icac", id: 0x4, type: "octstr", access: "R V", conformance: "M", constraint: "max 400" })
    ),

    Datatype(
        { name: "DatastoreGroupKeySecurityPolicyEnum", type: "enum8" },
        Field({ name: "TrustFirst", id: 0x0, conformance: "M" })
    ),
    Datatype(
        { name: "DatastoreGroupKeyMulticastPolicyEnum", type: "enum8" },
        Field({ name: "PerGroupId", id: 0x0, conformance: "M" }),
        Field({ name: "AllNodes", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "DatastoreGroupKeySetStruct", type: "struct" },
        Field({ name: "GroupKeySetId", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "GroupKeySecurityPolicy", id: 0x1, type: "DatastoreGroupKeySecurityPolicyEnum", conformance: "M" }),
        Field({ name: "EpochKey0", id: 0x2, type: "octstr", conformance: "M", constraint: "16", quality: "X" }),
        Field({ name: "EpochStartTime0", id: 0x3, type: "epoch-us", conformance: "M", quality: "X" }),
        Field({ name: "EpochKey1", id: 0x4, type: "octstr", conformance: "M", constraint: "16", quality: "X" }),
        Field({ name: "EpochStartTime1", id: 0x5, type: "epoch-us", conformance: "M", quality: "X" }),
        Field({ name: "EpochKey2", id: 0x6, type: "octstr", conformance: "M", constraint: "16", quality: "X" }),
        Field({ name: "EpochStartTime2", id: 0x7, type: "epoch-us", conformance: "M", quality: "X" }),
        Field({ name: "GroupKeyMulticastPolicy", id: 0x8, type: "DatastoreGroupKeyMulticastPolicyEnum", conformance: "P, M" })
    )
);

MatterDefinition.children.push(JointFabricDatastore);
