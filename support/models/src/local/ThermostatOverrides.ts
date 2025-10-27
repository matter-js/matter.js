/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "@matter/model";
import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "Thermostat",
    asOf: "1.3",

    children: [
        // See comments in ChannelClusterOverrides.ts...  Another example of clusters illegally referencing structures
        // in other clusters
        {
            tag: "datatype",
            name: "OccupancyBitmap",
            type: "OccupancySensing.OccupancyBitmap",
            until: "1.3",
        },
        {
            tag: "attribute",
            id: 0x1b,
            name: "ControlSequenceOfOperation",
            default: FieldValue.None,
        },

        {
            tag: "command",
            name: "AtomicRequest",
            id: 0xfe,
            access: "O",
            direction: "request",
            response: "AtomicResponse",
            children: [
                {
                    tag: "field",
                    id: 0,
                    name: "RequestType",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        { tag: "field", name: "BeginWrite", id: 0 },
                        { tag: "field", name: "CommitWrite", id: 1 },
                        { tag: "field", name: "RollbackWrite", id: 2 },
                    ],
                },
                {
                    tag: "field",
                    id: 1,
                    name: "AttributeRequests",
                    type: "list",
                    conformance: "M",
                    children: [{ tag: "field", name: "entry", type: "attrib-id" }],
                },
                { tag: "field", id: 2, name: "Timeout", type: "uint16", conformance: "O" },
            ],
        },
        {
            tag: "command",
            name: "AtomicResponse",
            id: 0xfd,
            direction: "response",
            children: [
                {
                    tag: "field",
                    id: 0,
                    name: "StatusCode",
                    type: "status",
                    conformance: "M",
                },
                {
                    tag: "field",
                    id: 1,
                    name: "AttributeStatus",
                    type: "list",
                    conformance: "M",
                    children: [
                        {
                            tag: "field",
                            name: "entry",
                            type: "struct",
                            children: [
                                {
                                    tag: "field",
                                    id: 0,
                                    name: "AttributeId",
                                    type: "attrib-id",
                                    conformance: "M",
                                },
                                {
                                    tag: "field",
                                    id: 1,
                                    name: "StatusCode",
                                    type: "status",
                                    conformance: "M",
                                },
                            ],
                        },
                    ],
                },
                { tag: "field", id: 2, name: "Timeout", type: "uint16", conformance: "O" },
            ],
        },
    ],
});
