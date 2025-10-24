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

export const AccessControl = Cluster(
    { name: "AccessControl", id: 0x1f },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "EXTS", conformance: "O", constraint: "0", title: "Extension" }),
        Field({ name: "MNGD", conformance: "desc", constraint: "1", title: "ManagedDevice" })
    ),
    Attribute(
        { name: "Acl", id: 0x0, type: "list", access: "RW F A", conformance: "M", constraint: "desc" },
        Field({ name: "entry", type: "AccessControlEntryStruct" })
    ),
    Attribute(
        { name: "Extension", id: 0x1, type: "list", access: "RW F A", conformance: "EXTS", constraint: "desc" },
        Field({ name: "entry", type: "AccessControlExtensionStruct" })
    ),
    Attribute({
        name: "SubjectsPerAccessControlEntry", id: 0x2, type: "uint16", access: "R V", conformance: "M",
        constraint: "min 4", default: 4, quality: "F"
    }),
    Attribute({
        name: "TargetsPerAccessControlEntry", id: 0x3, type: "uint16", access: "R V", conformance: "M",
        constraint: "min 3", default: 3, quality: "F"
    }),
    Attribute({
        name: "AccessControlEntriesPerFabric", id: 0x4, type: "uint16", access: "R V", conformance: "M",
        constraint: "min 4", default: 4, quality: "F"
    }),

    Attribute(
        {
            name: "CommissioningArl", id: 0x5, type: "list", access: "R V", conformance: "MNGD",
            constraint: "desc", default: [], quality: "F"
        },
        Field({ name: "entry", type: "CommissioningAccessRestrictionEntryStruct" })
    ),

    Attribute(
        { name: "Arl", id: 0x6, type: "list", access: "R F V", conformance: "MNGD", constraint: "desc", default: [] },
        Field({ name: "entry", type: "AccessRestrictionEntryStruct" })
    ),

    Event(
        { name: "AccessControlEntryChanged", id: 0x0, access: "S A", conformance: "M", priority: "info" },
        Field({
            name: "AdminNodeId", id: 0x1, type: "node-id", access: "S", conformance: "M", constraint: "desc",
            quality: "X"
        }),
        Field({
            name: "AdminPasscodeId", id: 0x2, type: "uint16", access: "S", conformance: "M", constraint: "desc",
            quality: "X"
        }),
        Field({ name: "ChangeType", id: 0x3, type: "ChangeTypeEnum", access: "S", conformance: "M" }),
        Field({ name: "LatestValue", id: 0x4, type: "AccessControlEntryStruct", access: "S", conformance: "M", quality: "X" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Event(
        { name: "AccessControlExtensionChanged", id: 0x1, access: "S A", conformance: "EXTS", priority: "info" },
        Field({
            name: "AdminNodeId", id: 0x1, type: "node-id", access: "S", conformance: "M", constraint: "desc",
            quality: "X"
        }),
        Field({
            name: "AdminPasscodeId", id: 0x2, type: "uint16", access: "S", conformance: "M", constraint: "desc",
            quality: "X"
        }),
        Field({ name: "ChangeType", id: 0x3, type: "ChangeTypeEnum", access: "S", conformance: "M" }),
        Field({
            name: "LatestValue", id: 0x4, type: "AccessControlExtensionStruct", access: "S", conformance: "M",
            quality: "X"
        }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Event(
        { name: "FabricRestrictionReviewUpdate", id: 0x2, access: "S A", conformance: "MNGD", priority: "info" },
        Field({ name: "Token", id: 0x0, type: "uint64", access: "S", conformance: "M" }),
        Field({ name: "Instruction", id: 0x1, type: "string", access: "S", conformance: "O", constraint: "max 512" }),
        Field({ name: "ArlRequestFlowUrl", id: 0x2, type: "string", access: "S", conformance: "O", constraint: "max 256" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Command(
        {
            name: "ReviewFabricRestrictions", id: 0x0, access: "F A", conformance: "MNGD", direction: "request",
            response: "ReviewFabricRestrictionsResponse"
        },
        Field(
            { name: "Arl", id: 0x0, type: "list", conformance: "M", constraint: "desc" },
            Field({ name: "entry", type: "CommissioningAccessRestrictionEntryStruct" })
        )
    ),

    Command(
        { name: "ReviewFabricRestrictionsResponse", id: 0x1, conformance: "MNGD", direction: "response" },
        Field({ name: "Token", id: 0x0, type: "uint64", conformance: "M" })
    ),

    Datatype(
        { name: "ChangeTypeEnum", type: "enum8" },
        Field({ name: "Changed", id: 0x0, conformance: "M" }),
        Field({ name: "Added", id: 0x1, conformance: "M" }),
        Field({ name: "Removed", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "AccessControlEntryPrivilegeEnum", type: "enum8" },
        Field({ name: "View", id: 0x1, conformance: "M" }),
        Field({ name: "ProxyView", id: 0x2, conformance: "D" }),
        Field({ name: "Operate", id: 0x3, conformance: "M" }),
        Field({ name: "Manage", id: 0x4, conformance: "M" }),
        Field({ name: "Administer", id: 0x5, conformance: "M" })
    ),

    Datatype(
        { name: "AccessRestrictionTypeEnum", type: "enum8" },
        Field({ name: "AttributeAccessForbidden", id: 0x0, conformance: "M" }),
        Field({ name: "AttributeWriteForbidden", id: 0x1, conformance: "M" }),
        Field({ name: "CommandForbidden", id: 0x2, conformance: "M" }),
        Field({ name: "EventForbidden", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "AccessControlEntryAuthModeEnum", type: "enum8" },
        Field({ name: "Pase", id: 0x1, conformance: "M" }),
        Field({ name: "Case", id: 0x2, conformance: "M" }),
        Field({ name: "Group", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "AccessControlTargetStruct", type: "struct" },
        Field({ name: "Cluster", id: 0x0, type: "cluster-id", conformance: "M", quality: "X" }),
        Field({ name: "Endpoint", id: 0x1, type: "endpoint-no", conformance: "M", quality: "X" }),
        Field({ name: "DeviceType", id: 0x2, type: "devtype-id", conformance: "M", quality: "X" })
    ),

    Datatype(
        { name: "AccessControlEntryStruct", type: "struct" },
        Field({ name: "Privilege", id: 0x1, type: "AccessControlEntryPrivilegeEnum", access: "S", conformance: "M" }),
        Field({ name: "AuthMode", id: 0x2, type: "AccessControlEntryAuthModeEnum", access: "S", conformance: "M" }),

        Field(
            {
                name: "Subjects", id: 0x3, type: "list", access: "S", conformance: "M",
                constraint: "max subjectsPerAccessControlEntry", quality: "X"
            },
            Field({ name: "entry", type: "subject-id" })
        ),

        Field(
            {
                name: "Targets", id: 0x4, type: "list", access: "S", conformance: "M",
                constraint: "max targetsPerAccessControlEntry", quality: "X"
            },
            Field({ name: "entry", type: "AccessControlTargetStruct" })
        ),

        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype(
        { name: "AccessControlExtensionStruct", type: "struct" },
        Field({ name: "Data", id: 0x1, type: "octstr", access: "S", conformance: "M", constraint: "max 128" }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),
    Datatype(
        { name: "AccessRestrictionStruct", type: "struct" },
        Field({ name: "Type", id: 0x0, type: "AccessRestrictionTypeEnum", conformance: "M" }),
        Field({ name: "Id", id: 0x1, type: "uint32", conformance: "M", quality: "X" })
    ),

    Datatype(
        { name: "AccessRestrictionEntryStruct", type: "struct" },
        Field({ name: "Endpoint", id: 0x0, type: "endpoint-no", access: "S", conformance: "M" }),
        Field({ name: "Cluster", id: 0x1, type: "cluster-id", access: "S", conformance: "M" }),
        Field(
            { name: "Restrictions", id: 0x2, type: "list", access: "S", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "AccessRestrictionStruct" })
        ),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype(
        { name: "CommissioningAccessRestrictionEntryStruct", type: "struct" },
        Field({ name: "Endpoint", id: 0x0, type: "endpoint-no", conformance: "M" }),
        Field({ name: "Cluster", id: 0x1, type: "cluster-id", conformance: "M" }),
        Field(
            { name: "Restrictions", id: 0x2, type: "list", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "AccessRestrictionStruct" })
        )
    )
);

MatterDefinition.children.push(AccessControl);
