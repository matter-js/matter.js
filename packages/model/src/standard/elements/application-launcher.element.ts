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

export const ApplicationLauncher = Cluster(
    { name: "ApplicationLauncher", id: 0x50c, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "AP", constraint: "0", title: "ApplicationPlatform" })
    ),
    Attribute(
        { name: "CatalogList", id: 0x0, type: "list", access: "R V", conformance: "AP", quality: "N" },
        Field({ name: "entry", type: "uint16" })
    ),
    Attribute({
        name: "CurrentApp", id: 0x1, type: "ApplicationEPStruct", access: "R V", conformance: "O",
        constraint: "desc", default: null, quality: "X"
    }),

    Command(
        {
            name: "LaunchApp", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "LauncherResponse"
        },
        Field({ name: "Application", id: 0x0, type: "ApplicationStruct", conformance: "AP", constraint: "desc" }),
        Field({ name: "Data", id: 0x1, type: "octstr", conformance: "O" })
    ),

    Command(
        { name: "StopApp", id: 0x1, access: "O", conformance: "M", direction: "request", response: "LauncherResponse" },
        Field({ name: "Application", id: 0x0, type: "ApplicationStruct", conformance: "AP", constraint: "desc" })
    ),
    Command(
        { name: "HideApp", id: 0x2, access: "O", conformance: "M", direction: "request", response: "LauncherResponse" },
        Field({ name: "Application", id: 0x0, type: "ApplicationStruct", conformance: "AP", constraint: "desc" })
    ),
    Command(
        { name: "LauncherResponse", id: 0x3, conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M" }),
        Field({ name: "Data", id: 0x1, type: "octstr", conformance: "O" })
    ),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "AppNotAvailable", id: 0x1, conformance: "M" }),
        Field({ name: "SystemBusy", id: 0x2, conformance: "M" }),
        Field({ name: "PendingUserApproval", id: 0x3, conformance: "M" }),
        Field({ name: "Downloading", id: 0x4, conformance: "M" }),
        Field({ name: "Installing", id: 0x5, conformance: "M" })
    ),

    Datatype(
        { name: "ApplicationStruct", type: "struct" },
        Field({ name: "CatalogVendorId", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "ApplicationId", id: 0x1, type: "string", conformance: "M" })
    ),
    Datatype(
        { name: "ApplicationEPStruct", type: "struct" },
        Field({ name: "Application", id: 0x0, type: "ApplicationStruct", conformance: "M" }),
        Field({ name: "Endpoint", id: 0x1, type: "endpoint-no", conformance: "O" })
    )
);

MatterDefinition.children.push(ApplicationLauncher);
