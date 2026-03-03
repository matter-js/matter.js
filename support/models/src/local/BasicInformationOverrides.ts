/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "BasicInformation",

    children: [
        {
            tag: "attribute",
            name: "ProductAppearance",
            id: 0x14,
            type: "ProductAppearanceStruct",
            conformance: "O",
            quality: "F",
            until: "1.3",
        },

        // Matter 1.6 improved-capabilities-tcr additions
        // Spec: src/service_device_management/BasicInformationCluster.adoc
        // (guarded by ifdef::in-progress,improved-capabilities-tcr[])

        // Bump revision to 6: extended CapabilityMinimaStruct with 4 new fields
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 6 },

        // Extend CapabilityMinimaStruct with 4 new fields (conformance Rev >= v6)
        {
            tag: "datatype",
            name: "CapabilityMinimaStruct",
            type: "struct",
            children: [
                {
                    tag: "field",
                    id: 0x2,
                    name: "SimultaneousInvocationsSupported",
                    type: "uint16",
                    constraint: "1 to 10000",
                    conformance: "desc",
                    details:
                        "This field shall indicate the actual maximum number of concurrent Invoke interactions that can be " +
                        "processed simultaneously by the node before possibly returning a BUSY status code.",
                },
                {
                    tag: "field",
                    id: 0x3,
                    name: "SimultaneousWritesSupported",
                    type: "uint16",
                    constraint: "1 to 10000",
                    conformance: "desc",
                    details:
                        "This field shall indicate the actual minimum number of concurrent Write interactions that can be " +
                        "processed simultaneously by the node before possibly returning a BUSY status code.",
                },
                {
                    tag: "field",
                    id: 0x4,
                    name: "ReadPathsSupported",
                    type: "uint16",
                    constraint: "9 to 10000",
                    conformance: "desc",
                    details:
                        "This field shall indicate the actual maximum number of read paths (i.e. the sum of lengths of the " +
                        "lists of AttributePathIB and EventPathIB in the action) which a node guarantees being able to " +
                        "process in any Read Request Action.",
                },
                {
                    tag: "field",
                    id: 0x5,
                    name: "SubscribePathsSupported",
                    type: "uint16",
                    constraint: "3 to 10000",
                    conformance: "desc",
                    details:
                        "This field shall indicate the actual maximum number of subscription paths (i.e. the sum of lengths " +
                        "of the lists of AttributePathIB and EventPathIB in the action) which a node guarantees being able " +
                        "to process in any Subscribe Request Action.",
                },
            ],
        },
    ],
});
