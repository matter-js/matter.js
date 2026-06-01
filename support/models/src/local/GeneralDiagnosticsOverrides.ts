/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Matter 1.6 improved-capabilities-tcr additions to the General Diagnostics cluster.
// Adds the DeviceLoadStruct data type and the DeviceLoadStatus attribute (0x000A).
// Spec: src/service_device_management/DiagnosticsGeneral.adoc
// (guarded by ifdef::in-progress,improved-capabilities-tcr[])

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "GeneralDiagnostics",

    children: [
        // Bump revision to 3: Added DeviceLoadStatus attribute
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 3 },

        // New struct describing node resource utilization metrics
        {
            tag: "datatype",
            name: "DeviceLoadStruct",
            type: "struct",
            children: [
                {
                    tag: "field",
                    id: 0x0,
                    name: "CurrentSubscriptions",
                    type: "uint16",
                    conformance: "M",
                    details:
                        "This field shall indicate the number of currently-active Interaction Model subscriptions " +
                        "across all fabrics on the node.",
                },
                {
                    tag: "field",
                    id: 0x1,
                    name: "CurrentSubscriptionsForFabric",
                    type: "uint16",
                    conformance: "M",
                    details:
                        "This field shall indicate the number of currently-active Interaction Model subscriptions for " +
                        "the accessing fabric only. If no accessing fabric is available, this field shall be set to zero.",
                },
                {
                    tag: "field",
                    id: 0x2,
                    name: "TotalSubscriptionsEstablished",
                    type: "uint32",
                    conformance: "M",
                    details:
                        "This field shall indicate the total number of Interaction Model subscriptions successfully " +
                        "established across all fabrics on the node since start-up.",
                },
                {
                    tag: "field",
                    id: 0x3,
                    name: "TotalInteractionModelMessagesSent",
                    type: "uint32",
                    conformance: "M",
                    details:
                        "This field shall indicate the number of outgoing Interaction Model protocol messages sent since " +
                        "start-up, excluding any retries of such messages.",
                },
                {
                    tag: "field",
                    id: 0x4,
                    name: "TotalInteractionModelMessagesReceived",
                    type: "uint32",
                    conformance: "M",
                    details:
                        "This field shall indicate the number of incoming Interaction Model protocol messages received " +
                        "since start-up, excluding any retries of such messages.",
                },
            ],
        },

        // New attribute: DeviceLoadStatus (0x000A)
        // Quality "C" = omitChanges (changes but not pushed to subscribers)
        // Access R V = readable by any session without special access
        // Conformance: Rev >= v3 (mandatory from cluster revision 3 onwards)
        {
            tag: "attribute",
            id: 0x000a,
            name: "DeviceLoadStatus",
            type: "DeviceLoadStruct",
            access: "R V",
            quality: "C",
            conformance: "desc",
            details: "This attribute shall indicate the status of various resources used.",
        },
    ],
});
