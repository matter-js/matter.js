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

export const ThreadNetworkDirectory = Cluster(
    { name: "ThreadNetworkDirectory", id: 0x453, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute({
        name: "PreferredExtendedPanId", id: 0x0, type: "octstr", access: "RW VM", conformance: "M",
        constraint: "8", quality: "X N"
    }),

    Attribute(
        {
            name: "ThreadNetworks", id: 0x1, type: "list", access: "R V", conformance: "M",
            constraint: "max threadNetworkTableSize", quality: "N"
        },
        Field({ name: "entry", type: "ThreadNetworkStruct" })
    ),

    Attribute({
        name: "ThreadNetworkTableSize", id: 0x2, type: "uint8", access: "R V", conformance: "M",
        constraint: "desc", quality: "F"
    }),
    Command(
        { name: "AddNetwork", id: 0x0, access: "M T", conformance: "M", direction: "request", response: "status" },
        Field({ name: "OperationalDataset", id: 0x0, type: "octstr", conformance: "M", constraint: "max 254" })
    ),
    Command(
        { name: "RemoveNetwork", id: 0x1, access: "M T", conformance: "M", direction: "request", response: "status" },
        Field({ name: "ExtendedPanId", id: 0x0, type: "octstr", conformance: "M", constraint: "8" })
    ),

    Command(
        {
            name: "GetOperationalDataset", id: 0x2, access: "M", conformance: "M", direction: "request",
            response: "OperationalDatasetResponse"
        },
        Field({ name: "ExtendedPanId", id: 0x0, type: "octstr", conformance: "M", constraint: "8" })
    ),

    Command(
        { name: "OperationalDatasetResponse", id: 0x3, conformance: "M", direction: "response" },
        Field({ name: "OperationalDataset", id: 0x0, type: "octstr", conformance: "M", constraint: "max 254" })
    ),

    Datatype(
        { name: "ThreadNetworkStruct", type: "struct" },
        Field({ name: "ExtendedPanId", id: 0x0, type: "octstr", conformance: "M", constraint: "8" }),
        Field({ name: "NetworkName", id: 0x1, type: "string", conformance: "M", constraint: "1 to 16" }),
        Field({ name: "Channel", id: 0x2, type: "uint16", conformance: "M" }),
        Field({ name: "ActiveTimestamp", id: 0x3, type: "uint64", conformance: "M" })
    )
);

MatterDefinition.children.push(ThreadNetworkDirectory);
