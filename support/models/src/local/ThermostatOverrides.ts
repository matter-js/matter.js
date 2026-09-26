/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureMap, FieldValue } from "@matter/model";
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

        // TODO This is temporary and should be in a new "Global Commands" section later because in fact it is generically
        //  defined in the Matter Spec. Right now this is only used by Thermostat so we place it here for now.
        {
            tag: "command",
            name: "AtomicRequest",
            id: 0xfe,
            access: "O",
            conformance: "PRES | MSCH",
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
        // The MatterScheduleConfiguration feature is provisional in fact although the specification does not mark it,
        // so the feature and the attributes it makes mandatory are marked provisional
        {
            tag: "attribute",
            id: FeatureMap.id,
            name: FeatureMap.name,
            // Feature fields merge by bit (the constraint), which needs the bitmap type and the bit
            type: "FeatureMap",
            children: [{ tag: "field", name: "MSCH", constraint: "7", conformance: "P, O", asOf: "1.4" }],
        },
        { tag: "attribute", id: 0x49, name: "ScheduleTypes", conformance: "P, MSCH", asOf: "1.4" },
        { tag: "attribute", id: 0x4b, name: "NumberOfSchedules", conformance: "P, MSCH", asOf: "1.4" },
        { tag: "attribute", id: 0x4c, name: "NumberOfScheduleTransitions", conformance: "P, MSCH", asOf: "1.4" },
        { tag: "attribute", id: 0x4d, name: "NumberOfScheduleTransitionPerDay", conformance: "P, MSCH", asOf: "1.4" },
        { tag: "attribute", id: 0x4f, name: "ActiveScheduleHandle", conformance: "P, MSCH", asOf: "1.4" },
        { tag: "attribute", id: 0x51, name: "Schedules", conformance: "P, MSCH", asOf: "1.4" },
    ],
});
