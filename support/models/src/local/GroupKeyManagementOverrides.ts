/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "GroupKeyManagement",

    children: [
        // Conformance of this field in the struct is "provisional, mandatory" which in fact means "optional"
        // TODO: We should do this already in the conformance interpreter
        // Default: GroupKeyMulticastPolicyEnum.PerGroupID
        {
            tag: "datatype",
            name: "GroupKeySetStruct",
            type: "struct",
            children: [{ tag: "field", id: 0x8, name: "GroupKeyMulticastPolicy", conformance: "O", default: 0 }],
        },
        {
            tag: "command",
            id: 0x4,
            name: "KeySetReadAllIndices",
            until: "1.1",

            children: [
                // The presence of this field is a CHIP bug in 1.1 branch.
                // They fixed in their main branch...  Remove via conformance
                { tag: "field", id: 0x0, name: "GroupKeySetIDs", conformance: "X" },
            ],
        },

        // Matter 1.6 Groupcast additions
        // Spec: src/data_model/Group-Key-Management-Cluster.adoc (guarded by ifdef::in-progress,groupcast[])

        // Bump revision to 3: refocus on pure key management; group management moves to Groupcast cluster
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 3 },

        // New feature: GCAST (bit 1) — device supports groups using the Groupcast cluster
        // Include existing CS feature too so the position-based merge preserves it
        {
            tag: "attribute",
            id: 0xfffc,
            name: "FeatureMap",
            children: [
                { tag: "field", name: "CS", constraint: "0" }, // preserve existing CacheAndSync feature
                {
                    tag: "field",
                    name: "GCAST",
                    constraint: "1",
                    conformance: "M",
                    title: "Groupcast",
                    details: "When set, group management is done using the Groupcast cluster. This cluster is used solely for key management.",
                },
            ],
        },

        /* Provisional in Matter 1.6.0: GroupcastAdoption struct + attribute removed from
         * certification scope — other implementors have not adopted this yet.
         *
        {
            tag: "datatype",
            name: "GroupcastAdoptionStruct",
            type: "struct",
            children: [
                {
                    tag: "field", id: 0x0, name: "GroupcastAdopted", type: "bool",
                    access: "F", conformance: "M",
                    details: "Indicates whether Groupcast was adopted by the associated Fabric's administrators.",
                },
                { tag: "field", id: 0xfe, name: "FabricIndex", type: "FabricIndex" },
            ],
        },
        {
            tag: "attribute", id: 0x0004, name: "GroupcastAdoption", type: "list",
            access: "RW A F", conformance: "GCAST", constraint: "desc", quality: "N",
            children: [{ tag: "field", name: "entry", type: "GroupcastAdoptionStruct" }],
        },
        */
    ],
});
