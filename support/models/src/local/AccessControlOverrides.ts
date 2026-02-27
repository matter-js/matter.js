/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Matter 1.6 Groupcast additions to the Access Control cluster.
// Adds the Auxiliary (AUX) feature, AccessControlAuxiliaryTypeEnum, AuxiliaryType
// field in AccessControlEntryStruct, AuxiliaryACL attribute (0x0007), and
// AuxiliaryAccessUpdated event (0x03).
// Spec: src/data_model/ACL-Cluster.adoc (guarded by ifdef::in-progress,groupcast[])

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "AccessControl",

    children: [
        // Bump revision to 3: Added Auxiliary feature and AuxiliaryACL attribute
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 3 },

        // New feature: Auxiliary (bit 2, provisional)
        // Include existing features too so the position-based merge preserves them
        {
            tag: "attribute",
            id: 0xfffc,
            name: "FeatureMap",
            children: [
                { tag: "field", name: "EXTS", constraint: "0" }, // preserve existing Extension feature
                { tag: "field", name: "MNGD", constraint: "1" }, // preserve existing ManagedDevice feature
                {
                    tag: "field",
                    name: "AUX",
                    constraint: "2",
                    conformance: "P, desc",
                    title: "Auxiliary",
                    details:
                        "This feature indicates that there may be entries in the AuxiliaryACL attribute which indicate " +
                        "synthesized ACL entries. For example, when this feature is supported, the configuration of " +
                        "groups via the Groupcast cluster may lead, under some circumstances, to some access being " +
                        "granted automatically to some subjects by virtue of group membership.",
                },
            ],
        },

        // New enum for auxiliary ACL entry type
        {
            tag: "datatype",
            name: "AccessControlAuxiliaryTypeEnum",
            type: "enum8",
            children: [
                {
                    tag: "field",
                    id: 0x0,
                    name: "System",
                    conformance: "M",
                    details: "This ACL entry exists because of some system reason and is likely non-revocable.",
                },
                {
                    tag: "field",
                    id: 0x1,
                    name: "Groupcast",
                    conformance: "M",
                    details: "Synthesized via Groupcast Cluster administrator-configured group membership.",
                },
            ],
        },

        // Add AuxiliaryType field (id 5, Secret) to AccessControlEntryStruct.
        // This field SHALL NOT be present in entries in the ACL attribute; only in AuxiliaryACL.
        {
            tag: "datatype",
            name: "AccessControlEntryStruct",
            type: "struct",
            children: [
                {
                    tag: "field",
                    id: 0x5,
                    name: "AuxiliaryType",
                    type: "AccessControlAuxiliaryTypeEnum",
                    access: "S",
                    conformance: "P, O",
                },
            ],
        },

        // New attribute: AuxiliaryACL (0x0007)
        // Read-only auto-generated ACL entries; does not count toward AccessControlEntriesPerFabric
        {
            tag: "attribute",
            id: 0x0007,
            name: "AuxiliaryAcl",
            type: "list",
            access: "R A F",
            conformance: "P, AUX",
            constraint: "max 2000",
            children: [{ tag: "field", name: "entry", type: "AccessControlEntryStruct" }],
        },

        // New event: AuxiliaryAccessUpdated (0x03)
        // Generated when AuxiliaryACL attribute data changes due to system management operations
        {
            tag: "event",
            id: 0x03,
            name: "AuxiliaryAccessUpdated",
            access: "S A",
            conformance: "P, AUX",
            priority: "info",
            children: [
                {
                    tag: "field",
                    id: 0x0,
                    name: "AdminNodeId",
                    type: "node-id",
                    access: "S",
                    conformance: "M",
                    quality: "X",
                    details:
                        "The AdminNodeID field SHALL contain the NodeID of the Administrator that caused the action " +
                        "which led to changes to the AuxiliaryACL. If no information is available, such as when a " +
                        "change is internally initiated, this field SHALL be null.",
                },
                { tag: "field", id: 0xfe, name: "FabricIndex", type: "FabricIndex" },
            ],
        },
    ],
});
