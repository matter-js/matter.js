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
    CommandElement as Command
} from "../../elements/index.js";

export const ThreadBorderRouterManagement = Cluster(
    { name: "ThreadBorderRouterManagement", id: 0x452 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PC", conformance: "O", constraint: "0", title: "PanChange" })
    ),
    Attribute(
        { name: "BorderRouterName", id: 0x0, type: "string", access: "R V", conformance: "M", constraint: "1 to 63" }
    ),
    Attribute({ name: "BorderAgentId", id: 0x1, type: "octstr", access: "R V", conformance: "M", constraint: "16" }),
    Attribute({ name: "ThreadVersion", id: 0x2, type: "uint16", access: "R V", conformance: "M", quality: "F" }),
    Attribute({ name: "InterfaceEnabled", id: 0x3, type: "bool", access: "R V", conformance: "M", quality: "N" }),
    Attribute({ name: "ActiveDatasetTimestamp", id: 0x4, type: "uint64", access: "R V", conformance: "M", quality: "X N" }),
    Attribute(
        { name: "PendingDatasetTimestamp", id: 0x5, type: "uint64", access: "R V", conformance: "M", quality: "X N" }
    ),
    Command({
        name: "GetActiveDatasetRequest", id: 0x0, access: "M", conformance: "M", direction: "request",
        response: "DatasetResponse"
    }),
    Command({
        name: "GetPendingDatasetRequest", id: 0x1, access: "M", conformance: "M", direction: "request",
        response: "DatasetResponse"
    }),
    Command(
        { name: "DatasetResponse", id: 0x2, conformance: "M", direction: "response" },
        Field({ name: "Dataset", id: 0x0, type: "octstr", conformance: "M", constraint: "max 254" })
    ),

    Command(
        {
            name: "SetActiveDatasetRequest", id: 0x3, access: "M T", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "ActiveDataset", id: 0x0, type: "octstr", conformance: "M", constraint: "max 254" }),
        Field({ name: "Breadcrumb", id: 0x1, type: "uint64", conformance: "O" })
    ),

    Command(
        {
            name: "SetPendingDatasetRequest", id: 0x4, access: "M T", conformance: "PC", direction: "request",
            response: "status"
        },
        Field({ name: "PendingDataset", id: 0x0, type: "octstr", conformance: "M", constraint: "max 254" })
    )
);

MatterDefinition.children.push(ThreadBorderRouterManagement);
