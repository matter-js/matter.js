/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    AttributeElement as Attribute,
    ClusterElement as Cluster,
    CommandElement as Command,
    DatatypeElement as Datatype,
    EventElement as Event,
    FieldElement as Field,
    MatterElement as Matter,
} from "@matter/model";

export const ChipMatter = Matter({
    name: "ChipMatter",

    children: [
        Cluster({
            name: "AccessControl",
            id: 0x1f,
            description: "Access Control",
            details:
                "The Access Control Cluster exposes a data model view of a Node's Access Control List (ACL), which " +
                "codifies the rules used to manage and enforce Access Control for the Node's endpoints and their " +
                "associated cluster instances.",

            children: [
                Attribute({
                    name: "Acl",
                    id: 0x0,
                    type: "list",
                    access: "RW A",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "AccessControlEntryStruct" })],
                }),
                Attribute({
                    name: "Extension",
                    id: 0x1,
                    type: "list",
                    access: "RW A",
                    conformance: "O",
                    children: [Field({ name: "entry", type: "AccessControlExtensionStruct" })],
                }),
                Attribute({
                    name: "SubjectsPerAccessControlEntry",
                    id: 0x2,
                    type: "uint16",
                    access: "R V",
                    conformance: "M",
                }),
                Attribute({
                    name: "TargetsPerAccessControlEntry",
                    id: 0x3,
                    type: "uint16",
                    access: "R V",
                    conformance: "M",
                }),
                Attribute({
                    name: "AccessControlEntriesPerFabric",
                    id: 0x4,
                    type: "uint16",
                    access: "R V",
                    conformance: "M",
                }),

                Event({
                    name: "AccessControlEntryChanged",
                    id: 0x0,
                    access: "R S A",
                    conformance: "M",
                    priority: "info",

                    children: [
                        Field({ name: "AdminNodeId", id: 0x1, type: "node-id", conformance: "M", quality: "X" }),
                        Field({ name: "AdminPasscodeId", id: 0x2, type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "ChangeType", id: 0x3, type: "ChangeTypeEnum", conformance: "M" }),
                        Field({
                            name: "LatestValue",
                            id: 0x4,
                            type: "AccessControlEntryStruct",
                            conformance: "M",
                            quality: "X",
                        }),
                    ],
                }),

                Event({
                    name: "AccessControlExtensionChanged",
                    id: 0x1,
                    access: "R S A",
                    conformance: "M",
                    priority: "info",

                    children: [
                        Field({ name: "AdminNodeId", id: 0x1, type: "node-id", conformance: "M", quality: "X" }),
                        Field({ name: "AdminPasscodeId", id: 0x2, type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "ChangeType", id: 0x3, type: "ChangeTypeEnum", conformance: "M" }),
                        Field({
                            name: "LatestValue",
                            id: 0x4,
                            type: "AccessControlExtensionStruct",
                            conformance: "M",
                            quality: "X",
                        }),
                    ],
                }),

                Datatype({
                    name: "AccessControlEntryStruct",
                    type: "struct",
                    access: "R F",
                    conformance: "M",

                    children: [
                        Field({
                            name: "Privilege",
                            id: 0x1,
                            type: "AccessControlEntryPrivilegeEnum",
                            access: "R S",
                            conformance: "M",
                        }),
                        Field({
                            name: "AuthMode",
                            id: 0x2,
                            type: "AccessControlEntryAuthModeEnum",
                            access: "R S",
                            conformance: "M",
                        }),
                        Field({
                            name: "Subjects",
                            id: 0x3,
                            type: "list",
                            access: "R S",
                            conformance: "M",
                            quality: "X",
                            children: [Field({ name: "entry", type: "uint64" })],
                        }),
                        Field({
                            name: "Targets",
                            id: 0x4,
                            type: "list",
                            access: "R S",
                            conformance: "M",
                            quality: "X",
                            children: [Field({ name: "entry", type: "Target" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "AccessControlEntryPrivilegeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "View", id: 0x1, conformance: "M" }),
                        Field({ name: "ProxyView", id: 0x2, conformance: "M" }),
                        Field({ name: "Operate", id: 0x3, conformance: "M" }),
                        Field({ name: "Manage", id: 0x4, conformance: "M" }),
                        Field({ name: "Administer", id: 0x5, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "AccessControlEntryAuthModeEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Pase", id: 0x1, conformance: "M" }),
                        Field({ name: "Case", id: 0x2, conformance: "M" }),
                        Field({ name: "Group", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "Target",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Cluster", id: 0x0, type: "cluster-id", conformance: "M", quality: "X" }),
                        Field({ name: "Endpoint", id: 0x1, type: "endpoint-no", conformance: "M", quality: "X" }),
                        Field({ name: "DeviceType", id: 0x2, type: "devtype-id", conformance: "M", quality: "X" }),
                    ],
                }),

                Datatype({
                    name: "AccessControlExtensionStruct",
                    type: "struct",
                    access: "R F",
                    conformance: "M",
                    children: [Field({ name: "Data", id: 0x1, type: "octstr", access: "R S", conformance: "M" })],
                }),

                Datatype({
                    name: "ChangeTypeEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Changed", id: 0x0, conformance: "M" }),
                        Field({ name: "Added", id: 0x1, conformance: "M" }),
                        Field({ name: "Removed", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "AccountLogin",
            id: 0x50e,
            description: "Account Login",
            details:
                "This cluster provides commands that facilitate user account login on a Content App or a node. For " +
                "example, a Content App running on a Video Player device, which is represented as an endpoint (see " +
                "[TV Architecture]), can use this cluster to help make the user account on the Content App match the " +
                "user account on the Client.",

            children: [
                Command({
                    name: "GetSetupPin",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    response: "GetSetupPinResponse",
                    children: [
                        Field({
                            name: "TempAccountIdentifier",
                            type: "string",
                            conformance: "M",
                            constraint: "max 100",
                        }),
                    ],
                }),

                Command({
                    name: "Login",
                    id: 0x2,
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({
                            name: "TempAccountIdentifier",
                            type: "string",
                            conformance: "M",
                            constraint: "max 100",
                        }),
                        Field({ name: "SetupPin", type: "string", conformance: "M" }),
                    ],
                }),

                Command({ name: "Logout", id: 0x3, conformance: "M", direction: "request" }),
                Command({
                    name: "GetSetupPinResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",
                    children: [Field({ name: "SetupPin", type: "string", conformance: "M" })],
                }),
            ],
        }),

        Cluster({
            name: "Actions",
            id: 0x25,
            description: "Actions",
            details:
                "This cluster provides a standardized way for a Node (typically a Bridge, but could be any Node) to " +
                "expose action information.",

            children: [
                Attribute({
                    name: "ActionList",
                    id: 0x0,
                    type: "list",
                    conformance: "M",
                    constraint: "max 256",
                    children: [Field({ name: "entry", type: "ActionStruct" })],
                }),
                Attribute({
                    name: "EndpointList",
                    id: 0x1,
                    type: "list",
                    conformance: "M",
                    constraint: "max 256",
                    children: [Field({ name: "entry", type: "EndpointListStruct" })],
                }),
                Attribute({ name: "SetupUrl", id: 0x2, type: "string", conformance: "O", constraint: "max 512" }),

                Command({
                    name: "InstantAction",
                    id: 0x0,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "InstantActionWithTransition",
                    id: 0x1,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "StartAction",
                    id: 0x2,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "StartActionWithDuration",
                    id: 0x3,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                        Field({ name: "Duration", type: "uint32", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "StopAction",
                    id: 0x4,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "PauseAction",
                    id: 0x5,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "PauseActionWithDuration",
                    id: 0x6,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                        Field({ name: "Duration", type: "uint32", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "ResumeAction",
                    id: 0x7,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "EnableAction",
                    id: 0x8,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "EnableActionWithDuration",
                    id: 0x9,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                        Field({ name: "Duration", type: "uint32", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "DisableAction",
                    id: 0xa,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "DisableActionWithDuration",
                    id: 0xb,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", type: "uint32", conformance: "O" }),
                        Field({ name: "Duration", type: "uint32", conformance: "M" }),
                    ],
                }),

                Event({
                    name: "StateChanged",
                    id: 0x0,
                    conformance: "M",
                    priority: "info",
                    children: [
                        Field({ name: "ActionId", id: 0x0, type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", id: 0x1, type: "uint32", conformance: "M" }),
                        Field({ name: "NewState", id: 0x2, type: "ActionStateEnum", conformance: "M" }),
                    ],
                }),

                Event({
                    name: "ActionFailed",
                    id: 0x1,
                    conformance: "M",
                    priority: "info",

                    children: [
                        Field({ name: "ActionId", id: 0x0, type: "uint16", conformance: "M" }),
                        Field({ name: "InvokeId", id: 0x1, type: "uint32", conformance: "M" }),
                        Field({ name: "NewState", id: 0x2, type: "ActionStateEnum", conformance: "M" }),
                        Field({ name: "Error", id: 0x3, type: "ActionErrorEnum", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ActionStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "ActionId", type: "uint16", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "M", constraint: "max 32" }),
                        Field({ name: "Type", type: "ActionTypeEnum", conformance: "M" }),
                        Field({ name: "EndpointListId", type: "uint16", conformance: "M" }),
                        Field({ name: "SupportedCommands", type: "CommandBits", conformance: "M" }),
                        Field({ name: "State", type: "ActionStateEnum", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ActionTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Other", id: 0x0, conformance: "M" }),
                        Field({ name: "Scene", id: 0x1, conformance: "M" }),
                        Field({ name: "Sequence", id: 0x2, conformance: "M" }),
                        Field({ name: "Automation", id: 0x3, conformance: "M" }),
                        Field({ name: "Exception", id: 0x4, conformance: "M" }),
                        Field({ name: "Notification", id: 0x5, conformance: "M" }),
                        Field({ name: "Alarm", id: 0x6, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "CommandBits",
                    type: "map16",
                    conformance: "M",

                    children: [
                        Field({ name: "InstantAction", constraint: "0" }),
                        Field({ name: "InstantActionWithTransition", constraint: "1" }),
                        Field({ name: "StartAction", constraint: "2" }),
                        Field({ name: "StartActionWithDuration", constraint: "3" }),
                        Field({ name: "StopAction", constraint: "4" }),
                        Field({ name: "PauseAction", constraint: "5" }),
                        Field({ name: "PauseActionWithDuration", constraint: "6" }),
                        Field({ name: "ResumeAction", constraint: "7" }),
                        Field({ name: "EnableAction", constraint: "8" }),
                        Field({ name: "EnableActionWithDuration", constraint: "9" }),
                        Field({ name: "DisableAction", constraint: "10" }),
                        Field({ name: "DisableActionWithDuration", constraint: "11" }),
                    ],
                }),

                Datatype({
                    name: "ActionStateEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Inactive", id: 0x0, conformance: "M" }),
                        Field({ name: "Active", id: 0x1, conformance: "M" }),
                        Field({ name: "Paused", id: 0x2, conformance: "M" }),
                        Field({ name: "Disabled", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "EndpointListStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "EndpointListId", type: "uint16", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "M", constraint: "max 32" }),
                        Field({ name: "Type", type: "EndpointListTypeEnum", conformance: "M" }),
                        Field({
                            name: "Endpoints",
                            type: "list",
                            conformance: "M",
                            constraint: "max 256",
                            children: [Field({ name: "entry", type: "endpoint-no" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "EndpointListTypeEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Other", id: 0x0, conformance: "M" }),
                        Field({ name: "Room", id: 0x1, conformance: "M" }),
                        Field({ name: "Zone", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ActionErrorEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Unknown", id: 0x0, conformance: "M" }),
                        Field({ name: "Interrupted", id: 0x1, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "AdministratorCommissioning",
            id: 0x3c,
            description: "Administrator Commissioning",
            details: "Commands to trigger a Node to allow a new Administrator to commission it.",

            children: [
                Attribute({ name: "WindowStatus", id: 0x0, type: "CommissioningWindowStatusEnum", conformance: "M" }),
                Attribute({ name: "AdminFabricIndex", id: 0x1, type: "fabric-idx", conformance: "M", quality: "X" }),
                Attribute({ name: "AdminVendorId", id: 0x2, type: "uint16", conformance: "M", quality: "X" }),

                Command({
                    name: "OpenCommissioningWindow",
                    id: 0x0,
                    access: "R A",
                    conformance: "M",
                    direction: "request",

                    children: [
                        Field({ name: "CommissioningTimeout", type: "uint16", conformance: "M" }),
                        Field({ name: "PakePasscodeVerifier", type: "octstr", conformance: "M" }),
                        Field({ name: "Discriminator", type: "uint16", conformance: "M" }),
                        Field({ name: "Iterations", type: "uint32", conformance: "M" }),
                        Field({ name: "Salt", type: "octstr", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "OpenBasicCommissioningWindow",
                    id: 0x1,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "CommissioningTimeout", type: "uint16", conformance: "M" })],
                }),
                Command({
                    name: "RevokeCommissioning",
                    id: 0x2,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                }),

                Datatype({
                    name: "CommissioningWindowStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "WindowNotOpen", id: 0x0, conformance: "M" }),
                        Field({ name: "EnhancedWindowOpen", id: 0x1, conformance: "M" }),
                        Field({ name: "BasicWindowOpen", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "ApplicationBasic",
            id: 0x50d,
            description: "Application Basic",
            details:
                "This cluster provides information about an application running on a TV or media player device which " +
                "is represented as an endpoint.",

            children: [
                Attribute({
                    name: "ApplicationVendorName",
                    id: 0x0,
                    type: "string",
                    conformance: "O",
                    constraint: "max 32",
                    default: "",
                }),
                Attribute({ name: "ApplicationVendorId", id: 0x1, type: "vendor-id", conformance: "O", default: 0 }),
                Attribute({ name: "ApplicationName", id: 0x2, type: "string", conformance: "M", constraint: "max 32" }),
                Attribute({ name: "ApplicationProductId", id: 0x3, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "ApplicationApp", id: 0x4, type: "ApplicationStruct", conformance: "M" }),
                Attribute({
                    name: "ApplicationStatus",
                    id: 0x5,
                    type: "ApplicationStatusEnum",
                    conformance: "M",
                    default: 1,
                }),
                Attribute({
                    name: "ApplicationVersion",
                    id: 0x6,
                    type: "string",
                    conformance: "M",
                    constraint: "max 32",
                }),
                Attribute({
                    name: "ApplicationAllowedVendorList",
                    id: 0x7,
                    type: "list",
                    conformance: "M",
                    constraint: "max 32",
                    children: [Field({ name: "entry", type: "vendor-id" })],
                }),

                Datatype({
                    name: "ApplicationStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "CatalogVendorId", type: "uint16", conformance: "M" }),
                        Field({ name: "ApplicationId", type: "string", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ApplicationStatusEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Stopped", id: 0x0, conformance: "M" }),
                        Field({ name: "ActiveVisibleFocus", id: 0x1, conformance: "M" }),
                        Field({ name: "ActiveHidden", id: 0x2, conformance: "M" }),
                        Field({ name: "ActiveVisibleNotFocus", id: 0x3, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "ApplicationLauncher",
            id: 0x50c,
            description: "Application Launcher",
            details:
                "This cluster provides an interface for launching content on a media player device such as a TV or " +
                "Speaker.",

            children: [
                Attribute({
                    name: "ApplicationLauncherList",
                    id: 0x0,
                    type: "list",
                    conformance: "O",
                    constraint: "max 254",
                    quality: "P",
                    children: [Field({ name: "entry", type: "uint16" })],
                }),
                Attribute({
                    name: "ApplicationLauncherCurrentApp",
                    id: 0x1,
                    type: "ApplicationEpStruct",
                    access: "RW",
                    conformance: "O",
                    default: null,
                    quality: "X",
                }),

                Command({
                    name: "LaunchApp",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    response: "LauncherResponse",
                    children: [
                        Field({ name: "Application", type: "ApplicationStruct", conformance: "O" }),
                        Field({ name: "Data", type: "octstr", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "StopApp",
                    id: 0x1,
                    conformance: "M",
                    direction: "request",
                    response: "LauncherResponse",
                    children: [Field({ name: "Application", type: "ApplicationStruct", conformance: "O" })],
                }),
                Command({
                    name: "HideApp",
                    id: 0x2,
                    conformance: "M",
                    direction: "request",
                    response: "LauncherResponse",
                    children: [Field({ name: "Application", type: "ApplicationStruct", conformance: "O" })],
                }),

                Command({
                    name: "LauncherResponse",
                    id: 0x3,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "ApplicationLauncherStatusEnum", conformance: "M" }),
                        Field({ name: "Data", type: "octstr", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "ApplicationEpStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Application", type: "ApplicationStruct", conformance: "M" }),
                        Field({ name: "Endpoint", type: "endpoint-no", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "ApplicationStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "CatalogVendorId", type: "uint16", conformance: "M" }),
                        Field({ name: "ApplicationId", type: "string", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ApplicationLauncherStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "AppNotAvailable", id: 0x1, conformance: "M" }),
                        Field({ name: "SystemBusy", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "AudioOutput",
            id: 0x50b,
            description: "Audio Output",
            details: "This cluster provides an interface for controlling the Output on a media device such as a TV.",

            children: [
                Attribute({
                    name: "AudioOutputList",
                    id: 0x0,
                    type: "list",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "OutputInfoStruct" })],
                }),
                Attribute({ name: "AudioOutputCurrentOutput", id: 0x1, type: "uint8", conformance: "O", default: 0 }),
                Command({
                    name: "SelectOutput",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "Index", type: "uint8", conformance: "M" })],
                }),

                Command({
                    name: "RenameOutput",
                    id: 0x1,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "Index", type: "uint8", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OutputInfoStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Index", type: "uint8", conformance: "M" }),
                        Field({ name: "OutputType", type: "OutputTypeEnum", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "M", constraint: "max 32" }),
                    ],
                }),

                Datatype({
                    name: "OutputTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Hdmi", id: 0x0, conformance: "M" }),
                        Field({ name: "Bt", id: 0x1, conformance: "M" }),
                        Field({ name: "Optical", id: 0x2, conformance: "M" }),
                        Field({ name: "Headphone", id: 0x3, conformance: "M" }),
                        Field({ name: "Internal", id: 0x4, conformance: "M" }),
                        Field({ name: "Other", id: 0x5, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "BallastConfiguration",
            id: 0x301,
            description: "Ballast Configuration",
            details: "Attributes and commands for configuring a lighting ballast.",

            children: [
                Attribute({
                    name: "PhysicalMinLevel",
                    id: 0x0,
                    type: "uint8",
                    conformance: "M",
                    constraint: "1 to 254",
                    default: 1,
                }),
                Attribute({
                    name: "PhysicalMaxLevel",
                    id: 0x1,
                    type: "uint8",
                    conformance: "M",
                    constraint: "1 to 254",
                    default: 0,
                }),

                Attribute({
                    name: "BallastStatus",
                    id: 0x2,
                    type: "map8",
                    conformance: "O",
                    default: 0,
                    children: [
                        Field({ name: "NonOperational", constraint: "0" }),
                        Field({ name: "LampNotInSocket", constraint: "1" }),
                    ],
                }),

                Attribute({
                    name: "MinLevel",
                    id: 0x10,
                    type: "uint8",
                    access: "RW",
                    conformance: "M",
                    constraint: "1 to 254",
                    default: 1,
                }),
                Attribute({
                    name: "MaxLevel",
                    id: 0x11,
                    type: "uint8",
                    access: "RW",
                    conformance: "M",
                    constraint: "1 to 254",
                    default: 0,
                }),
                Attribute({
                    name: "IntrinsicBallastFactor",
                    id: 0x14,
                    type: "uint8",
                    access: "RW",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "BallastFactorAdjustment",
                    id: 0x15,
                    type: "uint8",
                    access: "RW",
                    conformance: "O",
                    constraint: "min 100",
                    default: 0,
                    quality: "X",
                }),
                Attribute({ name: "LampQuantity", id: 0x20, type: "uint8", conformance: "M" }),
                Attribute({
                    name: "LampType",
                    id: 0x30,
                    type: "string",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 16",
                }),
                Attribute({
                    name: "LampManufacturer",
                    id: 0x31,
                    type: "string",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 16",
                }),
                Attribute({
                    name: "LampRatedHours",
                    id: 0x32,
                    type: "uint24",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "LampBurnHours",
                    id: 0x33,
                    type: "uint24",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "LampAlarmMode",
                    id: 0x34,
                    type: "map8",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                    children: [Field({ name: "lampBurnHours", constraint: "0" })],
                }),
                Attribute({
                    name: "LampBurnHoursTripPoint",
                    id: 0x35,
                    type: "uint24",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
            ],
        }),

        Cluster({
            name: "BasicInformation",
            id: 0x28,
            description: "Basic Information",
            quality: "I",
            details:
                "This cluster provides attributes and events for determining basic information about Nodes, which " +
                "supports both Commissioning and operational determination of Node characteristics, such as Vendor " +
                "ID, Product ID and serial number, which apply to the whole Node. Also allows setting user device " +
                "information such as location.",

            children: [
                Attribute({ name: "DataModelRevision", id: 0x0, type: "uint16", conformance: "M" }),
                Attribute({ name: "VendorName", id: 0x1, type: "string", conformance: "M", constraint: "max 32" }),
                Attribute({ name: "VendorId", id: 0x2, type: "vendor-id", conformance: "M" }),
                Attribute({ name: "ProductName", id: 0x3, type: "string", conformance: "M", constraint: "max 32" }),
                Attribute({ name: "ProductId", id: 0x4, type: "uint16", conformance: "M" }),
                Attribute({
                    name: "NodeLabel",
                    id: 0x5,
                    type: "string",
                    access: "RW VM",
                    conformance: "M",
                    constraint: "max 32",
                    default: "",
                }),
                Attribute({
                    name: "Location",
                    id: 0x6,
                    type: "string",
                    access: "RW VA",
                    conformance: "M",
                    constraint: "max 2",
                    default: "XX",
                }),
                Attribute({ name: "HardwareVersion", id: 0x7, type: "uint16", conformance: "M", default: 0 }),
                Attribute({
                    name: "HardwareVersionString",
                    id: 0x8,
                    type: "string",
                    conformance: "M",
                    constraint: "max 64",
                }),
                Attribute({ name: "SoftwareVersion", id: 0x9, type: "uint32", conformance: "M", default: 0 }),
                Attribute({
                    name: "SoftwareVersionString",
                    id: 0xa,
                    type: "string",
                    conformance: "M",
                    constraint: "max 64",
                }),
                Attribute({
                    name: "ManufacturingDate",
                    id: 0xb,
                    type: "string",
                    conformance: "O",
                    constraint: "max 16",
                }),
                Attribute({ name: "PartNumber", id: 0xc, type: "string", conformance: "O", constraint: "max 32" }),
                Attribute({ name: "ProductUrl", id: 0xd, type: "string", conformance: "O", constraint: "max 256" }),
                Attribute({ name: "ProductLabel", id: 0xe, type: "string", conformance: "O", constraint: "max 64" }),
                Attribute({ name: "SerialNumber", id: 0xf, type: "string", conformance: "O", constraint: "max 32" }),
                Attribute({
                    name: "LocalConfigDisabled",
                    id: 0x10,
                    type: "bool",
                    access: "RW VM",
                    conformance: "O",
                    default: true,
                }),
                Attribute({ name: "Reachable", id: 0x11, type: "bool", conformance: "O", default: true }),
                Attribute({ name: "UniqueId", id: 0x12, type: "string", conformance: "O", constraint: "max 32" }),
                Attribute({ name: "CapabilityMinima", id: 0x13, type: "CapabilityMinimaStruct", conformance: "M" }),
                Attribute({ name: "ProductAppearance", id: 0x14, type: "ProductAppearanceStruct", conformance: "O" }),
                Event({
                    name: "StartUp",
                    id: 0x0,
                    conformance: "M",
                    priority: "critical",
                    children: [Field({ name: "SoftwareVersion", id: 0x0, type: "uint32", conformance: "M" })],
                }),
                Event({ name: "ShutDown", id: 0x1, conformance: "O", priority: "critical" }),
                Event({
                    name: "Leave",
                    id: 0x2,
                    conformance: "O",
                    priority: "info",
                    children: [Field({ name: "FabricIndex", id: 0x0, type: "fabric-idx", conformance: "M" })],
                }),
                Event({
                    name: "ReachableChanged",
                    id: 0x3,
                    conformance: "O",
                    priority: "info",
                    children: [Field({ name: "ReachableNewValue", id: 0x0, type: "bool", conformance: "M" })],
                }),

                Datatype({
                    name: "CapabilityMinimaStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "CaseSessionsPerFabric", id: 0x0, type: "uint16", conformance: "M" }),
                        Field({ name: "SubscriptionsPerFabric", id: 0x1, type: "uint16", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ProductAppearanceStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Finish", id: 0x0, type: "ProductFinishEnum", conformance: "M" }),
                        Field({ name: "PrimaryColor", id: 0x1, type: "ColorEnum", conformance: "M", quality: "X" }),
                    ],
                }),

                Datatype({
                    name: "ProductFinishEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Other", id: 0x0, conformance: "M" }),
                        Field({ name: "Matte", id: 0x1, conformance: "M" }),
                        Field({ name: "Satin", id: 0x2, conformance: "M" }),
                        Field({ name: "Polished", id: 0x3, conformance: "M" }),
                        Field({ name: "Rugged", id: 0x4, conformance: "M" }),
                        Field({ name: "Fabric", id: 0x5, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ColorEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Black", id: 0x0, conformance: "M" }),
                        Field({ name: "Navy", id: 0x1, conformance: "M" }),
                        Field({ name: "Green", id: 0x2, conformance: "M" }),
                        Field({ name: "Teal", id: 0x3, conformance: "M" }),
                        Field({ name: "Maroon", id: 0x4, conformance: "M" }),
                        Field({ name: "Purple", id: 0x5, conformance: "M" }),
                        Field({ name: "Olive", id: 0x6, conformance: "M" }),
                        Field({ name: "Gray", id: 0x7, conformance: "M" }),
                        Field({ name: "Blue", id: 0x8, conformance: "M" }),
                        Field({ name: "Lime", id: 0x9, conformance: "M" }),
                        Field({ name: "Aqua", id: 0xa, conformance: "M" }),
                        Field({ name: "Red", id: 0xb, conformance: "M" }),
                        Field({ name: "Fuchsia", id: 0xc, conformance: "M" }),
                        Field({ name: "Yellow", id: 0xd, conformance: "M" }),
                        Field({ name: "White", id: 0xe, conformance: "M" }),
                        Field({ name: "Nickel", id: 0xf, conformance: "M" }),
                        Field({ name: "Chrome", id: 0x10, conformance: "M" }),
                        Field({ name: "Brass", id: 0x11, conformance: "M" }),
                        Field({ name: "Copper", id: 0x12, conformance: "M" }),
                        Field({ name: "Silver", id: 0x13, conformance: "M" }),
                        Field({ name: "Gold", id: 0x14, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "Binding",
            id: 0x1e,
            description: "Binding",
            details:
                "The Binding Cluster is meant to replace the support from the Zigbee Device Object (ZDO) for " +
                "supporting the binding table.",

            children: [
                Attribute({
                    name: "BindingList",
                    id: 0x0,
                    type: "list",
                    access: "RW",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "TargetStruct" })],
                }),

                Datatype({
                    name: "TargetStruct",
                    type: "struct",
                    access: "R F",
                    conformance: "M",

                    children: [
                        Field({ name: "Node", id: 0x1, type: "node-id", conformance: "O" }),
                        Field({ name: "Group", id: 0x2, type: "group-id", conformance: "O" }),
                        Field({ name: "Endpoint", id: 0x3, type: "endpoint-no", conformance: "O" }),
                        Field({ name: "Cluster", id: 0x4, type: "cluster-id", conformance: "O" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "BooleanState",
            id: 0x45,
            description: "Boolean State",
            details: "This cluster provides an interface to a boolean state called StateValue.",

            children: [
                Attribute({ name: "StateValue", id: 0x0, type: "bool", conformance: "M", quality: "P" }),
                Event({
                    name: "StateChange",
                    id: 0x0,
                    conformance: "M",
                    priority: "info",
                    children: [Field({ name: "StateValue", id: 0x0, type: "bool", conformance: "M" })],
                }),
            ],
        }),

        Cluster({
            name: "BridgedDeviceBasicInformation",
            id: 0x39,
            description: "Bridged Device Basic Information",
            details:
                "This Cluster serves two purposes towards a Node communicating with a Bridge: indicate that the " +
                "functionality on the Endpoint where it is placed (and its Parts) is bridged from a non-CHIP " +
                "technology; and provide a centralized collection of attributes that the Node MAY collect to aid in " +
                "conveying information regarding the Bridged Device to a user, such as the vendor name, the model " +
                "name, or user-assigned name.",

            children: [
                Attribute({ name: "VendorName", id: 0x1, type: "string", conformance: "O", constraint: "max 32" }),
                Attribute({ name: "VendorId", id: 0x2, type: "vendor-id", conformance: "O" }),
                Attribute({ name: "ProductName", id: 0x3, type: "string", conformance: "O", constraint: "max 32" }),
                Attribute({
                    name: "NodeLabel",
                    id: 0x5,
                    type: "string",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 32",
                    default: "",
                }),
                Attribute({ name: "HardwareVersion", id: 0x7, type: "uint16", conformance: "O", default: 0 }),
                Attribute({
                    name: "HardwareVersionString",
                    id: 0x8,
                    type: "string",
                    conformance: "O",
                    constraint: "max 64",
                }),
                Attribute({ name: "SoftwareVersion", id: 0x9, type: "uint32", conformance: "O", default: 0 }),
                Attribute({
                    name: "SoftwareVersionString",
                    id: 0xa,
                    type: "string",
                    conformance: "O",
                    constraint: "max 64",
                }),
                Attribute({
                    name: "ManufacturingDate",
                    id: 0xb,
                    type: "string",
                    conformance: "O",
                    constraint: "max 16",
                }),
                Attribute({ name: "PartNumber", id: 0xc, type: "string", conformance: "O", constraint: "max 32" }),
                Attribute({ name: "ProductUrl", id: 0xd, type: "string", conformance: "O", constraint: "max 256" }),
                Attribute({ name: "ProductLabel", id: 0xe, type: "string", conformance: "O", constraint: "max 64" }),
                Attribute({ name: "SerialNumber", id: 0xf, type: "string", conformance: "O", constraint: "max 32" }),
                Attribute({ name: "Reachable", id: 0x11, type: "bool", conformance: "M", default: true }),
                Attribute({ name: "UniqueId", id: 0x12, type: "string", conformance: "O", constraint: "max 32" }),
                Attribute({ name: "ProductAppearance", id: 0x14, type: "ProductAppearanceStruct", conformance: "O" }),
                Event({
                    name: "StartUp",
                    id: 0x0,
                    conformance: "O",
                    priority: "critical",
                    children: [Field({ name: "SoftwareVersion", id: 0x0, type: "uint32", conformance: "M" })],
                }),
                Event({ name: "ShutDown", id: 0x1, conformance: "O", priority: "critical" }),
                Event({ name: "Leave", id: 0x2, conformance: "O", priority: "info" }),
                Event({
                    name: "ReachableChanged",
                    id: 0x3,
                    conformance: "M",
                    priority: "info",
                    children: [Field({ name: "ReachableNewValue", id: 0x0, type: "bool", conformance: "M" })],
                }),

                Datatype({
                    name: "ProductAppearanceStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Finish", id: 0x0, type: "ProductFinishEnum", conformance: "M" }),
                        Field({ name: "PrimaryColor", id: 0x1, type: "ColorEnum", conformance: "M", quality: "X" }),
                    ],
                }),

                Datatype({
                    name: "ProductFinishEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Other", id: 0x0, conformance: "M" }),
                        Field({ name: "Matte", id: 0x1, conformance: "M" }),
                        Field({ name: "Satin", id: 0x2, conformance: "M" }),
                        Field({ name: "Polished", id: 0x3, conformance: "M" }),
                        Field({ name: "Rugged", id: 0x4, conformance: "M" }),
                        Field({ name: "Fabric", id: 0x5, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ColorEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Black", id: 0x0, conformance: "M" }),
                        Field({ name: "Navy", id: 0x1, conformance: "M" }),
                        Field({ name: "Green", id: 0x2, conformance: "M" }),
                        Field({ name: "Teal", id: 0x3, conformance: "M" }),
                        Field({ name: "Maroon", id: 0x4, conformance: "M" }),
                        Field({ name: "Purple", id: 0x5, conformance: "M" }),
                        Field({ name: "Olive", id: 0x6, conformance: "M" }),
                        Field({ name: "Gray", id: 0x7, conformance: "M" }),
                        Field({ name: "Blue", id: 0x8, conformance: "M" }),
                        Field({ name: "Lime", id: 0x9, conformance: "M" }),
                        Field({ name: "Aqua", id: 0xa, conformance: "M" }),
                        Field({ name: "Red", id: 0xb, conformance: "M" }),
                        Field({ name: "Fuchsia", id: 0xc, conformance: "M" }),
                        Field({ name: "Yellow", id: 0xd, conformance: "M" }),
                        Field({ name: "White", id: 0xe, conformance: "M" }),
                        Field({ name: "Nickel", id: 0xf, conformance: "M" }),
                        Field({ name: "Chrome", id: 0x10, conformance: "M" }),
                        Field({ name: "Brass", id: 0x11, conformance: "M" }),
                        Field({ name: "Copper", id: 0x12, conformance: "M" }),
                        Field({ name: "Silver", id: 0x13, conformance: "M" }),
                        Field({ name: "Gold", id: 0x14, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "Channel",
            id: 0x504,
            description: "Channel",
            details: "This cluster provides an interface for controlling the current Channel on a device.",

            children: [
                Attribute({
                    name: "ChannelList",
                    id: 0x0,
                    type: "list",
                    conformance: "O",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "ChannelInfoStruct" })],
                }),
                Attribute({
                    name: "ChannelLineup",
                    id: 0x1,
                    type: "LineupInfoStruct",
                    conformance: "O",
                    default: null,
                    quality: "X",
                }),
                Attribute({
                    name: "ChannelCurrentChannel",
                    id: 0x2,
                    type: "ChannelInfoStruct",
                    conformance: "O",
                    default: null,
                    quality: "X",
                }),
                Command({
                    name: "ChangeChannel",
                    id: 0x0,
                    conformance: "O",
                    direction: "request",
                    response: "ChangeChannelResponse",
                    children: [Field({ name: "Match", type: "string", conformance: "M" })],
                }),

                Command({
                    name: "ChangeChannelByNumber",
                    id: 0x2,
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "MajorNumber", type: "uint16", conformance: "M" }),
                        Field({ name: "MinorNumber", type: "uint16", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "SkipChannel",
                    id: 0x3,
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "Count", type: "uint16", conformance: "M" })],
                }),

                Command({
                    name: "ChangeChannelResponse",
                    id: 0x1,
                    conformance: "O",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "ChannelStatusEnum", conformance: "M" }),
                        Field({ name: "Data", type: "string", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "ChannelInfoStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "MajorNumber", type: "uint16", conformance: "M" }),
                        Field({ name: "MinorNumber", type: "uint16", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "O" }),
                        Field({ name: "CallSign", type: "string", conformance: "O" }),
                        Field({ name: "AffiliateCallSign", type: "string", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "LineupInfoStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "OperatorName", type: "string", conformance: "M" }),
                        Field({ name: "LineupName", type: "string", conformance: "O", default: "" }),
                        Field({ name: "PostalCode", type: "string", conformance: "O", default: "" }),
                        Field({ name: "LineupInfoType", type: "LineupInfoTypeEnum", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "LineupInfoTypeEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [Field({ name: "Mso", id: 0x0, conformance: "M" })],
                }),

                Datatype({
                    name: "ChannelStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "MultipleMatches", id: 0x1, conformance: "M" }),
                        Field({ name: "NoMatches", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "OtaSoftwareUpdateProvider",
            id: 0x29,
            description: "OTA Software Update Provider",
            details: "Provides an interface for providing OTA software updates",

            children: [
                Command({
                    name: "QueryImage",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    response: "QueryImageResponse",

                    children: [
                        Field({ name: "VendorId", type: "vendor-id", conformance: "M" }),
                        Field({ name: "ProductId", type: "uint16", conformance: "M" }),
                        Field({ name: "SoftwareVersion", type: "uint32", conformance: "M" }),
                        Field({
                            name: "ProtocolsSupported",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "OtaDownloadProtocol" })],
                        }),
                        Field({ name: "HardwareVersion", type: "uint16", conformance: "O" }),
                        Field({ name: "Location", type: "string", conformance: "O", constraint: "max 2" }),
                        Field({ name: "RequestorCanConsent", type: "bool", conformance: "O", default: "false" }),
                        Field({ name: "MetadataForProvider", type: "octstr", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "QueryImageResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",

                    children: [
                        Field({ name: "Status", type: "OtaQueryStatus", conformance: "M" }),
                        Field({ name: "DelayedActionTime", type: "uint32", conformance: "O" }),
                        Field({ name: "ImageUri", type: "string", conformance: "O", constraint: "max 256" }),
                        Field({ name: "SoftwareVersion", type: "uint32", conformance: "O" }),
                        Field({
                            name: "SoftwareVersionString",
                            type: "string",
                            conformance: "O",
                            constraint: "max 64",
                        }),
                        Field({ name: "UpdateToken", type: "octstr", conformance: "O" }),
                        Field({ name: "UserConsentNeeded", type: "bool", conformance: "O", default: "false" }),
                        Field({ name: "MetadataForRequestor", type: "octstr", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "ApplyUpdateRequest",
                    id: 0x2,
                    conformance: "M",
                    direction: "request",
                    response: "ApplyUpdateResponse",
                    children: [
                        Field({ name: "UpdateToken", type: "octstr", conformance: "M" }),
                        Field({ name: "NewVersion", type: "uint32", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "ApplyUpdateResponse",
                    id: 0x3,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Action", type: "OtaApplyUpdateAction", conformance: "M" }),
                        Field({ name: "DelayedActionTime", type: "uint32", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "NotifyUpdateApplied",
                    id: 0x4,
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "UpdateToken", type: "octstr", conformance: "M" }),
                        Field({ name: "SoftwareVersion", type: "uint32", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OtaDownloadProtocol",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "BdxSynchronous", id: 0x0, conformance: "M" }),
                        Field({ name: "BdxAsynchronous", id: 0x1, conformance: "M" }),
                        Field({ name: "Https", id: 0x2, conformance: "M" }),
                        Field({ name: "VendorSpecific", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OtaQueryStatus",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "UpdateAvailable", id: 0x0, conformance: "M" }),
                        Field({ name: "Busy", id: 0x1, conformance: "M" }),
                        Field({ name: "NotAvailable", id: 0x2, conformance: "M" }),
                        Field({ name: "DownloadProtocolNotSupported", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OtaApplyUpdateAction",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Proceed", id: 0x0, conformance: "M" }),
                        Field({ name: "AwaitNextAction", id: 0x1, conformance: "M" }),
                        Field({ name: "Discontinue", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "OtaSoftwareUpdateRequestor",
            id: 0x2a,
            description: "OTA Software Update Requestor",
            details: "Provides an interface for downloading and applying OTA software updates",

            children: [
                Attribute({
                    name: "DefaultOtaProviders",
                    id: 0x0,
                    type: "list",
                    access: "RW",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "ProviderLocation" })],
                }),
                Attribute({ name: "UpdatePossible", id: 0x1, type: "bool", conformance: "M", default: true }),
                Attribute({ name: "UpdateState", id: 0x2, type: "OtaUpdateStateEnum", conformance: "M", default: 0 }),
                Attribute({
                    name: "UpdateStateProgress",
                    id: 0x3,
                    type: "uint8",
                    conformance: "M",
                    constraint: "max 100",
                    quality: "X",
                }),

                Command({
                    name: "AnnounceOtaProvider",
                    id: 0x0,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "ProviderNodeId", type: "node-id", conformance: "M" }),
                        Field({ name: "VendorId", type: "vendor-id", conformance: "M" }),
                        Field({ name: "AnnouncementReason", type: "OtaAnnouncementReason", conformance: "M" }),
                        Field({ name: "MetadataForNode", type: "octstr", conformance: "O" }),
                        Field({ name: "Endpoint", type: "endpoint-no", conformance: "M" }),
                    ],
                }),

                Event({
                    name: "StateTransition",
                    id: 0x0,
                    conformance: "M",
                    priority: "info",

                    children: [
                        Field({ name: "PreviousState", id: 0x0, type: "OtaUpdateStateEnum", conformance: "M" }),
                        Field({ name: "NewState", id: 0x1, type: "OtaUpdateStateEnum", conformance: "M" }),
                        Field({ name: "Reason", id: 0x2, type: "OtaChangeReasonEnum", conformance: "M" }),
                        Field({
                            name: "TargetSoftwareVersion",
                            id: 0x3,
                            type: "uint32",
                            conformance: "M",
                            quality: "X",
                        }),
                    ],
                }),

                Event({
                    name: "VersionApplied",
                    id: 0x1,
                    conformance: "M",
                    priority: "critical",
                    children: [
                        Field({ name: "SoftwareVersion", id: 0x0, type: "uint32", conformance: "M" }),
                        Field({ name: "ProductId", id: 0x1, type: "uint16", conformance: "M" }),
                    ],
                }),

                Event({
                    name: "DownloadError",
                    id: 0x2,
                    conformance: "M",
                    priority: "info",

                    children: [
                        Field({ name: "SoftwareVersion", id: 0x0, type: "uint32", conformance: "M" }),
                        Field({ name: "BytesDownloaded", id: 0x1, type: "uint64", conformance: "M" }),
                        Field({
                            name: "ProgressPercent",
                            id: 0x2,
                            type: "uint8",
                            conformance: "M",
                            constraint: "max 100",
                            quality: "X",
                        }),
                        Field({ name: "PlatformCode", id: 0x3, type: "int64", conformance: "M", quality: "X" }),
                    ],
                }),

                Datatype({
                    name: "ProviderLocation",
                    type: "struct",
                    access: "R F",
                    conformance: "M",
                    children: [
                        Field({ name: "ProviderNodeId", id: 0x1, type: "node-id", conformance: "M" }),
                        Field({ name: "Endpoint", id: 0x2, type: "endpoint-no", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OtaUpdateStateEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unknown", id: 0x0, conformance: "M" }),
                        Field({ name: "Idle", id: 0x1, conformance: "M" }),
                        Field({ name: "Querying", id: 0x2, conformance: "M" }),
                        Field({ name: "DelayedOnQuery", id: 0x3, conformance: "M" }),
                        Field({ name: "Downloading", id: 0x4, conformance: "M" }),
                        Field({ name: "Applying", id: 0x5, conformance: "M" }),
                        Field({ name: "DelayedOnApply", id: 0x6, conformance: "M" }),
                        Field({ name: "RollingBack", id: 0x7, conformance: "M" }),
                        Field({ name: "DelayedOnUserConsent", id: 0x8, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OtaAnnouncementReason",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "SimpleAnnouncement", id: 0x0, conformance: "M" }),
                        Field({ name: "UpdateAvailable", id: 0x1, conformance: "M" }),
                        Field({ name: "UrgentUpdateAvailable", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OtaChangeReasonEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unknown", id: 0x0, conformance: "M" }),
                        Field({ name: "Success", id: 0x1, conformance: "M" }),
                        Field({ name: "Failure", id: 0x2, conformance: "M" }),
                        Field({ name: "TimeOut", id: 0x3, conformance: "M" }),
                        Field({ name: "DelayByProvider", id: 0x4, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "ClientMonitoring",
            id: 0x1046,
            description: "Client Monitoring",
            details:
                "Client Monitoring allows for ensuring that listed clients meet the required monitoring conditions " +
                "on the server.",

            children: [
                Attribute({
                    name: "IdleModeInterval",
                    id: 0x0,
                    type: "uint32",
                    conformance: "M",
                    constraint: "300 to 86400000",
                    default: 18,
                }),
                Attribute({
                    name: "ActiveModeInterval",
                    id: 0x1,
                    type: "uint32",
                    conformance: "M",
                    constraint: "300 to 86400000",
                    default: 18,
                }),
                Attribute({
                    name: "ActiveModeThreshold",
                    id: 0x2,
                    type: "uint16",
                    conformance: "M",
                    constraint: "300 to 60000",
                    default: 0,
                }),
                Attribute({
                    name: "ExpectedClients",
                    id: 0x3,
                    type: "list",
                    conformance: "M",
                    constraint: "max 4",
                    children: [Field({ name: "entry", type: "MonitoringRegistration" })],
                }),

                Command({
                    name: "RegisterClientMonitoring",
                    id: 0x0,
                    access: "R M",
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "ClientNodeId", type: "node-id", conformance: "M" }),
                        Field({ name: "ICid", type: "uint64", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "UnregisterClientMonitoring",
                    id: 0x1,
                    access: "R M",
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "ClientNodeId", type: "node-id", conformance: "M" }),
                        Field({ name: "ICid", type: "uint64", conformance: "M" }),
                    ],
                }),

                Command({ name: "StayAwakeRequest", id: 0x2, access: "R M", conformance: "O", direction: "request" }),

                Datatype({
                    name: "MonitoringRegistration",
                    type: "struct",
                    access: "R F",
                    conformance: "M",
                    children: [
                        Field({ name: "ClientNodeId", id: 0x1, type: "node-id", conformance: "M" }),
                        Field({ name: "ICid", id: 0x2, type: "uint64", conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "ColorControl",
            id: 0x300,
            description: "Color Control",
            details: "Attributes and commands for controlling the color properties of a color-capable light.",

            children: [
                Attribute({
                    name: "ColorControlCurrentHue",
                    id: 0x0,
                    type: "uint8",
                    conformance: "O",
                    constraint: "max 254",
                    default: 0,
                    quality: "P",
                }),
                Attribute({
                    name: "ColorControlCurrentSaturation",
                    id: 0x1,
                    type: "uint8",
                    conformance: "O",
                    constraint: "max 254",
                    default: 0,
                    quality: "P",
                }),
                Attribute({
                    name: "ColorControlRemainingTime",
                    id: 0x2,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65534",
                    default: 0,
                }),
                Attribute({
                    name: "ColorControlCurrentX",
                    id: 0x3,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                    default: 1558,
                    quality: "P",
                }),
                Attribute({
                    name: "ColorControlCurrentY",
                    id: 0x4,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                    default: 1543,
                    quality: "P",
                }),
                Attribute({ name: "ColorControlDriftCompensation", id: 0x5, type: "enum8", conformance: "O" }),
                Attribute({
                    name: "ColorControlCompensationText",
                    id: 0x6,
                    type: "string",
                    conformance: "O",
                    constraint: "max 254",
                }),
                Attribute({
                    name: "ColorControlColorTemperature",
                    id: 0x7,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                    default: 0,
                    quality: "P",
                }),
                Attribute({ name: "ColorControlColorMode", id: 0x8, type: "enum8", conformance: "M", default: 1 }),
                Attribute({
                    name: "ColorControlOptions",
                    id: 0xf,
                    type: "map8",
                    access: "RW",
                    conformance: "M",
                    default: 0,
                    children: [Field({ name: "ExecuteIfOff", id: 0x1, conformance: "M" })],
                }),
                Attribute({
                    name: "ColorControlNumberOfPrimaries",
                    id: 0x10,
                    type: "uint8",
                    conformance: "M",
                    constraint: "max 6",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlPrimary1X",
                    id: 0x11,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary1Y",
                    id: 0x12,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary1Intensity",
                    id: 0x13,
                    type: "uint8",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlPrimary2X",
                    id: 0x15,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary2Y",
                    id: 0x16,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary2Intensity",
                    id: 0x17,
                    type: "uint8",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlPrimary3X",
                    id: 0x19,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary3Y",
                    id: 0x1a,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary3Intensity",
                    id: 0x1b,
                    type: "uint8",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlPrimary4X",
                    id: 0x20,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary4Y",
                    id: 0x21,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary4Intensity",
                    id: 0x22,
                    type: "uint8",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlPrimary5X",
                    id: 0x24,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary5Y",
                    id: 0x25,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary5Intensity",
                    id: 0x26,
                    type: "uint8",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlPrimary6X",
                    id: 0x28,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary6Y",
                    id: 0x29,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlPrimary6Intensity",
                    id: 0x2a,
                    type: "uint8",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlWhitePointX",
                    id: 0x30,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlWhitePointY",
                    id: 0x31,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlColorPointRX",
                    id: 0x32,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlColorPointRY",
                    id: 0x33,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlColorPointRIntensity",
                    id: 0x34,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlColorPointGX",
                    id: 0x36,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlColorPointGY",
                    id: 0x37,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlColorPointGIntensity",
                    id: 0x38,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlColorPointBX",
                    id: 0x3a,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlColorPointBY",
                    id: 0x3b,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                }),
                Attribute({
                    name: "ColorControlColorPointBIntensity",
                    id: 0x3c,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "ColorControlTemperatureLevelMinMireds",
                    id: 0x400d,
                    type: "uint16",
                    conformance: "O",
                }),
                Attribute({
                    name: "StartUpColorTemperatureMireds",
                    id: 0x4010,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 65279",
                    quality: "X",
                }),

                Command({
                    name: "MoveToHue",
                    id: 0x0,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "Hue", type: "uint8", conformance: "M" }),
                        Field({ name: "Direction", type: "HueDirection", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveHue",
                    id: 0x1,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "MoveMode", type: "HueMoveMode", conformance: "M" }),
                        Field({ name: "Rate", type: "uint8", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "StepHue",
                    id: 0x2,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "StepMode", type: "HueStepMode", conformance: "M" }),
                        Field({ name: "StepSize", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint8", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveToSaturation",
                    id: 0x3,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "Saturation", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveSaturation",
                    id: 0x4,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "MoveMode", type: "SaturationMoveMode", conformance: "M" }),
                        Field({ name: "Rate", type: "uint8", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "StepSaturation",
                    id: 0x5,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "StepMode", type: "SaturationStepMode", conformance: "M" }),
                        Field({ name: "StepSize", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint8", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveToHueAndSaturation",
                    id: 0x6,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "Hue", type: "uint8", conformance: "M" }),
                        Field({ name: "Saturation", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveToColor",
                    id: 0x7,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "ColorX", type: "uint16", conformance: "M" }),
                        Field({ name: "ColorY", type: "uint16", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveColor",
                    id: 0x8,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "RateX", type: "int16", conformance: "M" }),
                        Field({ name: "RateY", type: "int16", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "StepColor",
                    id: 0x9,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "StepX", type: "int16", conformance: "M" }),
                        Field({ name: "StepY", type: "int16", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveToColorTemperature",
                    id: 0xa,
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "ColorTemperatureMireds", type: "uint16", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                        Field({ name: "OptionsMask", type: "map8", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "map8", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "HueDirection",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "ShortestDistance", id: 0x0, conformance: "M" }),
                        Field({ name: "LongestDistance", id: 0x1, conformance: "M" }),
                        Field({ name: "Up", id: 0x2, conformance: "M" }),
                        Field({ name: "Down", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "HueMoveMode",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Stop", id: 0x0, conformance: "M" }),
                        Field({ name: "Up", id: 0x1, conformance: "M" }),
                        Field({ name: "Down", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "HueStepMode",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Up", id: 0x1, conformance: "M" }),
                        Field({ name: "Down", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "SaturationMoveMode",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Stop", id: 0x0, conformance: "M" }),
                        Field({ name: "Up", id: 0x1, conformance: "M" }),
                        Field({ name: "Down", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "SaturationStepMode",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Up", id: 0x1, conformance: "M" }),
                        Field({ name: "Down", id: 0x3, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "ContentLauncher",
            id: 0x50a,
            description: "Content Launcher",
            details:
                "This cluster provides an interface for launching content on a media player device such as a TV or " +
                "Speaker.",

            children: [
                Attribute({
                    name: "ContentLauncherAcceptHeader",
                    id: 0x0,
                    type: "list",
                    conformance: "O",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "string" })],
                }),
                Attribute({
                    name: "ContentLauncherSupportedStreamingProtocols",
                    id: 0x1,
                    type: "map32",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),

                Command({
                    name: "LaunchContent",
                    id: 0x0,
                    conformance: "O",
                    direction: "request",
                    response: "LauncherResponse",
                    children: [
                        Field({ name: "Search", type: "ContentSearchStruct", conformance: "M" }),
                        Field({ name: "AutoPlay", type: "bool", conformance: "M" }),
                        Field({ name: "Data", type: "string", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "LaunchUrl",
                    id: 0x1,
                    conformance: "O",
                    direction: "request",
                    response: "LauncherResponse",
                    children: [
                        Field({ name: "ContentUrl", type: "string", conformance: "M" }),
                        Field({ name: "DisplayString", type: "string", conformance: "O" }),
                        Field({ name: "BrandingInformation", type: "BrandingInformationStruct", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "LauncherResponse",
                    id: 0x2,
                    conformance: "O",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "ContentLaunchStatusEnum", conformance: "M" }),
                        Field({ name: "Data", type: "string", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "ContentSearchStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({
                            name: "ParameterList",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "ParameterStruct" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "ParameterStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "Type", type: "ParameterEnum", conformance: "M" }),
                        Field({ name: "Value", type: "string", conformance: "M" }),
                        Field({
                            name: "ExternalIdList",
                            type: "list",
                            conformance: "O",
                            children: [Field({ name: "entry", type: "AdditionalInfoStruct" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "ParameterEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Actor", id: 0x0, conformance: "M" }),
                        Field({ name: "Channel", id: 0x1, conformance: "M" }),
                        Field({ name: "Character", id: 0x2, conformance: "M" }),
                        Field({ name: "Director", id: 0x3, conformance: "M" }),
                        Field({ name: "Event", id: 0x4, conformance: "M" }),
                        Field({ name: "Franchise", id: 0x5, conformance: "M" }),
                        Field({ name: "Genre", id: 0x6, conformance: "M" }),
                        Field({ name: "League", id: 0x7, conformance: "M" }),
                        Field({ name: "Popularity", id: 0x8, conformance: "M" }),
                        Field({ name: "Provider", id: 0x9, conformance: "M" }),
                        Field({ name: "Sport", id: 0xa, conformance: "M" }),
                        Field({ name: "SportsTeam", id: 0xb, conformance: "M" }),
                        Field({ name: "Type", id: 0xc, conformance: "M" }),
                        Field({ name: "Video", id: 0xd, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "AdditionalInfoStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Name", type: "string", conformance: "M" }),
                        Field({ name: "Value", type: "string", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BrandingInformationStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "ProviderName", type: "string", conformance: "M" }),
                        Field({ name: "Background", type: "StyleInformationStruct", conformance: "O" }),
                        Field({ name: "Logo", type: "StyleInformationStruct", conformance: "O" }),
                        Field({ name: "ProgressBar", type: "StyleInformationStruct", conformance: "O" }),
                        Field({ name: "Splash", type: "StyleInformationStruct", conformance: "O" }),
                        Field({ name: "WaterMark", type: "StyleInformationStruct", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "StyleInformationStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "ImageUrl", type: "string", conformance: "O" }),
                        Field({ name: "Color", type: "string", conformance: "O" }),
                        Field({ name: "Size", type: "DimensionStruct", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "DimensionStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Width", type: "double", conformance: "M" }),
                        Field({ name: "Height", type: "double", conformance: "M" }),
                        Field({ name: "Metric", type: "MetricTypeEnum", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "MetricTypeEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Pixels", id: 0x0, conformance: "M" }),
                        Field({ name: "Percentage", id: 0x1, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ContentLaunchStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "UrlNotAvailable", id: 0x1, conformance: "M" }),
                        Field({ name: "AuthFailed", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "Descriptor",
            id: 0x1d,
            description: "Descriptor",
            details:
                "The Descriptor Cluster is meant to replace the support from the Zigbee Device Object (ZDO) for " +
                "describing a node, its endpoints and clusters.",

            children: [
                Attribute({
                    name: "DeviceList",
                    id: 0x0,
                    type: "list",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "DeviceTypeStruct" })],
                }),
                Attribute({
                    name: "ServerList",
                    id: 0x1,
                    type: "list",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "cluster-id" })],
                }),
                Attribute({
                    name: "ClientList",
                    id: 0x2,
                    type: "list",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "cluster-id" })],
                }),
                Attribute({
                    name: "PartsList",
                    id: 0x3,
                    type: "list",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "endpoint-no" })],
                }),

                Datatype({
                    name: "DeviceTypeStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "DeviceType", type: "devtype-id", conformance: "M" }),
                        Field({ name: "Revision", type: "uint16", conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "DiagnosticLogs",
            id: 0x32,
            description: "Diagnostic Logs",
            details:
                "The cluster provides commands for retrieving unstructured diagnostic logs from a Node that may be " +
                "used to aid in diagnostics.",

            children: [
                Command({
                    name: "RetrieveLogsRequest",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    response: "RetrieveLogsResponse",
                    children: [
                        Field({ name: "Intent", type: "IntentEnum", conformance: "M" }),
                        Field({ name: "RequestedProtocol", type: "TransferProtocolEnum", conformance: "M" }),
                        Field({
                            name: "TransferFileDesignator",
                            type: "string",
                            conformance: "O",
                            constraint: "max 32",
                        }),
                    ],
                }),

                Command({
                    name: "RetrieveLogsResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",

                    children: [
                        Field({ name: "Status", type: "StatusEnum", conformance: "M" }),
                        Field({ name: "LogContent", type: "octstr", conformance: "M" }),
                        Field({ name: "UtcTimeStamp", type: "epoch-us", conformance: "O" }),
                        Field({ name: "TimeSinceBoot", type: "systime-us", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "IntentEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "EndUserSupport", id: 0x0, conformance: "M" }),
                        Field({ name: "NetworkDiag", id: 0x1, conformance: "M" }),
                        Field({ name: "CrashLogs", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "TransferProtocolEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "ResponsePayload", id: 0x0, conformance: "M" }),
                        Field({ name: "Bdx", id: 0x1, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "StatusEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "Exhausted", id: 0x1, conformance: "M" }),
                        Field({ name: "NoLogs", id: 0x2, conformance: "M" }),
                        Field({ name: "Busy", id: 0x3, conformance: "M" }),
                        Field({ name: "Denied", id: 0x4, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "DoorLock",
            id: 0x101,
            description: "Door Lock",
            details: "An interface to a generic way to secure a door",

            children: [
                Attribute({ name: "LockState", id: 0x0, type: "DlLockState", conformance: "M", quality: "X P" }),
                Attribute({ name: "LockType", id: 0x1, type: "DlLockType", conformance: "M" }),
                Attribute({ name: "ActuatorEnabled", id: 0x2, type: "bool", conformance: "M" }),
                Attribute({ name: "DoorState", id: 0x3, type: "DoorStateEnum", conformance: "O", quality: "X P" }),
                Attribute({ name: "DoorOpenEvents", id: 0x4, type: "uint32", access: "RW VM", conformance: "O" }),
                Attribute({ name: "DoorClosedEvents", id: 0x5, type: "uint32", access: "RW VM", conformance: "O" }),
                Attribute({ name: "OpenPeriod", id: 0x6, type: "uint16", access: "RW VM", conformance: "O" }),
                Attribute({ name: "NumTotalUsersSupported", id: 0x11, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "NumPinUsersSupported", id: 0x12, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "NumRfidUsersSupported", id: 0x13, type: "uint16", conformance: "O", default: 0 }),
                Attribute({
                    name: "NumWeekdaySchedulesSupportedPerUser",
                    id: 0x14,
                    type: "uint8",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "NumYeardaySchedulesSupportedPerUser",
                    id: 0x15,
                    type: "uint8",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "NumHolidaySchedulesSupported",
                    id: 0x16,
                    type: "uint8",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "MaxPinLength", id: 0x17, type: "uint8", conformance: "O" }),
                Attribute({ name: "MinPinLength", id: 0x18, type: "uint8", conformance: "O" }),
                Attribute({ name: "MaxRfidCodeLength", id: 0x19, type: "uint8", conformance: "O" }),
                Attribute({ name: "MinRfidCodeLength", id: 0x1a, type: "uint8", conformance: "O" }),
                Attribute({
                    name: "CredentialRulesSupport",
                    id: 0x1b,
                    type: "DlCredentialRuleMask",
                    conformance: "O",
                    default: 1,
                }),
                Attribute({
                    name: "NumCredentialsSupportedPerUser",
                    id: 0x1c,
                    type: "uint8",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "Language",
                    id: 0x21,
                    type: "string",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 3",
                    quality: "P",
                }),
                Attribute({
                    name: "LedSettings",
                    id: 0x22,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 2",
                    default: 0,
                    quality: "P",
                }),
                Attribute({
                    name: "AutoRelockTime",
                    id: 0x23,
                    type: "uint32",
                    access: "RW VM",
                    conformance: "M",
                    quality: "P",
                }),
                Attribute({
                    name: "SoundVolume",
                    id: 0x24,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 3",
                    default: 0,
                    quality: "P",
                }),
                Attribute({
                    name: "OperatingMode",
                    id: 0x25,
                    type: "OperatingModeEnum",
                    access: "RW VM",
                    conformance: "M",
                    quality: "P",
                }),
                Attribute({
                    name: "SupportedOperatingModes",
                    id: 0x26,
                    type: "DlSupportedOperatingModes",
                    conformance: "M",
                    default: 65526,
                }),
                Attribute({
                    name: "DefaultConfigurationRegister",
                    id: 0x27,
                    type: "DlDefaultConfigurationRegister",
                    conformance: "O",
                    default: 0,
                    quality: "P",
                }),
                Attribute({
                    name: "EnableLocalProgramming",
                    id: 0x28,
                    type: "bool",
                    access: "RW VA",
                    conformance: "O",
                    default: true,
                    quality: "P",
                }),
                Attribute({
                    name: "EnableOneTouchLocking",
                    id: 0x29,
                    type: "bool",
                    access: "RW VM",
                    conformance: "O",
                    default: true,
                    quality: "P",
                }),
                Attribute({
                    name: "EnableInsideStatusLed",
                    id: 0x2a,
                    type: "bool",
                    access: "RW VM",
                    conformance: "O",
                    default: true,
                    quality: "P",
                }),
                Attribute({
                    name: "EnablePrivacyModeButton",
                    id: 0x2b,
                    type: "bool",
                    access: "RW VM",
                    conformance: "O",
                    default: true,
                    quality: "P",
                }),
                Attribute({
                    name: "LocalProgrammingFeatures",
                    id: 0x2c,
                    type: "DlLocalProgrammingFeatures",
                    access: "RW VA",
                    conformance: "O",
                    default: 0,
                    quality: "P",
                }),
                Attribute({
                    name: "WrongCodeEntryLimit",
                    id: 0x30,
                    type: "uint8",
                    access: "RW VA",
                    conformance: "O",
                    constraint: "min 1",
                    quality: "P",
                }),
                Attribute({
                    name: "UserCodeTemporaryDisableTime",
                    id: 0x31,
                    type: "uint8",
                    access: "RW VA",
                    conformance: "O",
                    constraint: "min 1",
                    quality: "P",
                }),
                Attribute({
                    name: "SendPinOverTheAir",
                    id: 0x32,
                    type: "bool",
                    access: "RW VA",
                    conformance: "O",
                    default: true,
                    quality: "P",
                }),
                Attribute({
                    name: "RequirePinForRemoteOperation",
                    id: 0x33,
                    type: "bool",
                    access: "RW VA",
                    conformance: "O",
                    default: true,
                    quality: "P",
                }),
                Attribute({
                    name: "ExpiringUserTimeout",
                    id: 0x35,
                    type: "uint16",
                    access: "RW VA",
                    conformance: "O",
                    constraint: "1 to 2880",
                    quality: "P",
                }),
                Command({
                    name: "LockDoor",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "PinCode", type: "octstr", conformance: "O" })],
                }),
                Command({
                    name: "UnlockDoor",
                    id: 0x1,
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "PinCode", type: "octstr", conformance: "O" })],
                }),

                Command({
                    name: "UnlockWithTimeout",
                    id: 0x3,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "Timeout", type: "uint16", conformance: "M" }),
                        Field({ name: "PinCode", type: "octstr", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "SetWeekDaySchedule",
                    id: 0xb,
                    access: "R A",
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "WeekDayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                        Field({ name: "DaysMask", type: "DaysMaskMap", conformance: "M" }),
                        Field({ name: "StartHour", type: "uint8", conformance: "M" }),
                        Field({ name: "StartMinute", type: "uint8", conformance: "M" }),
                        Field({ name: "EndHour", type: "uint8", conformance: "M" }),
                        Field({ name: "EndMinute", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "GetWeekDaySchedule",
                    id: 0xc,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    response: "GetWeekDayScheduleResponse",
                    children: [
                        Field({ name: "WeekDayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "GetWeekDayScheduleResponse",
                    id: 0xc,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "WeekDayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                        Field({ name: "Status", type: "DlStatus", conformance: "M" }),
                        Field({ name: "DaysMask", type: "DaysMaskMap", conformance: "O" }),
                        Field({ name: "StartHour", type: "uint8", conformance: "O" }),
                        Field({ name: "StartMinute", type: "uint8", conformance: "O" }),
                        Field({ name: "EndHour", type: "uint8", conformance: "O" }),
                        Field({ name: "EndMinute", type: "uint8", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "ClearWeekDaySchedule",
                    id: 0xd,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "WeekDayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "SetYearDaySchedule",
                    id: 0xe,
                    access: "R A",
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "YearDayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                        Field({ name: "LocalStartTime", type: "epoch-s", conformance: "M" }),
                        Field({ name: "LocalEndTime", type: "epoch-s", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "GetYearDaySchedule",
                    id: 0xf,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    response: "GetYearDayScheduleResponse",
                    children: [
                        Field({ name: "YearDayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "GetYearDayScheduleResponse",
                    id: 0xf,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "YearDayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                        Field({ name: "Status", type: "DlStatus", conformance: "M" }),
                        Field({ name: "LocalStartTime", type: "epoch-s", conformance: "O" }),
                        Field({ name: "LocalEndTime", type: "epoch-s", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "ClearYearDaySchedule",
                    id: 0x10,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "YearDayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "SetHolidaySchedule",
                    id: 0x11,
                    access: "R A",
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "HolidayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "LocalStartTime", type: "epoch-s", conformance: "M" }),
                        Field({ name: "LocalEndTime", type: "epoch-s", conformance: "M" }),
                        Field({ name: "OperatingMode", type: "OperatingModeEnum", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "GetHolidaySchedule",
                    id: 0x12,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    response: "GetHolidayScheduleResponse",
                    children: [Field({ name: "HolidayIndex", type: "uint8", conformance: "M" })],
                }),

                Command({
                    name: "GetHolidayScheduleResponse",
                    id: 0x12,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "HolidayIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "Status", type: "DlStatus", conformance: "M" }),
                        Field({ name: "LocalStartTime", type: "epoch-s", conformance: "O" }),
                        Field({ name: "LocalEndTime", type: "epoch-s", conformance: "O" }),
                        Field({ name: "OperatingMode", type: "OperatingModeEnum", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "ClearHolidaySchedule",
                    id: 0x13,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "HolidayIndex", type: "uint8", conformance: "M" })],
                }),

                Command({
                    name: "SetUser",
                    id: 0x1a,
                    access: "R A",
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "OperationType", type: "DataOperationTypeEnum", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                        Field({ name: "UserName", type: "string", conformance: "M", quality: "X" }),
                        Field({ name: "UserUniqueId", type: "uint32", conformance: "M", quality: "X" }),
                        Field({ name: "UserStatus", type: "UserStatusEnum", conformance: "M", quality: "X" }),
                        Field({ name: "UserType", type: "UserTypeEnum", conformance: "M", quality: "X" }),
                        Field({ name: "CredentialRule", type: "CredentialRuleEnum", conformance: "M", quality: "X" }),
                    ],
                }),

                Command({
                    name: "GetUser",
                    id: 0x1b,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    response: "GetUserResponse",
                    children: [Field({ name: "UserIndex", type: "uint16", conformance: "M" })],
                }),

                Command({
                    name: "GetUserResponse",
                    id: 0x1c,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "UserIndex", type: "uint16", conformance: "M" }),
                        Field({ name: "UserName", type: "string", conformance: "M", quality: "X" }),
                        Field({ name: "UserUniqueId", type: "uint32", conformance: "M", quality: "X" }),
                        Field({ name: "UserStatus", type: "UserStatusEnum", conformance: "M", quality: "X" }),
                        Field({ name: "UserType", type: "UserTypeEnum", conformance: "M", quality: "X" }),
                        Field({ name: "CredentialRule", type: "CredentialRuleEnum", conformance: "M", quality: "X" }),
                        Field({
                            name: "Credentials",
                            type: "list",
                            conformance: "M",
                            quality: "X",
                            children: [Field({ name: "entry", type: "CredentialStruct" })],
                        }),
                        Field({ name: "CreatorFabricIndex", type: "fabric-idx", conformance: "M", quality: "X" }),
                        Field({ name: "LastModifiedFabricIndex", type: "fabric-idx", conformance: "M", quality: "X" }),
                        Field({ name: "NextUserIndex", type: "uint16", conformance: "M", quality: "X" }),
                    ],
                }),

                Command({
                    name: "ClearUser",
                    id: 0x1d,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "UserIndex", type: "uint16", conformance: "M" })],
                }),

                Command({
                    name: "SetCredential",
                    id: 0x22,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    response: "SetCredentialResponse",

                    children: [
                        Field({ name: "OperationType", type: "DataOperationTypeEnum", conformance: "M" }),
                        Field({ name: "Credential", type: "CredentialStruct", conformance: "M" }),
                        Field({ name: "CredentialData", type: "octstr", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "UserStatus", type: "UserStatusEnum", conformance: "M", quality: "X" }),
                        Field({ name: "UserType", type: "UserTypeEnum", conformance: "M", quality: "X" }),
                    ],
                }),

                Command({
                    name: "SetCredentialResponse",
                    id: 0x23,
                    conformance: "O",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "DlStatus", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "NextCredentialIndex", type: "uint16", conformance: "M", quality: "X" }),
                    ],
                }),

                Command({
                    name: "GetCredentialStatus",
                    id: 0x24,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    response: "GetCredentialStatusResponse",
                    children: [Field({ name: "Credential", type: "CredentialStruct", conformance: "M" })],
                }),

                Command({
                    name: "GetCredentialStatusResponse",
                    id: 0x25,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "CredentialExists", type: "bool", conformance: "M" }),
                        Field({ name: "UserIndex", type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "CreatorFabricIndex", type: "fabric-idx", conformance: "M", quality: "X" }),
                        Field({ name: "LastModifiedFabricIndex", type: "fabric-idx", conformance: "M", quality: "X" }),
                        Field({ name: "NextCredentialIndex", type: "uint16", conformance: "M", quality: "X" }),
                    ],
                }),

                Command({
                    name: "ClearCredential",
                    id: 0x26,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "Credential", type: "CredentialStruct", conformance: "M", quality: "X" })],
                }),
                Event({
                    name: "DoorLockAlarm",
                    id: 0x0,
                    conformance: "M",
                    priority: "critical",
                    children: [Field({ name: "AlarmCode", id: 0x0, type: "AlarmCodeEnum", conformance: "M" })],
                }),
                Event({
                    name: "DoorStateChange",
                    id: 0x1,
                    conformance: "O",
                    priority: "critical",
                    children: [Field({ name: "DoorState", id: 0x0, type: "DoorStateEnum", conformance: "M" })],
                }),

                Event({
                    name: "LockOperation",
                    id: 0x2,
                    conformance: "M",
                    priority: "critical",

                    children: [
                        Field({ name: "LockOperationType", id: 0x0, type: "LockOperationTypeEnum", conformance: "M" }),
                        Field({ name: "OperationSource", id: 0x1, type: "OperationSourceEnum", conformance: "M" }),
                        Field({ name: "UserIndex", id: 0x2, type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "FabricIndex", id: 0x3, type: "fabric-idx", conformance: "M", quality: "X" }),
                        Field({ name: "SourceNode", id: 0x4, type: "node-id", conformance: "M", quality: "X" }),
                        Field({
                            name: "Credentials",
                            id: 0x5,
                            type: "list",
                            conformance: "O",
                            quality: "X",
                            children: [Field({ name: "entry", type: "CredentialStruct" })],
                        }),
                    ],
                }),

                Event({
                    name: "LockOperationError",
                    id: 0x3,
                    conformance: "M",
                    priority: "critical",

                    children: [
                        Field({ name: "LockOperationType", id: 0x0, type: "LockOperationTypeEnum", conformance: "M" }),
                        Field({ name: "OperationSource", id: 0x1, type: "OperationSourceEnum", conformance: "M" }),
                        Field({ name: "OperationError", id: 0x2, type: "OperationErrorEnum", conformance: "M" }),
                        Field({ name: "UserIndex", id: 0x3, type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "FabricIndex", id: 0x4, type: "fabric-idx", conformance: "M", quality: "X" }),
                        Field({ name: "SourceNode", id: 0x5, type: "node-id", conformance: "M", quality: "X" }),
                        Field({
                            name: "Credentials",
                            id: 0x6,
                            type: "list",
                            conformance: "O",
                            quality: "X",
                            children: [Field({ name: "entry", type: "CredentialStruct" })],
                        }),
                    ],
                }),

                Event({
                    name: "LockUserChange",
                    id: 0x4,
                    conformance: "M",
                    priority: "info",

                    children: [
                        Field({ name: "LockDataType", id: 0x0, type: "LockDataTypeEnum", conformance: "M" }),
                        Field({ name: "DataOperationType", id: 0x1, type: "DataOperationTypeEnum", conformance: "M" }),
                        Field({ name: "OperationSource", id: 0x2, type: "OperationSourceEnum", conformance: "M" }),
                        Field({ name: "UserIndex", id: 0x3, type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "FabricIndex", id: 0x4, type: "fabric-idx", conformance: "M", quality: "X" }),
                        Field({ name: "SourceNode", id: 0x5, type: "node-id", conformance: "M", quality: "X" }),
                        Field({ name: "DataIndex", id: 0x6, type: "uint16", conformance: "M", quality: "X" }),
                    ],
                }),

                Datatype({
                    name: "DlLockState",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "NotFullyLocked", id: 0x0, conformance: "M" }),
                        Field({ name: "Locked", id: 0x1, conformance: "M" }),
                        Field({ name: "Unlocked", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "DlLockType",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "DeadBolt", id: 0x0, conformance: "M" }),
                        Field({ name: "Magnetic", id: 0x1, conformance: "M" }),
                        Field({ name: "Other", id: 0x2, conformance: "M" }),
                        Field({ name: "Mortise", id: 0x3, conformance: "M" }),
                        Field({ name: "Rim", id: 0x4, conformance: "M" }),
                        Field({ name: "LatchBolt", id: 0x5, conformance: "M" }),
                        Field({ name: "CylindricalLock", id: 0x6, conformance: "M" }),
                        Field({ name: "TubularLock", id: 0x7, conformance: "M" }),
                        Field({ name: "InterconnectedLock", id: 0x8, conformance: "M" }),
                        Field({ name: "DeadLatch", id: 0x9, conformance: "M" }),
                        Field({ name: "DoorFurniture", id: 0xa, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "DoorStateEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "DoorOpen", id: 0x0, conformance: "M" }),
                        Field({ name: "DoorClosed", id: 0x1, conformance: "M" }),
                        Field({ name: "DoorJammed", id: 0x2, conformance: "M" }),
                        Field({ name: "DoorForcedOpen", id: 0x3, conformance: "M" }),
                        Field({ name: "DoorUnspecifiedError", id: 0x4, conformance: "M" }),
                        Field({ name: "DoorAjar", id: 0x5, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "DlCredentialRuleMask",
                    type: "map8",
                    conformance: "M",
                    children: [
                        Field({ name: "Single", constraint: "0" }),
                        Field({ name: "Dual", constraint: "1" }),
                        Field({ name: "Tri", constraint: "2" }),
                    ],
                }),

                Datatype({
                    name: "OperatingModeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Normal", id: 0x0, conformance: "M" }),
                        Field({ name: "Vacation", id: 0x1, conformance: "M" }),
                        Field({ name: "Privacy", id: 0x2, conformance: "M" }),
                        Field({ name: "NoRemoteLockUnlock", id: 0x3, conformance: "M" }),
                        Field({ name: "Passage", id: 0x4, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "DlSupportedOperatingModes",
                    type: "map16",
                    conformance: "M",

                    children: [
                        Field({ name: "Normal", constraint: "0" }),
                        Field({ name: "Vacation", constraint: "1" }),
                        Field({ name: "Privacy", constraint: "2" }),
                        Field({ name: "NoRemoteLockUnlock", constraint: "3" }),
                        Field({ name: "Passage", constraint: "4" }),
                    ],
                }),

                Datatype({
                    name: "DlDefaultConfigurationRegister",
                    type: "map16",
                    conformance: "M",

                    children: [
                        Field({ name: "EnableLocalProgrammingEnabled", constraint: "0" }),
                        Field({ name: "KeypadInterfaceDefaultAccessEnabled", constraint: "1" }),
                        Field({ name: "RemoteInterfaceDefaultAccessIsEnabled", constraint: "2" }),
                        Field({ name: "SoundEnabled", constraint: "5" }),
                        Field({ name: "AutoRelockTimeSet", constraint: "6" }),
                        Field({ name: "LEDSettingsSet", constraint: "7" }),
                    ],
                }),

                Datatype({
                    name: "DlLocalProgrammingFeatures",
                    type: "map8",
                    conformance: "M",

                    children: [
                        Field({ name: "AddUsersCredentialsSchedulesLocally", constraint: "0" }),
                        Field({ name: "ModifyUsersCredentialsSchedulesLocally", constraint: "1" }),
                        Field({ name: "ClearUsersCredentialsSchedulesLocally", constraint: "2" }),
                        Field({ name: "AdjustLockSettingsLocally", constraint: "3" }),
                    ],
                }),

                Datatype({
                    name: "DaysMaskMap",
                    type: "map8",
                    conformance: "M",

                    children: [
                        Field({ name: "Sunday", constraint: "0" }),
                        Field({ name: "Monday", constraint: "1" }),
                        Field({ name: "Tuesday", constraint: "2" }),
                        Field({ name: "Wednesday", constraint: "3" }),
                        Field({ name: "Thursday", constraint: "4" }),
                        Field({ name: "Friday", constraint: "5" }),
                        Field({ name: "Saturday", constraint: "6" }),
                    ],
                }),

                Datatype({
                    name: "DlStatus",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "Failure", id: 0x1, conformance: "M" }),
                        Field({ name: "Duplicate", id: 0x2, conformance: "M" }),
                        Field({ name: "Occupied", id: 0x3, conformance: "M" }),
                        Field({ name: "InvalidField", id: 0x85, conformance: "M" }),
                        Field({ name: "ResourceExhausted", id: 0x89, conformance: "M" }),
                        Field({ name: "NotFound", id: 0x8b, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "DataOperationTypeEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Add", id: 0x0, conformance: "M" }),
                        Field({ name: "Clear", id: 0x1, conformance: "M" }),
                        Field({ name: "Modify", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "UserStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Available", id: 0x0, conformance: "M" }),
                        Field({ name: "OccupiedEnabled", id: 0x1, conformance: "M" }),
                        Field({ name: "OccupiedDisabled", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "UserTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "UnrestrictedUser", id: 0x0, conformance: "M" }),
                        Field({ name: "YearDayScheduleUser", id: 0x1, conformance: "M" }),
                        Field({ name: "WeekDayScheduleUser", id: 0x2, conformance: "M" }),
                        Field({ name: "ProgrammingUser", id: 0x3, conformance: "M" }),
                        Field({ name: "NonAccessUser", id: 0x4, conformance: "M" }),
                        Field({ name: "ForcedUser", id: 0x5, conformance: "M" }),
                        Field({ name: "DisposableUser", id: 0x6, conformance: "M" }),
                        Field({ name: "ExpiringUser", id: 0x7, conformance: "M" }),
                        Field({ name: "ScheduleRestrictedUser", id: 0x8, conformance: "M" }),
                        Field({ name: "RemoteOnlyUser", id: 0x9, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "CredentialRuleEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Single", id: 0x0, conformance: "M" }),
                        Field({ name: "Dual", id: 0x1, conformance: "M" }),
                        Field({ name: "Tri", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "CredentialStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "CredentialType", type: "CredentialTypeEnum", conformance: "M" }),
                        Field({ name: "CredentialIndex", type: "uint16", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "CredentialTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "ProgrammingPin", id: 0x0, conformance: "M" }),
                        Field({ name: "Pin", id: 0x1, conformance: "M" }),
                        Field({ name: "Rfid", id: 0x2, conformance: "M" }),
                        Field({ name: "Fingerprint", id: 0x3, conformance: "M" }),
                        Field({ name: "FingerVein", id: 0x4, conformance: "M" }),
                        Field({ name: "Face", id: 0x5, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "AlarmCodeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "LockJammed", id: 0x0, conformance: "M" }),
                        Field({ name: "LockFactoryReset", id: 0x1, conformance: "M" }),
                        Field({ name: "LockRadioPowerCycled", id: 0x3, conformance: "M" }),
                        Field({ name: "WrongCodeEntryLimit", id: 0x4, conformance: "M" }),
                        Field({ name: "FrontEsceutcheonRemoved", id: 0x5, conformance: "M" }),
                        Field({ name: "DoorForcedOpen", id: 0x6, conformance: "M" }),
                        Field({ name: "DoorAjar", id: 0x7, conformance: "M" }),
                        Field({ name: "ForcedUser", id: 0x8, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "LockOperationTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Lock", id: 0x0, conformance: "M" }),
                        Field({ name: "Unlock", id: 0x1, conformance: "M" }),
                        Field({ name: "NonAccessUserEvent", id: 0x2, conformance: "M" }),
                        Field({ name: "ForcedUserEvent", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OperationSourceEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "Manual", id: 0x1, conformance: "M" }),
                        Field({ name: "ProprietaryRemote", id: 0x2, conformance: "M" }),
                        Field({ name: "Keypad", id: 0x3, conformance: "M" }),
                        Field({ name: "Auto", id: 0x4, conformance: "M" }),
                        Field({ name: "Button", id: 0x5, conformance: "M" }),
                        Field({ name: "Schedule", id: 0x6, conformance: "M" }),
                        Field({ name: "Remote", id: 0x7, conformance: "M" }),
                        Field({ name: "Rfid", id: 0x8, conformance: "M" }),
                        Field({ name: "Biometric", id: 0x9, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OperationErrorEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "InvalidCredential", id: 0x1, conformance: "M" }),
                        Field({ name: "DisabledUserDenied", id: 0x2, conformance: "M" }),
                        Field({ name: "Restricted", id: 0x3, conformance: "M" }),
                        Field({ name: "InsufficientBattery", id: 0x4, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "LockDataTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "ProgrammingCode", id: 0x1, conformance: "M" }),
                        Field({ name: "UserIndex", id: 0x2, conformance: "M" }),
                        Field({ name: "WeekDaySchedule", id: 0x3, conformance: "M" }),
                        Field({ name: "YearDaySchedule", id: 0x4, conformance: "M" }),
                        Field({ name: "HolidaySchedule", id: 0x5, conformance: "M" }),
                        Field({ name: "Pin", id: 0x6, conformance: "M" }),
                        Field({ name: "Rfid", id: 0x7, conformance: "M" }),
                        Field({ name: "Fingerprint", id: 0x8, conformance: "M" }),
                        Field({ name: "FingerVein", id: 0x9, conformance: "M" }),
                        Field({ name: "Face", id: 0xa, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "EthernetNetworkDiagnostics",
            id: 0x37,
            description: "Ethernet Network Diagnostics",
            details:
                "The Ethernet Network Diagnostics Cluster provides a means to acquire standardized diagnostics " +
                "metrics that MAY be used by a Node to assist a user or Administrative Node in diagnosing potential " +
                "problems.",

            children: [
                Attribute({ name: "PhyRate", id: 0x0, type: "PhyRateEnum", conformance: "O", quality: "X" }),
                Attribute({ name: "FullDuplex", id: 0x1, type: "bool", conformance: "O", quality: "X" }),
                Attribute({ name: "PacketRxCount", id: 0x2, type: "uint64", conformance: "O", default: 0 }),
                Attribute({ name: "PacketTxCount", id: 0x3, type: "uint64", conformance: "O", default: 0 }),
                Attribute({ name: "TxErrCount", id: 0x4, type: "uint64", conformance: "O", default: 0 }),
                Attribute({ name: "CollisionCount", id: 0x5, type: "uint64", conformance: "O", default: 0 }),
                Attribute({ name: "EthernetOverrunCount", id: 0x6, type: "uint64", conformance: "O", default: 0 }),
                Attribute({ name: "CarrierDetect", id: 0x7, type: "bool", conformance: "O", quality: "X" }),
                Attribute({ name: "TimeSinceReset", id: 0x8, type: "uint64", conformance: "O", default: 0 }),
                Command({ name: "ResetCounts", id: 0x0, conformance: "M", direction: "request" }),

                Datatype({
                    name: "PhyRateEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Rate10M", id: 0x0, conformance: "M" }),
                        Field({ name: "Rate100M", id: 0x1, conformance: "M" }),
                        Field({ name: "Rate1G", id: 0x2, conformance: "M" }),
                        Field({ name: "Rate25G", id: 0x3, conformance: "M" }),
                        Field({ name: "Rate5G", id: 0x4, conformance: "M" }),
                        Field({ name: "Rate10G", id: 0x5, conformance: "M" }),
                        Field({ name: "Rate40G", id: 0x6, conformance: "M" }),
                        Field({ name: "Rate100G", id: 0x7, conformance: "M" }),
                        Field({ name: "Rate200G", id: 0x8, conformance: "M" }),
                        Field({ name: "Rate400G", id: 0x9, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "FanControl",
            id: 0x202,
            description: "Fan Control",
            details: "An interface for controlling a fan in a heating/cooling system.",

            children: [
                Attribute({
                    name: "FanMode",
                    id: 0x0,
                    type: "FanModeType",
                    access: "RW",
                    conformance: "M",
                    default: 0,
                }),
                Attribute({
                    name: "FanModeSequence",
                    id: 0x1,
                    type: "FanModeSequenceType",
                    access: "RW",
                    conformance: "M",
                    default: 2,
                }),
                Attribute({
                    name: "PercentSetting",
                    id: 0x2,
                    type: "uint8",
                    access: "RW",
                    conformance: "M",
                    constraint: "max 100",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PercentCurrent",
                    id: 0x3,
                    type: "uint8",
                    conformance: "M",
                    constraint: "max 100",
                    default: 0,
                }),
                Attribute({
                    name: "SpeedMax",
                    id: 0x4,
                    type: "uint8",
                    conformance: "O",
                    constraint: "1 to 100",
                    default: 1,
                }),
                Attribute({
                    name: "SpeedSetting",
                    id: 0x5,
                    type: "uint8",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 100",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "SpeedCurrent",
                    id: 0x6,
                    type: "uint8",
                    conformance: "O",
                    constraint: "max 100",
                    default: 0,
                }),

                Attribute({
                    name: "RockSupport",
                    id: 0x7,
                    type: "map8",
                    conformance: "O",
                    default: 0,
                    children: [
                        Field({ name: "RockLeftRight", constraint: "0" }),
                        Field({ name: "RockUpDown", constraint: "1" }),
                        Field({ name: "RockRound", constraint: "2" }),
                    ],
                }),

                Attribute({ name: "RockSetting", id: 0x8, type: "map8", access: "RW", conformance: "O", default: 0 }),

                Attribute({
                    name: "WindSupport",
                    id: 0x9,
                    type: "map8",
                    conformance: "O",
                    default: 0,
                    children: [
                        Field({ name: "Sleep Wind", constraint: "0" }),
                        Field({ name: "Natural Wind", constraint: "1" }),
                    ],
                }),

                Attribute({
                    name: "WindSetting",
                    id: 0xa,
                    type: "map8",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                    children: [
                        Field({ name: "Sleep Wind", constraint: "0" }),
                        Field({ name: "Natural Wind", constraint: "1" }),
                    ],
                }),

                Datatype({
                    name: "FanModeType",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Off", id: 0x0, conformance: "M" }),
                        Field({ name: "Low", id: 0x1, conformance: "M" }),
                        Field({ name: "Medium", id: 0x2, conformance: "M" }),
                        Field({ name: "High", id: 0x3, conformance: "M" }),
                        Field({ name: "On", id: 0x4, conformance: "M" }),
                        Field({ name: "Auto", id: 0x5, conformance: "M" }),
                        Field({ name: "Smart", id: 0x6, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "FanModeSequenceType",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "OffLowMedHigh", id: 0x0, conformance: "M" }),
                        Field({ name: "OffLowHigh", id: 0x1, conformance: "M" }),
                        Field({ name: "OffLowMedHighAuto", id: 0x2, conformance: "M" }),
                        Field({ name: "OffLowHighAuto", id: 0x3, conformance: "M" }),
                        Field({ name: "OffOnAuto", id: 0x4, conformance: "M" }),
                        Field({ name: "OffOn", id: 0x5, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "FaultInjection",
            id: 0xfff1fc06,
            description: "Fault Injection",
            details:
                "The Fault Injection Cluster provide a means for a test harness to configure faults(for example " +
                "triggering a fault in the system).",

            children: [
                Command({
                    name: "FailAtFault",
                    id: 0x0,
                    access: "R M",
                    conformance: "M",
                    direction: "request",

                    children: [
                        Field({ name: "Type", type: "FaultType", conformance: "M" }),
                        Field({ name: "Id", type: "uint32", conformance: "M" }),
                        Field({ name: "NumCallsToSkip", type: "uint32", conformance: "M" }),
                        Field({ name: "NumCallsToFail", type: "uint32", conformance: "M" }),
                        Field({ name: "TakeMutex", type: "bool", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "FailRandomlyAtFault",
                    id: 0x1,
                    access: "R M",
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "Type", type: "FaultType", conformance: "M" }),
                        Field({ name: "Id", type: "uint32", conformance: "M" }),
                        Field({ name: "Percentage", type: "uint8", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "FaultType",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "SystemFault", id: 0x1, conformance: "M" }),
                        Field({ name: "InetFault", id: 0x2, conformance: "M" }),
                        Field({ name: "ChipFault", id: 0x3, conformance: "M" }),
                        Field({ name: "CertFault", id: 0x4, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "FixedLabel",
            id: 0x40,
            description: "Fixed Label",
            details:
                "The Fixed Label Cluster provides a feature for the device to tag an endpoint with zero or more read " +
                "only labels.",

            children: [
                Attribute({
                    name: "LabelList",
                    id: 0x0,
                    type: "list",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "LabelStruct" })],
                }),

                Datatype({
                    name: "LabelStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Label", type: "string", conformance: "M", constraint: "max 16" }),
                        Field({ name: "Value", type: "string", conformance: "M", constraint: "max 16" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "FlowMeasurement",
            id: 0x404,
            description: "Flow Measurement",
            details:
                "Attributes and commands for configuring the measurement of flow, and reporting flow measurements.",

            children: [
                Attribute({ name: "FlowMeasuredValue", id: 0x0, type: "uint16", conformance: "M", quality: "X" }),
                Attribute({ name: "FlowMinMeasuredValue", id: 0x1, type: "uint16", conformance: "M", quality: "X" }),
                Attribute({ name: "FlowMaxMeasuredValue", id: 0x2, type: "uint16", conformance: "M", quality: "X" }),
                Attribute({
                    name: "FlowTolerance",
                    id: 0x3,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 2048",
                    default: 0,
                }),
            ],
        }),

        Cluster({
            name: "GeneralCommissioning",
            id: 0x30,
            description: "General Commissioning",
            details: "This cluster is used to manage global aspects of the Commissioning flow.",

            children: [
                Attribute({
                    name: "Breadcrumb",
                    id: 0x0,
                    type: "uint64",
                    access: "RW VA",
                    conformance: "M",
                    default: 0,
                }),
                Attribute({
                    name: "BasicCommissioningInfo",
                    id: 0x1,
                    type: "BasicCommissioningInfo",
                    conformance: "M",
                }),
                Attribute({ name: "RegulatoryConfig", id: 0x2, type: "RegulatoryLocationType", conformance: "M" }),
                Attribute({ name: "LocationCapability", id: 0x3, type: "RegulatoryLocationType", conformance: "M" }),
                Attribute({
                    name: "SupportsConcurrentConnection",
                    id: 0x4,
                    type: "bool",
                    conformance: "M",
                    default: true,
                }),

                Command({
                    name: "ArmFailSafe",
                    id: 0x0,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "ArmFailSafeResponse",
                    children: [
                        Field({ name: "ExpiryLengthSeconds", type: "uint16", conformance: "M" }),
                        Field({ name: "Breadcrumb", type: "uint64", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "ArmFailSafeResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "ErrorCode", type: "CommissioningError", conformance: "M" }),
                        Field({ name: "DebugText", type: "string", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "SetRegulatoryConfig",
                    id: 0x2,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "SetRegulatoryConfigResponse",
                    children: [
                        Field({ name: "NewRegulatoryConfig", type: "RegulatoryLocationType", conformance: "M" }),
                        Field({ name: "CountryCode", type: "string", conformance: "M" }),
                        Field({ name: "Breadcrumb", type: "uint64", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "SetRegulatoryConfigResponse",
                    id: 0x3,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "ErrorCode", type: "CommissioningError", conformance: "M" }),
                        Field({ name: "DebugText", type: "string", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "CommissioningComplete",
                    id: 0x4,
                    access: "R F A",
                    conformance: "M",
                    direction: "request",
                    response: "CommissioningCompleteResponse",
                }),

                Command({
                    name: "CommissioningCompleteResponse",
                    id: 0x5,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "ErrorCode", type: "CommissioningError", conformance: "M" }),
                        Field({ name: "DebugText", type: "string", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BasicCommissioningInfo",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "FailSafeExpiryLengthSeconds", id: 0x0, type: "uint16", conformance: "M" }),
                        Field({ name: "MaxCumulativeFailsafeSeconds", id: 0x1, type: "uint16", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "RegulatoryLocationType",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Indoor", id: 0x0, conformance: "M" }),
                        Field({ name: "Outdoor", id: 0x1, conformance: "M" }),
                        Field({ name: "IndoorOutdoor", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "CommissioningError",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Ok", id: 0x0, conformance: "M" }),
                        Field({ name: "ValueOutsideRange", id: 0x1, conformance: "M" }),
                        Field({ name: "InvalidAuthentication", id: 0x2, conformance: "M" }),
                        Field({ name: "NoFailSafe", id: 0x3, conformance: "M" }),
                        Field({ name: "BusyWithOtherAdmin", id: 0x4, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "GeneralDiagnostics",
            id: 0x33,
            description: "General Diagnostics",
            details:
                "The General Diagnostics Cluster, along with other diagnostics clusters, provide a means to acquire " +
                "standardized diagnostics metrics that MAY be used by a Node to assist a user or Administrative Node " +
                "in diagnosing potential problems.",

            children: [
                Attribute({
                    name: "NetworkInterfaces",
                    id: 0x0,
                    type: "list",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "NetworkInterface" })],
                }),
                Attribute({ name: "RebootCount", id: 0x1, type: "uint16", conformance: "M", default: 0 }),
                Attribute({ name: "UpTime", id: 0x2, type: "uint64", conformance: "O", default: 0 }),
                Attribute({ name: "TotalOperationalHours", id: 0x3, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "BootReasons", id: 0x4, type: "BootReasonEnum", conformance: "O" }),
                Attribute({
                    name: "ActiveHardwareFaults",
                    id: 0x5,
                    type: "list",
                    conformance: "O",
                    children: [Field({ name: "entry", type: "HardwareFaultEnum" })],
                }),
                Attribute({
                    name: "ActiveRadioFaults",
                    id: 0x6,
                    type: "list",
                    conformance: "O",
                    children: [Field({ name: "entry", type: "RadioFaultEnum" })],
                }),
                Attribute({
                    name: "ActiveNetworkFaults",
                    id: 0x7,
                    type: "list",
                    conformance: "O",
                    children: [Field({ name: "entry", type: "NetworkFaultEnum" })],
                }),
                Attribute({ name: "TestEventTriggersEnabled", id: 0x8, type: "bool", conformance: "M" }),

                Command({
                    name: "TestEventTrigger",
                    id: 0x0,
                    access: "R M",
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "EnableKey", type: "octstr", conformance: "M" }),
                        Field({ name: "EventTrigger", type: "uint64", conformance: "M" }),
                    ],
                }),

                Event({
                    name: "HardwareFaultChange",
                    id: 0x0,
                    conformance: "O",
                    priority: "critical",

                    children: [
                        Field({
                            name: "Current",
                            id: 0x0,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "HardwareFaultEnum" })],
                        }),
                        Field({
                            name: "Previous",
                            id: 0x1,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "HardwareFaultEnum" })],
                        }),
                    ],
                }),

                Event({
                    name: "RadioFaultChange",
                    id: 0x1,
                    conformance: "O",
                    priority: "critical",

                    children: [
                        Field({
                            name: "Current",
                            id: 0x0,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "RadioFaultEnum" })],
                        }),
                        Field({
                            name: "Previous",
                            id: 0x1,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "RadioFaultEnum" })],
                        }),
                    ],
                }),

                Event({
                    name: "NetworkFaultChange",
                    id: 0x2,
                    conformance: "O",
                    priority: "critical",

                    children: [
                        Field({
                            name: "Current",
                            id: 0x0,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "NetworkFaultEnum" })],
                        }),
                        Field({
                            name: "Previous",
                            id: 0x1,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "NetworkFaultEnum" })],
                        }),
                    ],
                }),

                Event({
                    name: "BootReason",
                    id: 0x3,
                    conformance: "M",
                    priority: "critical",
                    children: [Field({ name: "BootReason", id: 0x0, type: "BootReasonEnum", conformance: "M" })],
                }),

                Datatype({
                    name: "NetworkInterface",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "Name", type: "string", conformance: "M", constraint: "max 32" }),
                        Field({ name: "IsOperational", type: "bool", conformance: "M" }),
                        Field({
                            name: "OffPremiseServicesReachableIPv4",
                            type: "bool",
                            conformance: "M",
                            quality: "X",
                        }),
                        Field({
                            name: "OffPremiseServicesReachableIPv6",
                            type: "bool",
                            conformance: "M",
                            quality: "X",
                        }),
                        Field({ name: "HardwareAddress", type: "octstr", conformance: "M" }),
                        Field({
                            name: "IPv4Addresses",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "octstr" })],
                        }),
                        Field({
                            name: "IPv6Addresses",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "octstr" })],
                        }),
                        Field({ name: "Type", type: "InterfaceTypeEnum", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "InterfaceTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "WiFi", id: 0x1, conformance: "M" }),
                        Field({ name: "Ethernet", id: 0x2, conformance: "M" }),
                        Field({ name: "Cellular", id: 0x3, conformance: "M" }),
                        Field({ name: "Thread", id: 0x4, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BootReasonEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "PowerOnReboot", id: 0x1, conformance: "M" }),
                        Field({ name: "BrownOutReset", id: 0x2, conformance: "M" }),
                        Field({ name: "SoftwareWatchdogReset", id: 0x3, conformance: "M" }),
                        Field({ name: "HardwareWatchdogReset", id: 0x4, conformance: "M" }),
                        Field({ name: "SoftwareUpdateCompleted", id: 0x5, conformance: "M" }),
                        Field({ name: "SoftwareReset", id: 0x6, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "HardwareFaultEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "Radio", id: 0x1, conformance: "M" }),
                        Field({ name: "Sensor", id: 0x2, conformance: "M" }),
                        Field({ name: "ResettableOverTemp", id: 0x3, conformance: "M" }),
                        Field({ name: "NonResettableOverTemp", id: 0x4, conformance: "M" }),
                        Field({ name: "PowerSource", id: 0x5, conformance: "M" }),
                        Field({ name: "VisualDisplayFault", id: 0x6, conformance: "M" }),
                        Field({ name: "AudioOutputFault", id: 0x7, conformance: "M" }),
                        Field({ name: "UserInterfaceFault", id: 0x8, conformance: "M" }),
                        Field({ name: "NonVolatileMemoryError", id: 0x9, conformance: "M" }),
                        Field({ name: "TamperDetected", id: 0xa, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "RadioFaultEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "WiFiFault", id: 0x1, conformance: "M" }),
                        Field({ name: "CellularFault", id: 0x2, conformance: "M" }),
                        Field({ name: "ThreadFault", id: 0x3, conformance: "M" }),
                        Field({ name: "NfcFault", id: 0x4, conformance: "M" }),
                        Field({ name: "BleFault", id: 0x5, conformance: "M" }),
                        Field({ name: "EthernetFault", id: 0x6, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "NetworkFaultEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "HardwareFailure", id: 0x1, conformance: "M" }),
                        Field({ name: "NetworkJammed", id: 0x2, conformance: "M" }),
                        Field({ name: "ConnectionFailed", id: 0x3, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "GroupKeyManagement",
            id: 0x3f,
            description: "Group Key Management",
            details: "The Group Key Management Cluster is the mechanism by which group keys are managed.",

            children: [
                Attribute({
                    name: "GroupKeyMap",
                    id: 0x0,
                    type: "list",
                    access: "RW VM",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "GroupKeyMapStruct" })],
                }),
                Attribute({
                    name: "GroupTable",
                    id: 0x1,
                    type: "list",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "GroupInfoMapStruct" })],
                }),
                Attribute({ name: "MaxGroupsPerFabric", id: 0x2, type: "uint16", conformance: "M" }),
                Attribute({ name: "MaxGroupKeysPerFabric", id: 0x3, type: "uint16", conformance: "M" }),
                Command({
                    name: "KeySetWrite",
                    id: 0x0,
                    access: "R F A",
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "GroupKeySet", type: "GroupKeySetStruct", conformance: "M" })],
                }),
                Command({
                    name: "KeySetRead",
                    id: 0x1,
                    access: "R F A",
                    conformance: "M",
                    direction: "request",
                    response: "KeySetReadResponse",
                    children: [Field({ name: "GroupKeySetId", type: "uint16", conformance: "M" })],
                }),
                Command({
                    name: "KeySetReadResponse",
                    id: 0x2,
                    conformance: "M",
                    direction: "response",
                    children: [Field({ name: "GroupKeySet", type: "GroupKeySetStruct", conformance: "M" })],
                }),
                Command({
                    name: "KeySetRemove",
                    id: 0x3,
                    access: "R F A",
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "GroupKeySetId", type: "uint16", conformance: "M" })],
                }),

                Command({
                    name: "KeySetReadAllIndices",
                    id: 0x4,
                    access: "R F A",
                    conformance: "M",
                    direction: "request",
                    response: "KeySetReadAllIndicesResponse",
                    children: [
                        Field({
                            name: "GroupKeySetIDs",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "uint16" })],
                        }),
                    ],
                }),

                Command({
                    name: "KeySetReadAllIndicesResponse",
                    id: 0x5,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({
                            name: "GroupKeySetIDs",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "uint16" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "GroupKeyMapStruct",
                    type: "struct",
                    access: "R F",
                    conformance: "M",
                    children: [
                        Field({ name: "GroupId", id: 0x1, type: "group-id", conformance: "M" }),
                        Field({ name: "GroupKeySetId", id: 0x2, type: "uint16", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "GroupInfoMapStruct",
                    type: "struct",
                    access: "R F",
                    conformance: "M",

                    children: [
                        Field({ name: "GroupId", id: 0x1, type: "group-id", conformance: "M" }),
                        Field({
                            name: "Endpoints",
                            id: 0x2,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "endpoint-no" })],
                        }),
                        Field({ name: "GroupName", id: 0x3, type: "string", conformance: "O", constraint: "max 16" }),
                    ],
                }),

                Datatype({
                    name: "GroupKeySetStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "GroupKeySetId", id: 0x0, type: "uint16", conformance: "M" }),
                        Field({
                            name: "GroupKeySecurityPolicy",
                            id: 0x1,
                            type: "GroupKeySecurityPolicyEnum",
                            conformance: "M",
                        }),
                        Field({ name: "EpochKey0", id: 0x2, type: "octstr", conformance: "M", quality: "X" }),
                        Field({ name: "EpochStartTime0", id: 0x3, type: "epoch-us", conformance: "M", quality: "X" }),
                        Field({ name: "EpochKey1", id: 0x4, type: "octstr", conformance: "M", quality: "X" }),
                        Field({ name: "EpochStartTime1", id: 0x5, type: "epoch-us", conformance: "M", quality: "X" }),
                        Field({ name: "EpochKey2", id: 0x6, type: "octstr", conformance: "M", quality: "X" }),
                        Field({ name: "EpochStartTime2", id: 0x7, type: "epoch-us", conformance: "M", quality: "X" }),
                    ],
                }),

                Datatype({
                    name: "GroupKeySecurityPolicyEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "TrustFirst", id: 0x0, conformance: "M" }),
                        Field({ name: "CacheAndSync", id: 0x1, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "Groups",
            id: 0x4,
            description: "Groups",
            details: "Attributes and commands for group configuration and manipulation.",

            children: [
                Attribute({ name: "GroupNameSupport", id: 0x0, type: "map8", conformance: "M" }),

                Command({
                    name: "AddGroup",
                    id: 0x0,
                    access: "R F M",
                    conformance: "M",
                    direction: "request",
                    response: "AddGroupResponse",
                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "GroupName", type: "string", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "ViewGroup",
                    id: 0x1,
                    access: "R F",
                    conformance: "M",
                    direction: "request",
                    response: "ViewGroupResponse",
                    children: [Field({ name: "GroupId", type: "group-id", conformance: "M" })],
                }),

                Command({
                    name: "GetGroupMembership",
                    id: 0x2,
                    access: "R F",
                    conformance: "M",
                    direction: "request",
                    response: "GetGroupMembershipResponse",
                    children: [
                        Field({
                            name: "GroupList",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "group-id" })],
                        }),
                    ],
                }),

                Command({
                    name: "RemoveGroup",
                    id: 0x3,
                    access: "R F M",
                    conformance: "M",
                    direction: "request",
                    response: "RemoveGroupResponse",
                    children: [Field({ name: "GroupId", type: "group-id", conformance: "M" })],
                }),
                Command({ name: "RemoveAllGroups", id: 0x4, access: "R F M", conformance: "M", direction: "request" }),

                Command({
                    name: "AddGroupIfIdentifying",
                    id: 0x5,
                    access: "R F M",
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "GroupName", type: "string", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "AddGroupResponse",
                    id: 0x0,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "ViewGroupResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "GroupName", type: "string", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "GetGroupMembershipResponse",
                    id: 0x2,
                    conformance: "M",
                    direction: "response",

                    children: [
                        Field({ name: "Capacity", type: "uint8", conformance: "M", quality: "X" }),
                        Field({
                            name: "GroupList",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "group-id" })],
                        }),
                    ],
                }),

                Command({
                    name: "RemoveGroupResponse",
                    id: 0x3,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "Identify",
            id: 0x3,
            description: "Identify",
            details: "Attributes and commands for putting a device into Identification mode (e.g. flashing a light).",

            children: [
                Attribute({
                    name: "IdentifyTime",
                    id: 0x0,
                    type: "uint16",
                    access: "RW",
                    conformance: "M",
                    default: 0,
                }),

                Attribute({
                    name: "IdentifyType",
                    id: 0x1,
                    type: "enum8",
                    conformance: "M",
                    default: 0,

                    children: [
                        Field({ name: "None", id: 0x0, conformance: "M" }),
                        Field({ name: "VisibleLight", id: 0x1, conformance: "M" }),
                        Field({ name: "VisibleLed", id: 0x2, conformance: "M" }),
                        Field({ name: "AudibleBeep", id: 0x3, conformance: "M" }),
                        Field({ name: "Display", id: 0x4, conformance: "M" }),
                        Field({ name: "Actuator", id: 0x5, conformance: "M" }),
                    ],
                }),

                Command({
                    name: "Identify",
                    id: 0x0,
                    access: "R M",
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "IdentifyTime", type: "uint16", conformance: "M" })],
                }),

                Command({
                    name: "TriggerEffect",
                    id: 0x40,
                    access: "R M",
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "EffectIdentifier", type: "IdentifyEffectIdentifier", conformance: "M" }),
                        Field({ name: "EffectVariant", type: "IdentifyEffectVariant", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "IdentifyEffectIdentifier",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Blink", id: 0x0, conformance: "M" }),
                        Field({ name: "Breathe", id: 0x1, conformance: "M" }),
                        Field({ name: "Okay", id: 0x2, conformance: "M" }),
                        Field({ name: "ChannelChange", id: 0xb, conformance: "M" }),
                        Field({ name: "FinishEffect", id: 0xfe, conformance: "M" }),
                        Field({ name: "StopEffect", id: 0xff, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "IdentifyEffectVariant",
                    type: "enum8",
                    conformance: "M",
                    children: [Field({ name: "Default", id: 0x0, conformance: "M" })],
                }),
            ],
        }),

        Cluster({
            name: "IlluminanceMeasurement",
            id: 0x400,
            description: "Illuminance Measurement",
            details:
                "Attributes and commands for configuring the measurement of illuminance, and reporting illuminance " +
                "measurements.",

            children: [
                Attribute({
                    name: "IllumMeasuredValue",
                    id: 0x0,
                    type: "uint16",
                    conformance: "M",
                    default: 0,
                    quality: "X P",
                }),
                Attribute({
                    name: "IllumMinMeasuredValue",
                    id: 0x1,
                    type: "uint16",
                    conformance: "M",
                    constraint: "1 to 65533",
                    quality: "X",
                }),
                Attribute({
                    name: "IllumMaxMeasuredValue",
                    id: 0x2,
                    type: "uint16",
                    conformance: "M",
                    constraint: "2 to 65534",
                    quality: "X",
                }),
                Attribute({
                    name: "IllumTolerance",
                    id: 0x3,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 2048",
                }),
                Attribute({
                    name: "IllumLightSensorType",
                    id: 0x4,
                    type: "enum8",
                    conformance: "O",
                    default: 255,
                    quality: "X",
                }),
            ],
        }),

        Cluster({
            name: "KeypadInput",
            id: 0x509,
            description: "Keypad Input",
            details:
                "This cluster provides an interface for controlling a device like a TV using action commands such as " +
                "UP, DOWN, and SELECT.",

            children: [
                Command({
                    name: "SendKey",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    response: "SendKeyResponse",
                    children: [Field({ name: "KeyCode", type: "CecKeyCode", conformance: "M" })],
                }),
                Command({
                    name: "SendKeyResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",
                    children: [Field({ name: "Status", type: "KeypadInputStatusEnum", conformance: "M" })],
                }),

                Datatype({
                    name: "CecKeyCode",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Select", id: 0x0, conformance: "M" }),
                        Field({ name: "Up", id: 0x1, conformance: "M" }),
                        Field({ name: "Down", id: 0x2, conformance: "M" }),
                        Field({ name: "Left", id: 0x3, conformance: "M" }),
                        Field({ name: "Right", id: 0x4, conformance: "M" }),
                        Field({ name: "RightUp", id: 0x5, conformance: "M" }),
                        Field({ name: "RightDown", id: 0x6, conformance: "M" }),
                        Field({ name: "LeftUp", id: 0x7, conformance: "M" }),
                        Field({ name: "LeftDown", id: 0x8, conformance: "M" }),
                        Field({ name: "RootMenu", id: 0x9, conformance: "M" }),
                        Field({ name: "SetupMenu", id: 0xa, conformance: "M" }),
                        Field({ name: "ContentsMenu", id: 0xb, conformance: "M" }),
                        Field({ name: "FavoriteMenu", id: 0xc, conformance: "M" }),
                        Field({ name: "Exit", id: 0xd, conformance: "M" }),
                        Field({ name: "MediaTopMenu", id: 0x10, conformance: "M" }),
                        Field({ name: "MediaContextSensitiveMenu", id: 0x11, conformance: "M" }),
                        Field({ name: "NumberEntryMode", id: 0x1d, conformance: "M" }),
                        Field({ name: "Number11", id: 0x1e, conformance: "M" }),
                        Field({ name: "Number12", id: 0x1f, conformance: "M" }),
                        Field({ name: "Number0OrNumber10", id: 0x20, conformance: "M" }),
                        Field({ name: "Numbers1", id: 0x21, conformance: "M" }),
                        Field({ name: "Numbers2", id: 0x22, conformance: "M" }),
                        Field({ name: "Numbers3", id: 0x23, conformance: "M" }),
                        Field({ name: "Numbers4", id: 0x24, conformance: "M" }),
                        Field({ name: "Numbers5", id: 0x25, conformance: "M" }),
                        Field({ name: "Numbers6", id: 0x26, conformance: "M" }),
                        Field({ name: "Numbers7", id: 0x27, conformance: "M" }),
                        Field({ name: "Numbers8", id: 0x28, conformance: "M" }),
                        Field({ name: "Numbers9", id: 0x29, conformance: "M" }),
                        Field({ name: "Dot", id: 0x2a, conformance: "M" }),
                        Field({ name: "Enter", id: 0x2b, conformance: "M" }),
                        Field({ name: "Clear", id: 0x2c, conformance: "M" }),
                        Field({ name: "NextFavorite", id: 0x2f, conformance: "M" }),
                        Field({ name: "ChannelUp", id: 0x30, conformance: "M" }),
                        Field({ name: "ChannelDown", id: 0x31, conformance: "M" }),
                        Field({ name: "PreviousChannel", id: 0x32, conformance: "M" }),
                        Field({ name: "SoundSelect", id: 0x33, conformance: "M" }),
                        Field({ name: "InputSelect", id: 0x34, conformance: "M" }),
                        Field({ name: "DisplayInformation", id: 0x35, conformance: "M" }),
                        Field({ name: "Help", id: 0x36, conformance: "M" }),
                        Field({ name: "PageUp", id: 0x37, conformance: "M" }),
                        Field({ name: "PageDown", id: 0x38, conformance: "M" }),
                        Field({ name: "Power", id: 0x40, conformance: "M" }),
                        Field({ name: "VolumeUp", id: 0x41, conformance: "M" }),
                        Field({ name: "VolumeDown", id: 0x42, conformance: "M" }),
                        Field({ name: "Mute", id: 0x43, conformance: "M" }),
                        Field({ name: "Play", id: 0x44, conformance: "M" }),
                        Field({ name: "Stop", id: 0x45, conformance: "M" }),
                        Field({ name: "Pause", id: 0x46, conformance: "M" }),
                        Field({ name: "Record", id: 0x47, conformance: "M" }),
                        Field({ name: "Rewind", id: 0x48, conformance: "M" }),
                        Field({ name: "FastForward", id: 0x49, conformance: "M" }),
                        Field({ name: "Eject", id: 0x4a, conformance: "M" }),
                        Field({ name: "Forward", id: 0x4b, conformance: "M" }),
                        Field({ name: "Backward", id: 0x4c, conformance: "M" }),
                        Field({ name: "StopRecord", id: 0x4d, conformance: "M" }),
                        Field({ name: "PauseRecord", id: 0x4e, conformance: "M" }),
                        Field({ name: "Reserved", id: 0x4f, conformance: "M" }),
                        Field({ name: "Angle", id: 0x50, conformance: "M" }),
                        Field({ name: "SubPicture", id: 0x51, conformance: "M" }),
                        Field({ name: "VideoOnDemand", id: 0x52, conformance: "M" }),
                        Field({ name: "ElectronicProgramGuide", id: 0x53, conformance: "M" }),
                        Field({ name: "TimerProgramming", id: 0x54, conformance: "M" }),
                        Field({ name: "InitialConfiguration", id: 0x55, conformance: "M" }),
                        Field({ name: "SelectBroadcastType", id: 0x56, conformance: "M" }),
                        Field({ name: "SelectSoundPresentation", id: 0x57, conformance: "M" }),
                        Field({ name: "PlayFunction", id: 0x60, conformance: "M" }),
                        Field({ name: "PausePlayFunction", id: 0x61, conformance: "M" }),
                        Field({ name: "RecordFunction", id: 0x62, conformance: "M" }),
                        Field({ name: "PauseRecordFunction", id: 0x63, conformance: "M" }),
                        Field({ name: "StopFunction", id: 0x64, conformance: "M" }),
                        Field({ name: "MuteFunction", id: 0x65, conformance: "M" }),
                        Field({ name: "RestoreVolumeFunction", id: 0x66, conformance: "M" }),
                        Field({ name: "TuneFunction", id: 0x67, conformance: "M" }),
                        Field({ name: "SelectMediaFunction", id: 0x68, conformance: "M" }),
                        Field({ name: "SelectAvInputFunction", id: 0x69, conformance: "M" }),
                        Field({ name: "SelectAudioInputFunction", id: 0x6a, conformance: "M" }),
                        Field({ name: "PowerToggleFunction", id: 0x6b, conformance: "M" }),
                        Field({ name: "PowerOffFunction", id: 0x6c, conformance: "M" }),
                        Field({ name: "PowerOnFunction", id: 0x6d, conformance: "M" }),
                        Field({ name: "F1Blue", id: 0x71, conformance: "M" }),
                        Field({ name: "F2Red", id: 0x72, conformance: "M" }),
                        Field({ name: "F3Green", id: 0x73, conformance: "M" }),
                        Field({ name: "F4Yellow", id: 0x74, conformance: "M" }),
                        Field({ name: "F5", id: 0x75, conformance: "M" }),
                        Field({ name: "Data", id: 0x76, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "KeypadInputStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "UnsupportedKey", id: 0x1, conformance: "M" }),
                        Field({ name: "InvalidKeyInCurrentState", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "LevelControl",
            id: 0x8,
            description: "Level Control",
            details:
                "Attributes and commands for controlling devices that can be set to a level between fully 'On' and " +
                "fully 'Off.'",

            children: [
                Attribute({ name: "CurrentLevel", id: 0x0, type: "uint8", conformance: "M", default: 0, quality: "X" }),
                Attribute({ name: "LevelControlRemainingTime", id: 0x1, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "MinimumLevel", id: 0x2, type: "uint8", conformance: "O", default: 0 }),
                Attribute({ name: "MaximumLevel", id: 0x3, type: "uint8", conformance: "O", default: 0 }),
                Attribute({ name: "CurrentFrequency", id: 0x4, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "MinFrequency", id: 0x5, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "MaxFrequency", id: 0x6, type: "uint16", conformance: "O", default: 0 }),
                Attribute({
                    name: "OnOffTransitionTime",
                    id: 0x10,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "OnLevel", id: 0x11, type: "uint8", access: "RW", conformance: "M", quality: "X" }),
                Attribute({
                    name: "OnTransitionTime",
                    id: 0x12,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "OffTransitionTime",
                    id: 0x13,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "DefaultMoveRate",
                    id: 0x14,
                    type: "uint8",
                    access: "RW",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "Options",
                    id: 0xf,
                    type: "LevelControlOptions",
                    access: "RW",
                    conformance: "M",
                    default: 0,
                }),
                Attribute({
                    name: "StartUpCurrentLevel",
                    id: 0x4000,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    quality: "X",
                }),

                Command({
                    name: "MoveToLevel",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",

                    children: [
                        Field({ name: "Level", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "OptionsMask", type: "Options", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "Options", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "Move",
                    id: 0x1,
                    conformance: "M",
                    direction: "request",

                    children: [
                        Field({ name: "MoveMode", type: "MoveMode", conformance: "M" }),
                        Field({ name: "Rate", type: "uint8", conformance: "M", quality: "X" }),
                        Field({ name: "OptionsMask", type: "Options", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "Options", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "Step",
                    id: 0x2,
                    conformance: "M",
                    direction: "request",

                    children: [
                        Field({ name: "StepMode", type: "StepMode", conformance: "M" }),
                        Field({ name: "StepSize", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "OptionsMask", type: "Options", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "Options", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "Stop",
                    id: 0x3,
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "OptionsMask", type: "Options", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "Options", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveToLevelWithOnOff",
                    id: 0x4,
                    conformance: "M",
                    direction: "request",

                    children: [
                        Field({ name: "Level", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "OptionsMask", type: "Options", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "Options", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveWithOnOff",
                    id: 0x5,
                    conformance: "M",
                    direction: "request",

                    children: [
                        Field({ name: "MoveMode", type: "MoveMode", conformance: "M" }),
                        Field({ name: "Rate", type: "uint8", conformance: "M", quality: "X" }),
                        Field({ name: "OptionsMask", type: "Options", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "Options", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "StepWithOnOff",
                    id: 0x6,
                    conformance: "M",
                    direction: "request",

                    children: [
                        Field({ name: "StepMode", type: "StepMode", conformance: "M" }),
                        Field({ name: "StepSize", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M", quality: "X" }),
                        Field({ name: "OptionsMask", type: "Options", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "Options", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "StopWithOnOff",
                    id: 0x7,
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "OptionsMask", type: "Options", conformance: "M" }),
                        Field({ name: "OptionsOverride", type: "Options", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "MoveToClosestFrequency",
                    id: 0x8,
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "Frequency", type: "uint16", conformance: "M" })],
                }),

                Datatype({
                    name: "LevelControlOptions",
                    type: "map8",
                    conformance: "M",
                    children: [
                        Field({ name: "ExecuteIfOff", constraint: "0" }),
                        Field({ name: "CoupleColorTempToLevel", constraint: "1" }),
                    ],
                }),

                Datatype({
                    name: "MoveMode",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Up", id: 0x0, conformance: "M" }),
                        Field({ name: "Down", id: 0x1, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "StepMode",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Up", id: 0x0, conformance: "M" }),
                        Field({ name: "Down", id: 0x1, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "LocalizationConfiguration",
            id: 0x2b,
            description: "Localization Configuration",
            details:
                "Nodes should be expected to be deployed to any and all regions of the world. These global regions " +
                "may have differing common languages, units of measurements, and numerical formatting standards. As " +
                "such, Nodes that visually or audibly convey information need a mechanism by which they can be " +
                "configured to use a user’s preferred language, units, etc",

            children: [
                Attribute({
                    name: "ActiveLocale",
                    id: 0x0,
                    type: "string",
                    access: "RW",
                    conformance: "M",
                    constraint: "max 35",
                }),
                Attribute({
                    name: "SupportedLocales",
                    id: 0x1,
                    type: "list",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "string" })],
                }),
            ],
        }),

        Cluster({
            name: "LowPower",
            id: 0x508,
            description: "Low Power",
            details: "This cluster provides an interface for managing low power mode on a device.",
            children: [Command({ name: "Sleep", id: 0x0, conformance: "M", direction: "request" })],
        }),

        Cluster({
            name: "MediaInput",
            id: 0x507,
            description: "Media Input",
            details:
                "This cluster provides an interface for controlling the Input Selector on a media device such as a " +
                "TV.",

            children: [
                Attribute({
                    name: "MediaInputList",
                    id: 0x0,
                    type: "list",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "InputInfoStruct" })],
                }),
                Attribute({ name: "MediaInputCurrentInput", id: 0x1, type: "uint8", conformance: "M", default: 0 }),
                Command({
                    name: "SelectInput",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "Index", type: "uint8", conformance: "M" })],
                }),
                Command({ name: "ShowInputStatus", id: 0x1, conformance: "M", direction: "request" }),
                Command({ name: "HideInputStatus", id: 0x2, conformance: "M", direction: "request" }),

                Command({
                    name: "RenameInput",
                    id: 0x3,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "Index", type: "uint8", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "InputInfoStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "Index", type: "uint8", conformance: "M" }),
                        Field({ name: "InputType", type: "InputTypeEnum", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "M", constraint: "max 32" }),
                        Field({ name: "Description", type: "string", conformance: "M", constraint: "max 32" }),
                    ],
                }),

                Datatype({
                    name: "InputTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Internal", id: 0x0, conformance: "M" }),
                        Field({ name: "Aux", id: 0x1, conformance: "M" }),
                        Field({ name: "Coax", id: 0x2, conformance: "M" }),
                        Field({ name: "Composite", id: 0x3, conformance: "M" }),
                        Field({ name: "Hdmi", id: 0x4, conformance: "M" }),
                        Field({ name: "Input", id: 0x5, conformance: "M" }),
                        Field({ name: "Line", id: 0x6, conformance: "M" }),
                        Field({ name: "Optical", id: 0x7, conformance: "M" }),
                        Field({ name: "Video", id: 0x8, conformance: "M" }),
                        Field({ name: "Scart", id: 0x9, conformance: "M" }),
                        Field({ name: "Usb", id: 0xa, conformance: "M" }),
                        Field({ name: "Other", id: 0xb, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "MediaPlayback",
            id: 0x506,
            description: "Media Playback",
            details:
                "This cluster provides an interface for controlling Media Playback (PLAY, PAUSE, etc) on a media " +
                "device such as a TV or Speaker.",

            children: [
                Attribute({
                    name: "MediaPlaybackState",
                    id: 0x0,
                    type: "PlaybackStateEnum",
                    conformance: "M",
                    default: 0,
                }),
                Attribute({
                    name: "MediaPlaybackStartTime",
                    id: 0x1,
                    type: "epoch-us",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "MediaPlaybackDuration",
                    id: 0x2,
                    type: "uint64",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "MediaPlaybackPlaybackPosition",
                    id: 0x3,
                    type: "PlaybackPositionStruct",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "MediaPlaybackPlaybackSpeed",
                    id: 0x4,
                    type: "single",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "MediaPlaybackPlaybackSeekRangeEnd",
                    id: 0x5,
                    type: "uint64",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "MediaPlaybackPlaybackSeekRangeStart",
                    id: 0x6,
                    type: "uint64",
                    conformance: "O",
                    quality: "X",
                }),
                Command({
                    name: "Play",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    response: "PlaybackResponse",
                }),
                Command({
                    name: "Pause",
                    id: 0x1,
                    conformance: "M",
                    direction: "request",
                    response: "PlaybackResponse",
                }),
                Command({
                    name: "Stop",
                    id: 0x2,
                    conformance: "M",
                    direction: "request",
                    response: "PlaybackResponse",
                }),
                Command({
                    name: "StartOver",
                    id: 0x3,
                    conformance: "O",
                    direction: "request",
                    response: "PlaybackResponse",
                }),
                Command({
                    name: "Previous",
                    id: 0x4,
                    conformance: "O",
                    direction: "request",
                    response: "PlaybackResponse",
                }),
                Command({
                    name: "Next",
                    id: 0x5,
                    conformance: "O",
                    direction: "request",
                    response: "PlaybackResponse",
                }),
                Command({
                    name: "Rewind",
                    id: 0x6,
                    conformance: "O",
                    direction: "request",
                    response: "PlaybackResponse",
                }),
                Command({
                    name: "FastForward",
                    id: 0x7,
                    conformance: "O",
                    direction: "request",
                    response: "PlaybackResponse",
                }),
                Command({
                    name: "SkipForward",
                    id: 0x8,
                    conformance: "O",
                    direction: "request",
                    response: "PlaybackResponse",
                    children: [Field({ name: "DeltaPositionMilliseconds", type: "uint64", conformance: "M" })],
                }),
                Command({
                    name: "SkipBackward",
                    id: 0x9,
                    conformance: "O",
                    direction: "request",
                    response: "PlaybackResponse",
                    children: [Field({ name: "DeltaPositionMilliseconds", type: "uint64", conformance: "M" })],
                }),
                Command({
                    name: "Seek",
                    id: 0xb,
                    conformance: "O",
                    direction: "request",
                    response: "PlaybackResponse",
                    children: [Field({ name: "Position", type: "uint64", conformance: "M" })],
                }),

                Command({
                    name: "PlaybackResponse",
                    id: 0xa,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "MediaPlaybackStatusEnum", conformance: "M" }),
                        Field({ name: "Data", type: "string", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "PlaybackStateEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Playing", id: 0x0, conformance: "M" }),
                        Field({ name: "Paused", id: 0x1, conformance: "M" }),
                        Field({ name: "NotPlaying", id: 0x2, conformance: "M" }),
                        Field({ name: "Buffering", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "PlaybackPositionStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "UpdatedAt", type: "epoch-us", conformance: "M" }),
                        Field({ name: "Position", type: "uint64", conformance: "M", quality: "X" }),
                    ],
                }),

                Datatype({
                    name: "MediaPlaybackStatusEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "InvalidStateForCommand", id: 0x1, conformance: "M" }),
                        Field({ name: "NotAllowed", id: 0x2, conformance: "M" }),
                        Field({ name: "NotActive", id: 0x3, conformance: "M" }),
                        Field({ name: "SpeedOutOfRange", id: 0x4, conformance: "M" }),
                        Field({ name: "SeekOutOfRange", id: 0x5, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "ModeSelect",
            id: 0x50,
            description: "Mode Select",
            details: "Attributes and commands for selecting a mode from a list of supported options.",

            children: [
                Attribute({ name: "ModeDescription", id: 0x0, type: "string", conformance: "M", constraint: "max 32" }),
                Attribute({ name: "StandardNamespace", id: 0x1, type: "enum16", conformance: "M", quality: "X" }),
                Attribute({
                    name: "SupportedModes",
                    id: 0x2,
                    type: "list",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "ModeOptionStruct" })],
                }),
                Attribute({ name: "CurrentMode", id: 0x3, type: "uint8", conformance: "M", quality: "P" }),
                Attribute({
                    name: "StartUpMode",
                    id: 0x4,
                    type: "uint8",
                    access: "RW",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({ name: "OnMode", id: 0x5, type: "uint8", access: "RW", conformance: "O", quality: "X" }),
                Command({
                    name: "ChangeToMode",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "NewMode", type: "uint8", conformance: "M" })],
                }),

                Datatype({
                    name: "ModeOptionStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "Label", type: "string", conformance: "M", constraint: "max 64" }),
                        Field({ name: "Mode", type: "uint8", conformance: "M" }),
                        Field({
                            name: "SemanticTags",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "SemanticTagStruct" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "SemanticTagStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "MfgCode", type: "vendor-id", conformance: "M" }),
                        Field({ name: "Value", type: "enum16", conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "NetworkCommissioning",
            id: 0x31,
            description: "Network Commissioning",
            details: "Functionality to configure, enable, disable network credentials and access on a Matter device.",

            children: [
                Attribute({ name: "MaxNetworks", id: 0x0, type: "uint8", access: "R A", conformance: "M" }),
                Attribute({
                    name: "Networks",
                    id: 0x1,
                    type: "list",
                    access: "R A",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "NetworkInfo" })],
                }),
                Attribute({ name: "ScanMaxTimeSeconds", id: 0x2, type: "uint8", conformance: "O" }),
                Attribute({ name: "ConnectMaxTimeSeconds", id: 0x3, type: "uint8", conformance: "O" }),
                Attribute({ name: "InterfaceEnabled", id: 0x4, type: "bool", access: "RW VA", conformance: "M" }),
                Attribute({
                    name: "LastNetworkingStatus",
                    id: 0x5,
                    type: "NetworkCommissioningStatus",
                    access: "R A",
                    conformance: "M",
                    quality: "X",
                }),
                Attribute({
                    name: "LastNetworkId",
                    id: 0x6,
                    type: "octstr",
                    access: "R A",
                    conformance: "M",
                    quality: "X",
                }),
                Attribute({
                    name: "LastConnectErrorValue",
                    id: 0x7,
                    type: "int32",
                    access: "R A",
                    conformance: "M",
                    quality: "X",
                }),

                Command({
                    name: "ScanNetworks",
                    id: 0x0,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "ScanNetworksResponse",
                    children: [
                        Field({ name: "Ssid", type: "octstr", conformance: "O", quality: "X" }),
                        Field({ name: "Breadcrumb", type: "uint64", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "ScanNetworksResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",

                    children: [
                        Field({ name: "NetworkingStatus", type: "NetworkCommissioningStatus", conformance: "M" }),
                        Field({ name: "DebugText", type: "string", conformance: "O" }),
                        Field({
                            name: "WiFiScanResults",
                            type: "list",
                            conformance: "O",
                            children: [Field({ name: "entry", type: "WiFiInterfaceScanResult" })],
                        }),
                        Field({
                            name: "ThreadScanResults",
                            type: "list",
                            conformance: "O",
                            children: [Field({ name: "entry", type: "ThreadInterfaceScanResult" })],
                        }),
                    ],
                }),

                Command({
                    name: "AddOrUpdateWiFiNetwork",
                    id: 0x2,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    response: "NetworkConfigResponse",
                    children: [
                        Field({ name: "Ssid", type: "octstr", conformance: "M" }),
                        Field({ name: "Credentials", type: "octstr", conformance: "M" }),
                        Field({ name: "Breadcrumb", type: "uint64", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "AddOrUpdateThreadNetwork",
                    id: 0x3,
                    access: "R A",
                    conformance: "O",
                    direction: "request",
                    response: "NetworkConfigResponse",
                    children: [
                        Field({ name: "OperationalDataset", type: "octstr", conformance: "M" }),
                        Field({ name: "Breadcrumb", type: "uint64", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "RemoveNetwork",
                    id: 0x4,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "NetworkConfigResponse",
                    children: [
                        Field({ name: "NetworkId", type: "octstr", conformance: "M" }),
                        Field({ name: "Breadcrumb", type: "uint64", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "NetworkConfigResponse",
                    id: 0x5,
                    conformance: "O",
                    direction: "response",
                    children: [
                        Field({ name: "NetworkingStatus", type: "NetworkCommissioningStatus", conformance: "M" }),
                        Field({ name: "DebugText", type: "string", conformance: "O", constraint: "max 512" }),
                        Field({ name: "NetworkIndex", type: "uint8", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "ConnectNetwork",
                    id: 0x6,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "ConnectNetworkResponse",
                    children: [
                        Field({ name: "NetworkId", type: "octstr", conformance: "M" }),
                        Field({ name: "Breadcrumb", type: "uint64", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "ConnectNetworkResponse",
                    id: 0x7,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "NetworkingStatus", type: "NetworkCommissioningStatus", conformance: "M" }),
                        Field({ name: "DebugText", type: "string", conformance: "O" }),
                        Field({ name: "ErrorValue", type: "int32", conformance: "M", quality: "X" }),
                    ],
                }),

                Command({
                    name: "ReorderNetwork",
                    id: 0x8,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "NetworkConfigResponse",
                    children: [
                        Field({ name: "NetworkId", type: "octstr", conformance: "M" }),
                        Field({ name: "NetworkIndex", type: "uint8", conformance: "M" }),
                        Field({ name: "Breadcrumb", type: "uint64", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "NetworkInfo",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "NetworkId", type: "octstr", conformance: "M" }),
                        Field({ name: "Connected", type: "bool", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "NetworkCommissioningStatus",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "OutOfRange", id: 0x1, conformance: "M" }),
                        Field({ name: "BoundsExceeded", id: 0x2, conformance: "M" }),
                        Field({ name: "NetworkIdNotFound", id: 0x3, conformance: "M" }),
                        Field({ name: "DuplicateNetworkId", id: 0x4, conformance: "M" }),
                        Field({ name: "NetworkNotFound", id: 0x5, conformance: "M" }),
                        Field({ name: "RegulatoryError", id: 0x6, conformance: "M" }),
                        Field({ name: "AuthFailure", id: 0x7, conformance: "M" }),
                        Field({ name: "UnsupportedSecurity", id: 0x8, conformance: "M" }),
                        Field({ name: "OtherConnectionFailure", id: 0x9, conformance: "M" }),
                        Field({ name: "Ipv6Failed", id: 0xa, conformance: "M" }),
                        Field({ name: "IpBindFailed", id: 0xb, conformance: "M" }),
                        Field({ name: "UnknownError", id: 0xc, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "WiFiInterfaceScanResult",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "Security", type: "WiFiSecurity", conformance: "M" }),
                        Field({ name: "Ssid", type: "octstr", conformance: "M" }),
                        Field({ name: "Bssid", type: "octstr", conformance: "M" }),
                        Field({ name: "Channel", type: "uint16", conformance: "M" }),
                        Field({ name: "WiFiBand", type: "WiFiBand", conformance: "M" }),
                        Field({ name: "Rssi", type: "int8", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "WiFiSecurity",
                    type: "map8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unencrypted", constraint: "0" }),
                        Field({ name: "WEP", constraint: "1" }),
                        Field({ name: "WPA-PERSONAL", constraint: "2" }),
                        Field({ name: "WPA2-PERSONAL", constraint: "3" }),
                        Field({ name: "WPA3-PERSONAL", constraint: "4" }),
                    ],
                }),

                Datatype({
                    name: "WiFiBand",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "2G4", id: 0x0, conformance: "M" }),
                        Field({ name: "3G65", id: 0x1, conformance: "M" }),
                        Field({ name: "5G", id: 0x2, conformance: "M" }),
                        Field({ name: "6G", id: 0x3, conformance: "M" }),
                        Field({ name: "60G", id: 0x4, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ThreadInterfaceScanResult",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "PanId", type: "uint16", conformance: "M" }),
                        Field({ name: "ExtendedPanId", type: "uint64", conformance: "M" }),
                        Field({ name: "NetworkName", type: "string", conformance: "M", constraint: "max 16" }),
                        Field({ name: "Channel", type: "uint16", conformance: "M" }),
                        Field({ name: "Version", type: "uint8", conformance: "M" }),
                        Field({ name: "ExtendedAddress", type: "octstr", conformance: "M" }),
                        Field({ name: "Rssi", type: "int8", conformance: "M" }),
                        Field({ name: "Lqi", type: "uint8", conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "OccupancySensing",
            id: 0x406,
            description: "Occupancy Sensing",
            details: "Attributes and commands for configuring occupancy sensing, and reporting occupancy status.",

            children: [
                Attribute({ name: "Occupancy", id: 0x0, type: "OccupancyBitmap", conformance: "M", quality: "P" }),
                Attribute({ name: "OccupancySensorType", id: 0x1, type: "OccupancySensorTypeEnum", conformance: "M" }),
                Attribute({
                    name: "OccupancySensorTypeBitmap",
                    id: 0x2,
                    type: "OccupancySensorTypeBitmap",
                    conformance: "M",
                }),
                Attribute({
                    name: "PirOccupiedToUnoccupiedDelay",
                    id: 0x10,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "PirUnoccupiedToOccupiedDelay",
                    id: 0x11,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "PirUnoccupiedToOccupiedThreshold",
                    id: 0x12,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "1 to 254",
                    default: 1,
                }),
                Attribute({
                    name: "UltrasonicOccupiedToUnoccupiedDelay",
                    id: 0x20,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "UltrasonicUnoccupiedToOccupiedDelay",
                    id: 0x21,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "UltrasonicUnoccupiedToOccupiedThreshold",
                    id: 0x22,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "1 to 254",
                    default: 1,
                }),
                Attribute({
                    name: "PhysicalContactOccupiedToUnoccupiedDelay",
                    id: 0x30,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "PhysicalContactUnoccupiedToOccupiedDelay",
                    id: 0x31,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "PhysicalContactUnoccupiedToOccupiedThreshold",
                    id: 0x32,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "1 to 254",
                    default: 1,
                }),
                Datatype({
                    name: "OccupancyBitmap",
                    type: "map8",
                    conformance: "M",
                    children: [Field({ name: "Occupied", constraint: "0" })],
                }),

                Datatype({
                    name: "OccupancySensorTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Pir", id: 0x0, conformance: "M" }),
                        Field({ name: "Ultrasonic", id: 0x1, conformance: "M" }),
                        Field({ name: "PirAndUltrasonic", id: 0x2, conformance: "M" }),
                        Field({ name: "PhysicalContact", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OccupancySensorTypeBitmap",
                    type: "map8",
                    conformance: "M",
                    children: [
                        Field({ name: "PIR", constraint: "0" }),
                        Field({ name: "Ultrasonic", constraint: "1" }),
                        Field({ name: "PhysicalContact", constraint: "2" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "OnOff",
            id: 0x6,
            description: "On/Off",
            details: "Attributes and commands for switching devices between 'On' and 'Off' states.",

            children: [
                Attribute({ name: "OnOff", id: 0x0, type: "bool", conformance: "M", default: true, quality: "P" }),
                Attribute({ name: "GlobalSceneControl", id: 0x4000, type: "bool", conformance: "O", default: true }),
                Attribute({ name: "OnTime", id: 0x4001, type: "uint16", access: "RW", conformance: "O", default: 0 }),
                Attribute({
                    name: "OffWaitTime",
                    id: 0x4002,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "StartUpOnOff",
                    id: 0x4003,
                    type: "OnOffStartUpOnOff",
                    access: "RW VM",
                    conformance: "O",
                    quality: "X",
                }),
                Command({ name: "Off", id: 0x0, conformance: "M", direction: "request" }),
                Command({ name: "On", id: 0x1, conformance: "M", direction: "request" }),
                Command({ name: "Toggle", id: 0x2, conformance: "M", direction: "request" }),

                Command({
                    name: "OffWithEffect",
                    id: 0x40,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "EffectIdentifier", type: "OnOffEffectIdentifier", conformance: "M" }),
                        Field({ name: "EffectVariant", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({ name: "OnWithRecallGlobalScene", id: 0x41, conformance: "O", direction: "request" }),

                Command({
                    name: "OnWithTimedOff",
                    id: 0x42,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "OnOffControl", type: "OnOffControl", conformance: "M" }),
                        Field({ name: "OnTime", type: "uint16", conformance: "M" }),
                        Field({ name: "OffWaitTime", type: "uint16", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OnOffStartUpOnOff",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Off", id: 0x0, conformance: "M" }),
                        Field({ name: "On", id: 0x1, conformance: "M" }),
                        Field({ name: "TogglePreviousOnOff", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OnOffEffectIdentifier",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "DelayedAllOff", id: 0x0, conformance: "M" }),
                        Field({ name: "DyingLight", id: 0x1, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OnOffControl",
                    type: "map8",
                    conformance: "M",
                    children: [Field({ name: "AcceptOnlyWhenOn", constraint: "0" })],
                }),
            ],
        }),

        Cluster({
            name: "OperationalCredentials",
            id: 0x3e,
            description: "Operational Credentials",
            details:
                "This cluster is used to add or remove Operational Credentials on a Commissionee or Node, as well as " +
                "manage the associated Fabrics.",

            children: [
                Attribute({
                    name: "Nocs",
                    id: 0x0,
                    type: "list",
                    access: "R A",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "NocStruct" })],
                }),
                Attribute({
                    name: "Fabrics",
                    id: 0x1,
                    type: "list",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "FabricDescriptorStruct" })],
                }),
                Attribute({
                    name: "SupportedFabrics",
                    id: 0x2,
                    type: "uint8",
                    conformance: "M",
                    constraint: "5 to 254",
                }),
                Attribute({ name: "CommissionedFabrics", id: 0x3, type: "uint8", conformance: "M" }),
                Attribute({
                    name: "TrustedRootCertificates",
                    id: 0x4,
                    type: "list",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "octstr" })],
                }),
                Attribute({ name: "CurrentFabricIndex", id: 0x5, type: "uint8", conformance: "M" }),
                Command({
                    name: "AttestationRequest",
                    id: 0x0,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "AttestationResponse",
                    children: [Field({ name: "AttestationNonce", type: "octstr", conformance: "M" })],
                }),

                Command({
                    name: "AttestationResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "AttestationElements", type: "octstr", conformance: "M" }),
                        Field({ name: "AttestationSignature", type: "octstr", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "CertificateChainRequest",
                    id: 0x2,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "CertificateChainResponse",
                    children: [Field({ name: "CertificateType", type: "CertificateChainTypeEnum", conformance: "M" })],
                }),
                Command({
                    name: "CertificateChainResponse",
                    id: 0x3,
                    conformance: "M",
                    direction: "response",
                    children: [Field({ name: "Certificate", type: "octstr", conformance: "M" })],
                }),

                Command({
                    name: "CsrRequest",
                    id: 0x4,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "CsrResponse",
                    children: [
                        Field({ name: "CsrNonce", type: "octstr", conformance: "M" }),
                        Field({ name: "IsForUpdateNoc", type: "bool", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "CsrResponse",
                    id: 0x5,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "NocsrElements", type: "octstr", conformance: "M" }),
                        Field({ name: "AttestationSignature", type: "octstr", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "AddNoc",
                    id: 0x6,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "NocResponse",

                    children: [
                        Field({ name: "NocValue", type: "octstr", conformance: "M" }),
                        Field({ name: "IcacValue", type: "octstr", conformance: "O" }),
                        Field({ name: "IpkValue", type: "octstr", conformance: "M" }),
                        Field({ name: "CaseAdminSubject", type: "uint64", conformance: "M" }),
                        Field({ name: "AdminVendorId", type: "vendor-id", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "UpdateNoc",
                    id: 0x7,
                    access: "R F A",
                    conformance: "M",
                    direction: "request",
                    response: "NocResponse",
                    children: [
                        Field({ name: "NocValue", type: "octstr", conformance: "M" }),
                        Field({ name: "IcacValue", type: "octstr", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "NocResponse",
                    id: 0x8,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "StatusCode", type: "NodeOperationalCertStatusEnum", conformance: "M" }),
                        Field({ name: "FabricIndex", type: "fabric-idx", conformance: "O" }),
                        Field({ name: "DebugText", type: "string", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "UpdateFabricLabel",
                    id: 0x9,
                    access: "R F A",
                    conformance: "M",
                    direction: "request",
                    response: "NocResponse",
                    children: [Field({ name: "Label", type: "string", conformance: "M", constraint: "max 32" })],
                }),
                Command({
                    name: "RemoveFabric",
                    id: 0xa,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    response: "NocResponse",
                    children: [Field({ name: "FabricIndex", type: "fabric-idx", conformance: "M" })],
                }),
                Command({
                    name: "AddTrustedRootCertificate",
                    id: 0xb,
                    access: "R A",
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "RootCaCertificate", type: "octstr", conformance: "M" })],
                }),

                Datatype({
                    name: "NocStruct",
                    type: "struct",
                    access: "R F",
                    conformance: "M",
                    children: [
                        Field({ name: "Noc", id: 0x1, type: "octstr", access: "R S", conformance: "M" }),
                        Field({ name: "Icac", id: 0x2, type: "octstr", access: "R S", conformance: "M", quality: "X" }),
                    ],
                }),

                Datatype({
                    name: "FabricDescriptorStruct",
                    type: "struct",
                    access: "R F",
                    conformance: "M",

                    children: [
                        Field({ name: "RootPublicKey", id: 0x1, type: "octstr", conformance: "M" }),
                        Field({ name: "VendorId", id: 0x2, type: "vendor-id", conformance: "M" }),
                        Field({ name: "FabricId", id: 0x3, type: "fabric-id", conformance: "M" }),
                        Field({ name: "NodeId", id: 0x4, type: "node-id", conformance: "M" }),
                        Field({ name: "Label", id: 0x5, type: "string", conformance: "M", constraint: "max 32" }),
                    ],
                }),

                Datatype({
                    name: "CertificateChainTypeEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "DacCertificate", id: 0x1, conformance: "M" }),
                        Field({ name: "PaiCertificate", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "NodeOperationalCertStatusEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Ok", id: 0x0, conformance: "M" }),
                        Field({ name: "InvalidPublicKey", id: 0x1, conformance: "M" }),
                        Field({ name: "InvalidNodeOpId", id: 0x2, conformance: "M" }),
                        Field({ name: "InvalidNoc", id: 0x3, conformance: "M" }),
                        Field({ name: "MissingCsr", id: 0x4, conformance: "M" }),
                        Field({ name: "TableFull", id: 0x5, conformance: "M" }),
                        Field({ name: "InvalidAdminSubject", id: 0x6, conformance: "M" }),
                        Field({ name: "FabricConflict", id: 0x9, conformance: "M" }),
                        Field({ name: "LabelConflict", id: 0xa, conformance: "M" }),
                        Field({ name: "InvalidFabricIndex", id: 0xb, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "PowerSource",
            id: 0x2f,
            description: "Power Source",
            details:
                "This cluster is used to describe the configuration and capabilities of a physical power source that " +
                "provides power to the Node.",

            children: [
                Attribute({ name: "PowerSourceStatus", id: 0x0, type: "PowerSourceStatusEnum", conformance: "M" }),
                Attribute({ name: "PowerSourceOrder", id: 0x1, type: "uint8", conformance: "M" }),
                Attribute({
                    name: "PowerSourceDescription",
                    id: 0x2,
                    type: "string",
                    conformance: "M",
                    constraint: "max 60",
                }),
                Attribute({
                    name: "PowerSourceWiredAssessedInputVoltage",
                    id: 0x3,
                    type: "uint32",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "PowerSourceWiredAssessedInputFrequency",
                    id: 0x4,
                    type: "uint16",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "PowerSourceWiredCurrentType",
                    id: 0x5,
                    type: "WiredCurrentTypeEnum",
                    conformance: "O",
                }),
                Attribute({
                    name: "PowerSourceWiredAssessedCurrent",
                    id: 0x6,
                    type: "uint32",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({ name: "PowerSourceWiredNominalVoltage", id: 0x7, type: "uint32", conformance: "O" }),
                Attribute({ name: "PowerSourceWiredMaximumCurrent", id: 0x8, type: "uint32", conformance: "O" }),
                Attribute({ name: "PowerSourceWiredPresent", id: 0x9, type: "bool", conformance: "O" }),
                Attribute({
                    name: "PowerSourceActiveWiredFaults",
                    id: 0xa,
                    type: "list",
                    conformance: "O",
                    constraint: "max 8",
                    children: [Field({ name: "entry", type: "WiredFaultEnum" })],
                }),
                Attribute({ name: "PowerSourceBatVoltage", id: 0xb, type: "uint32", conformance: "O", quality: "X" }),
                Attribute({
                    name: "PowerSourceBatPercentRemaining",
                    id: 0xc,
                    type: "uint8",
                    conformance: "O",
                    constraint: "max 200",
                    quality: "X",
                }),
                Attribute({
                    name: "PowerSourceBatTimeRemaining",
                    id: 0xd,
                    type: "uint32",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({ name: "PowerSourceBatChargeLevel", id: 0xe, type: "BatChargeLevelEnum", conformance: "O" }),
                Attribute({ name: "PowerSourceBatReplacementNeeded", id: 0xf, type: "bool", conformance: "O" }),
                Attribute({
                    name: "PowerSourceBatReplaceability",
                    id: 0x10,
                    type: "BatReplaceabilityEnum",
                    conformance: "O",
                }),
                Attribute({ name: "PowerSourceBatPresent", id: 0x11, type: "bool", conformance: "O" }),
                Attribute({
                    name: "PowerSourceActiveBatFaults",
                    id: 0x12,
                    type: "list",
                    conformance: "O",
                    constraint: "max 8",
                    children: [Field({ name: "entry", type: "BatFaultEnum" })],
                }),
                Attribute({
                    name: "PowerSourceBatReplacementDescription",
                    id: 0x13,
                    type: "string",
                    conformance: "O",
                    constraint: "max 60",
                }),
                Attribute({
                    name: "PowerSourceBatCommonDesignation",
                    id: 0x14,
                    type: "BatCommonDesignationEnum",
                    conformance: "O",
                }),
                Attribute({
                    name: "PowerSourceBatAnsiDesignation",
                    id: 0x15,
                    type: "string",
                    conformance: "O",
                    constraint: "max 20",
                }),
                Attribute({
                    name: "PowerSourceBatIecDesignation",
                    id: 0x16,
                    type: "string",
                    conformance: "O",
                    constraint: "max 20",
                }),
                Attribute({
                    name: "PowerSourceBatApprovedChemistry",
                    id: 0x17,
                    type: "BatApprovedChemistryEnum",
                    conformance: "O",
                }),
                Attribute({ name: "PowerSourceBatCapacity", id: 0x18, type: "uint32", conformance: "O" }),
                Attribute({ name: "PowerSourceBatQuantity", id: 0x19, type: "uint8", conformance: "O" }),
                Attribute({
                    name: "PowerSourceBatChargeState",
                    id: 0x1a,
                    type: "BatChargeStateEnum",
                    conformance: "O",
                }),
                Attribute({
                    name: "PowerSourceBatTimeToFullCharge",
                    id: 0x1b,
                    type: "uint32",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({ name: "PowerSourceBatFunctionalWhileCharging", id: 0x1c, type: "bool", conformance: "O" }),
                Attribute({
                    name: "PowerSourceBatChargingCurrent",
                    id: 0x1d,
                    type: "uint32",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({
                    name: "PowerSourceActiveBatChargeFaults",
                    id: 0x1e,
                    type: "list",
                    conformance: "O",
                    constraint: "max 16",
                    children: [Field({ name: "entry", type: "BatChargeFaultEnum" })],
                }),

                Event({
                    name: "WiredFaultChange",
                    id: 0x0,
                    conformance: "O",
                    priority: "info",

                    children: [
                        Field({
                            name: "Current",
                            id: 0x0,
                            type: "list",
                            conformance: "M",
                            constraint: "max 8",
                            children: [Field({ name: "entry", type: "WiredFaultEnum" })],
                        }),
                        Field({
                            name: "Previous",
                            id: 0x1,
                            type: "list",
                            conformance: "M",
                            constraint: "max 8",
                            children: [Field({ name: "entry", type: "WiredFaultEnum" })],
                        }),
                    ],
                }),

                Event({
                    name: "BatFaultChange",
                    id: 0x1,
                    conformance: "O",
                    priority: "info",

                    children: [
                        Field({
                            name: "Current",
                            id: 0x0,
                            type: "list",
                            conformance: "M",
                            constraint: "max 8",
                            children: [Field({ name: "entry", type: "BatFaultEnum" })],
                        }),
                        Field({
                            name: "Previous",
                            id: 0x1,
                            type: "list",
                            conformance: "M",
                            constraint: "max 8",
                            children: [Field({ name: "entry", type: "BatFaultEnum" })],
                        }),
                    ],
                }),

                Event({
                    name: "BatChargeFaultChange",
                    id: 0x2,
                    conformance: "O",
                    priority: "info",

                    children: [
                        Field({
                            name: "Current",
                            id: 0x0,
                            type: "list",
                            conformance: "M",
                            constraint: "max 16",
                            children: [Field({ name: "entry", type: "BatChargeFaultEnum" })],
                        }),
                        Field({
                            name: "Previous",
                            id: 0x1,
                            type: "list",
                            conformance: "M",
                            constraint: "max 16",
                            children: [Field({ name: "entry", type: "BatChargeFaultEnum" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "PowerSourceStatusEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "Active", id: 0x1, conformance: "M" }),
                        Field({ name: "Standby", id: 0x2, conformance: "M" }),
                        Field({ name: "Unavailable", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "WiredCurrentTypeEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Ac", id: 0x0, conformance: "M" }),
                        Field({ name: "Dc", id: 0x1, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "WiredFaultEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "OverVoltage", id: 0x1, conformance: "M" }),
                        Field({ name: "UnderVoltage", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BatChargeLevelEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Ok", id: 0x0, conformance: "M" }),
                        Field({ name: "Warning", id: 0x1, conformance: "M" }),
                        Field({ name: "Critical", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BatReplaceabilityEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "NotReplaceable", id: 0x1, conformance: "M" }),
                        Field({ name: "UserReplaceable", id: 0x2, conformance: "M" }),
                        Field({ name: "FactoryReplaceable", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BatFaultEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "OverTemp", id: 0x1, conformance: "M" }),
                        Field({ name: "UnderTemp", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BatCommonDesignationEnum",
                    type: "enum16",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "Aaa", id: 0x1, conformance: "M" }),
                        Field({ name: "Aa", id: 0x2, conformance: "M" }),
                        Field({ name: "C", id: 0x3, conformance: "M" }),
                        Field({ name: "D", id: 0x4, conformance: "M" }),
                        Field({ name: "4V5", id: 0x5, conformance: "M" }),
                        Field({ name: "6V0", id: 0x6, conformance: "M" }),
                        Field({ name: "9V0", id: 0x7, conformance: "M" }),
                        Field({ name: "12Aa", id: 0x8, conformance: "M" }),
                        Field({ name: "Aaaa", id: 0x9, conformance: "M" }),
                        Field({ name: "A", id: 0xa, conformance: "M" }),
                        Field({ name: "B", id: 0xb, conformance: "M" }),
                        Field({ name: "F", id: 0xc, conformance: "M" }),
                        Field({ name: "N", id: 0xd, conformance: "M" }),
                        Field({ name: "No6", id: 0xe, conformance: "M" }),
                        Field({ name: "SubC", id: 0xf, conformance: "M" }),
                        Field({ name: "A23", id: 0x10, conformance: "M" }),
                        Field({ name: "A27", id: 0x11, conformance: "M" }),
                        Field({ name: "Ba5800", id: 0x12, conformance: "M" }),
                        Field({ name: "Duplex", id: 0x13, conformance: "M" }),
                        Field({ name: "4Sr44", id: 0x14, conformance: "M" }),
                        Field({ name: "523", id: 0x15, conformance: "M" }),
                        Field({ name: "531", id: 0x16, conformance: "M" }),
                        Field({ name: "15V0", id: 0x17, conformance: "M" }),
                        Field({ name: "22V5", id: 0x18, conformance: "M" }),
                        Field({ name: "30V0", id: 0x19, conformance: "M" }),
                        Field({ name: "45V0", id: 0x1a, conformance: "M" }),
                        Field({ name: "67V5", id: 0x1b, conformance: "M" }),
                        Field({ name: "J", id: 0x1c, conformance: "M" }),
                        Field({ name: "Cr123A", id: 0x1d, conformance: "M" }),
                        Field({ name: "Cr2", id: 0x1e, conformance: "M" }),
                        Field({ name: "2Cr5", id: 0x1f, conformance: "M" }),
                        Field({ name: "CrP2", id: 0x20, conformance: "M" }),
                        Field({ name: "CrV3", id: 0x21, conformance: "M" }),
                        Field({ name: "Sr41", id: 0x22, conformance: "M" }),
                        Field({ name: "Sr43", id: 0x23, conformance: "M" }),
                        Field({ name: "Sr44", id: 0x24, conformance: "M" }),
                        Field({ name: "Sr45", id: 0x25, conformance: "M" }),
                        Field({ name: "Sr48", id: 0x26, conformance: "M" }),
                        Field({ name: "Sr54", id: 0x27, conformance: "M" }),
                        Field({ name: "Sr55", id: 0x28, conformance: "M" }),
                        Field({ name: "Sr57", id: 0x29, conformance: "M" }),
                        Field({ name: "Sr58", id: 0x2a, conformance: "M" }),
                        Field({ name: "Sr59", id: 0x2b, conformance: "M" }),
                        Field({ name: "Sr60", id: 0x2c, conformance: "M" }),
                        Field({ name: "Sr63", id: 0x2d, conformance: "M" }),
                        Field({ name: "Sr64", id: 0x2e, conformance: "M" }),
                        Field({ name: "Sr65", id: 0x2f, conformance: "M" }),
                        Field({ name: "Sr66", id: 0x30, conformance: "M" }),
                        Field({ name: "Sr67", id: 0x31, conformance: "M" }),
                        Field({ name: "Sr68", id: 0x32, conformance: "M" }),
                        Field({ name: "Sr69", id: 0x33, conformance: "M" }),
                        Field({ name: "Sr516", id: 0x34, conformance: "M" }),
                        Field({ name: "Sr731", id: 0x35, conformance: "M" }),
                        Field({ name: "Sr712", id: 0x36, conformance: "M" }),
                        Field({ name: "Lr932", id: 0x37, conformance: "M" }),
                        Field({ name: "A5", id: 0x38, conformance: "M" }),
                        Field({ name: "A10", id: 0x39, conformance: "M" }),
                        Field({ name: "A13", id: 0x3a, conformance: "M" }),
                        Field({ name: "A312", id: 0x3b, conformance: "M" }),
                        Field({ name: "A675", id: 0x3c, conformance: "M" }),
                        Field({ name: "Ac41E", id: 0x3d, conformance: "M" }),
                        Field({ name: "10180", id: 0x3e, conformance: "M" }),
                        Field({ name: "10280", id: 0x3f, conformance: "M" }),
                        Field({ name: "10440", id: 0x40, conformance: "M" }),
                        Field({ name: "14250", id: 0x41, conformance: "M" }),
                        Field({ name: "14430", id: 0x42, conformance: "M" }),
                        Field({ name: "14500", id: 0x43, conformance: "M" }),
                        Field({ name: "14650", id: 0x44, conformance: "M" }),
                        Field({ name: "15270", id: 0x45, conformance: "M" }),
                        Field({ name: "16340", id: 0x46, conformance: "M" }),
                        Field({ name: "Rcr123A", id: 0x47, conformance: "M" }),
                        Field({ name: "17500", id: 0x48, conformance: "M" }),
                        Field({ name: "17670", id: 0x49, conformance: "M" }),
                        Field({ name: "18350", id: 0x4a, conformance: "M" }),
                        Field({ name: "18500", id: 0x4b, conformance: "M" }),
                        Field({ name: "18650", id: 0x4c, conformance: "M" }),
                        Field({ name: "19670", id: 0x4d, conformance: "M" }),
                        Field({ name: "25500", id: 0x4e, conformance: "M" }),
                        Field({ name: "26650", id: 0x4f, conformance: "M" }),
                        Field({ name: "32600", id: 0x50, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BatApprovedChemistryEnum",
                    type: "enum16",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "Alkaline", id: 0x1, conformance: "M" }),
                        Field({ name: "LithiumCarbonFluoride", id: 0x2, conformance: "M" }),
                        Field({ name: "LithiumChromiumOxide", id: 0x3, conformance: "M" }),
                        Field({ name: "LithiumCopperOxide", id: 0x4, conformance: "M" }),
                        Field({ name: "LithiumIronDisulfide", id: 0x5, conformance: "M" }),
                        Field({ name: "LithiumManganeseDioxide", id: 0x6, conformance: "M" }),
                        Field({ name: "LithiumThionylChloride", id: 0x7, conformance: "M" }),
                        Field({ name: "Magnesium", id: 0x8, conformance: "M" }),
                        Field({ name: "MercuryOxide", id: 0x9, conformance: "M" }),
                        Field({ name: "NickelOxyhydride", id: 0xa, conformance: "M" }),
                        Field({ name: "SilverOxide", id: 0xb, conformance: "M" }),
                        Field({ name: "ZincAir", id: 0xc, conformance: "M" }),
                        Field({ name: "ZincCarbon", id: 0xd, conformance: "M" }),
                        Field({ name: "ZincChloride", id: 0xe, conformance: "M" }),
                        Field({ name: "ZincManganeseDioxide", id: 0xf, conformance: "M" }),
                        Field({ name: "LeadAcid", id: 0x10, conformance: "M" }),
                        Field({ name: "LithiumCobaltOxide", id: 0x11, conformance: "M" }),
                        Field({ name: "LithiumIon", id: 0x12, conformance: "M" }),
                        Field({ name: "LithiumIonPolymer", id: 0x13, conformance: "M" }),
                        Field({ name: "LithiumIronPhosphate", id: 0x14, conformance: "M" }),
                        Field({ name: "LithiumSulfur", id: 0x15, conformance: "M" }),
                        Field({ name: "LithiumTitanate", id: 0x16, conformance: "M" }),
                        Field({ name: "NickelCadmium", id: 0x17, conformance: "M" }),
                        Field({ name: "NickelHydrogen", id: 0x18, conformance: "M" }),
                        Field({ name: "NickelIron", id: 0x19, conformance: "M" }),
                        Field({ name: "NickelMetalHydride", id: 0x1a, conformance: "M" }),
                        Field({ name: "NickelZinc", id: 0x1b, conformance: "M" }),
                        Field({ name: "SilverZinc", id: 0x1c, conformance: "M" }),
                        Field({ name: "SodiumIon", id: 0x1d, conformance: "M" }),
                        Field({ name: "SodiumSulfur", id: 0x1e, conformance: "M" }),
                        Field({ name: "ZincBromide", id: 0x1f, conformance: "M" }),
                        Field({ name: "ZincCerium", id: 0x20, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BatChargeStateEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unknown", id: 0x0, conformance: "M" }),
                        Field({ name: "IsCharging", id: 0x1, conformance: "M" }),
                        Field({ name: "IsAtFullCharge", id: 0x2, conformance: "M" }),
                        Field({ name: "IsNotCharging", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "BatChargeFaultEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "AmbientTooHot", id: 0x1, conformance: "M" }),
                        Field({ name: "AmbientTooCold", id: 0x2, conformance: "M" }),
                        Field({ name: "BatteryTooHot", id: 0x3, conformance: "M" }),
                        Field({ name: "BatteryTooCold", id: 0x4, conformance: "M" }),
                        Field({ name: "BatteryAbsent", id: 0x5, conformance: "M" }),
                        Field({ name: "BatteryOverVoltage", id: 0x6, conformance: "M" }),
                        Field({ name: "BatteryUnderVoltage", id: 0x7, conformance: "M" }),
                        Field({ name: "ChargerOverVoltage", id: 0x8, conformance: "M" }),
                        Field({ name: "ChargerUnderVoltage", id: 0x9, conformance: "M" }),
                        Field({ name: "SafetyTimeout", id: 0xa, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "PowerSourceConfiguration",
            id: 0x2e,
            description: "Power Source Configuration",
            details: "This cluster is used to describe the configuration and capabilities of a Device's power system.",
            children: [
                Attribute({
                    name: "Sources",
                    id: 0x0,
                    type: "list",
                    conformance: "M",
                    constraint: "max 6",
                    children: [Field({ name: "entry", type: "uint8" })],
                }),
            ],
        }),

        Cluster({
            name: "PressureMeasurement",
            id: 0x403,
            description: "Pressure Measurement",
            details:
                "Attributes and commands for configuring the measurement of pressure, and reporting pressure " +
                "measurements.",

            children: [
                Attribute({ name: "PressureMeasuredValue", id: 0x0, type: "int16", conformance: "M", quality: "X P" }),
                Attribute({ name: "PressureMinMeasuredValue", id: 0x1, type: "int16", conformance: "M", quality: "X" }),
                Attribute({ name: "PressureMaxMeasuredValue", id: 0x2, type: "int16", conformance: "M", quality: "X" }),
                Attribute({
                    name: "PressureTolerance",
                    id: 0x3,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 2048",
                    default: 0,
                }),
                Attribute({
                    name: "PressureScaledValue",
                    id: 0x10,
                    type: "int16",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PressureMinScaledValue",
                    id: 0x11,
                    type: "int16",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PressureMaxScaledValue",
                    id: 0x12,
                    type: "int16",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PressureScaledTolerance",
                    id: 0x13,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 2048",
                    default: 0,
                    quality: "P",
                }),
                Attribute({ name: "PressureScale", id: 0x14, type: "int8", conformance: "O", default: 0 }),
            ],
        }),

        Cluster({
            name: "ProxyConfiguration",
            id: 0x42,
            description: "Proxy Configuration",
            details: "Cluster to control Proxy Configuration",
        }),
        Cluster({
            name: "ProxyDiscovery",
            id: 0x43,
            description: "Proxy Discovery",
            details: "Cluster to control Proxy Discovery",
        }),
        Cluster({
            name: "ProxyValid",
            id: 0x44,
            description: "Proxy Valid",
            details: "Cluster to control Proxy Valid",
        }),

        Cluster({
            name: "PumpConfigurationAndControl",
            id: 0x200,
            description: "Pump Configuration and Control",
            details: "An interface for configuring and controlling pumps.",

            children: [
                Attribute({
                    name: "MaxPressure",
                    id: 0x0,
                    type: "int16",
                    conformance: "M",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "MaxSpeed",
                    id: 0x1,
                    type: "uint16",
                    conformance: "M",
                    constraint: "max 65534",
                    quality: "X",
                }),
                Attribute({
                    name: "MaxFlow",
                    id: 0x2,
                    type: "uint16",
                    conformance: "M",
                    constraint: "max 65534",
                    quality: "X",
                }),
                Attribute({
                    name: "MinConstPressure",
                    id: 0x3,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "MaxConstPressure",
                    id: 0x4,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "MinCompPressure",
                    id: 0x5,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "MaxCompPressure",
                    id: 0x6,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "MinConstSpeed",
                    id: 0x7,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65534",
                    quality: "X",
                }),
                Attribute({
                    name: "MaxConstSpeed",
                    id: 0x8,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65534",
                    quality: "X",
                }),
                Attribute({
                    name: "MinConstFlow",
                    id: 0x9,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65534",
                    quality: "X",
                }),
                Attribute({
                    name: "MaxConstFlow",
                    id: 0xa,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65534",
                    quality: "X",
                }),
                Attribute({
                    name: "MinConstTemp",
                    id: 0xb,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "MaxConstTemp",
                    id: 0xc,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "PumpStatus",
                    id: 0x10,
                    type: "PumpStatusBitmap",
                    conformance: "O",
                    default: 0,
                    quality: "P",
                }),
                Attribute({ name: "EffectiveOperationMode", id: 0x11, type: "OperationModeEnum", conformance: "M" }),
                Attribute({ name: "EffectiveControlMode", id: 0x12, type: "ControlModeEnum", conformance: "M" }),
                Attribute({
                    name: "Capacity",
                    id: 0x13,
                    type: "int16",
                    conformance: "M",
                    constraint: "min 0",
                    quality: "X P",
                }),
                Attribute({
                    name: "Speed",
                    id: 0x14,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 65534",
                    quality: "X",
                }),
                Attribute({
                    name: "LifetimeRunningHours",
                    id: 0x15,
                    type: "uint24",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({ name: "PumpPower", id: 0x16, type: "uint24", conformance: "O", quality: "X" }),
                Attribute({
                    name: "LifetimeEnergyConsumed",
                    id: 0x17,
                    type: "uint32",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "OperationMode",
                    id: 0x20,
                    type: "OperationModeEnum",
                    access: "RW VM",
                    conformance: "M",
                    default: 0,
                }),
                Attribute({
                    name: "ControlMode",
                    id: 0x21,
                    type: "ControlModeEnum",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Event({ name: "SupplyVoltageLow", id: 0x0, conformance: "O", priority: "info" }),
                Event({ name: "SupplyVoltageHigh", id: 0x1, conformance: "O", priority: "info" }),
                Event({ name: "PowerMissingPhase", id: 0x2, conformance: "O", priority: "info" }),
                Event({ name: "SystemPressureLow", id: 0x3, conformance: "O", priority: "info" }),
                Event({ name: "SystemPressureHigh", id: 0x4, conformance: "O", priority: "info" }),
                Event({ name: "DryRunning", id: 0x5, conformance: "O", priority: "critical" }),
                Event({ name: "MotorTemperatureHigh", id: 0x6, conformance: "O", priority: "info" }),
                Event({ name: "PumpMotorFatalFailure", id: 0x7, conformance: "O", priority: "critical" }),
                Event({ name: "ElectronicTemperatureHigh", id: 0x8, conformance: "O", priority: "info" }),
                Event({ name: "PumpBlocked", id: 0x9, conformance: "O", priority: "critical" }),
                Event({ name: "SensorFailure", id: 0xa, conformance: "O", priority: "info" }),
                Event({ name: "ElectronicNonFatalFailure", id: 0xb, conformance: "O", priority: "info" }),
                Event({ name: "ElectronicFatalFailure", id: 0xc, conformance: "O", priority: "critical" }),
                Event({ name: "GeneralFault", id: 0xd, conformance: "O", priority: "info" }),
                Event({ name: "Leakage", id: 0xe, conformance: "O", priority: "info" }),
                Event({ name: "AirDetection", id: 0xf, conformance: "O", priority: "info" }),
                Event({ name: "TurbineOperation", id: 0x10, conformance: "O", priority: "info" }),

                Datatype({
                    name: "PumpStatusBitmap",
                    type: "map16",
                    conformance: "M",

                    children: [
                        Field({ name: "DeviceFault", constraint: "0" }),
                        Field({ name: "Supplyfault", constraint: "1" }),
                        Field({ name: "SpeedLow", constraint: "2" }),
                        Field({ name: "SpeedHigh", constraint: "3" }),
                        Field({ name: "LocalOverride", constraint: "4" }),
                        Field({ name: "Running", constraint: "5" }),
                        Field({ name: "RemotePressure", constraint: "6" }),
                        Field({ name: "RemoteFlow", constraint: "7" }),
                        Field({ name: "remoteTemperature", constraint: "8" }),
                    ],
                }),

                Datatype({
                    name: "OperationModeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Normal", id: 0x0, conformance: "M" }),
                        Field({ name: "Minimum", id: 0x1, conformance: "M" }),
                        Field({ name: "Maximum", id: 0x2, conformance: "M" }),
                        Field({ name: "Local", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ControlModeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "ConstantSpeed", id: 0x0, conformance: "M" }),
                        Field({ name: "ConstantPressure", id: 0x1, conformance: "M" }),
                        Field({ name: "ProportionalPressure", id: 0x2, conformance: "M" }),
                        Field({ name: "ConstantFlow", id: 0x3, conformance: "M" }),
                        Field({ name: "ConstantTemperature", id: 0x5, conformance: "M" }),
                        Field({ name: "Automatic", id: 0x7, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "PulseWidthModulation",
            id: 0x1c,
            description: "Pulse Width Modulation",
            details: "Cluster to control pulse width modulation",
        }),

        Cluster({
            name: "RelativeHumidityMeasurement",
            id: 0x405,
            description: "Relative Humidity Measurement",
            details:
                "Attributes and commands for configuring the measurement of relative humidity, and reporting " +
                "relative humidity measurements.",

            children: [
                Attribute({
                    name: "RelativeHumidityMeasuredValue",
                    id: 0x0,
                    type: "uint16",
                    conformance: "M",
                    quality: "X P",
                }),
                Attribute({
                    name: "RelativeHumidityMinMeasuredValue",
                    id: 0x1,
                    type: "uint16",
                    conformance: "M",
                    constraint: "max 9999",
                    quality: "X",
                }),
                Attribute({
                    name: "RelativeHumidityMaxMeasuredValue",
                    id: 0x2,
                    type: "uint16",
                    conformance: "M",
                    constraint: "1 to 10000",
                    quality: "X",
                }),
                Attribute({
                    name: "RelativeHumidityTolerance",
                    id: 0x3,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 2048",
                }),
            ],
        }),

        Cluster({
            name: "Scenes",
            id: 0x5,
            description: "Scenes",
            details: "Attributes and commands for scene configuration and manipulation.",

            children: [
                Attribute({ name: "SceneCount", id: 0x0, type: "uint8", conformance: "M", default: 0 }),
                Attribute({ name: "CurrentScene", id: 0x1, type: "uint8", conformance: "M", default: 0 }),
                Attribute({ name: "CurrentGroup", id: 0x2, type: "group-id", conformance: "M", default: 0 }),
                Attribute({ name: "SceneValid", id: 0x3, type: "bool", conformance: "M", default: true }),
                Attribute({ name: "SceneNameSupport", id: 0x4, type: "map8", conformance: "M", default: 0 }),
                Attribute({ name: "LastConfiguredBy", id: 0x5, type: "node-id", conformance: "O", quality: "X" }),

                Command({
                    name: "AddScene",
                    id: 0x0,
                    access: "R F M",
                    conformance: "M",
                    direction: "request",
                    response: "AddSceneResponse",

                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                        Field({ name: "SceneName", type: "string", conformance: "M" }),
                        Field({
                            name: "ExtensionFieldSets",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "ExtensionFieldSet" })],
                        }),
                    ],
                }),

                Command({
                    name: "ViewScene",
                    id: 0x1,
                    access: "R F",
                    conformance: "M",
                    direction: "request",
                    response: "ViewSceneResponse",
                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "RemoveScene",
                    id: 0x2,
                    access: "R F M",
                    conformance: "M",
                    direction: "request",
                    response: "RemoveSceneResponse",
                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "RemoveAllScenes",
                    id: 0x3,
                    access: "R F M",
                    conformance: "M",
                    direction: "request",
                    response: "RemoveAllScenesResponse",
                    children: [Field({ name: "GroupId", type: "group-id", conformance: "M" })],
                }),

                Command({
                    name: "StoreScene",
                    id: 0x4,
                    access: "R F M",
                    conformance: "M",
                    direction: "request",
                    response: "StoreSceneResponse",
                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "RecallScene",
                    id: 0x5,
                    access: "R F",
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "O", quality: "X" }),
                    ],
                }),

                Command({
                    name: "GetSceneMembership",
                    id: 0x6,
                    access: "R F",
                    conformance: "M",
                    direction: "request",
                    response: "GetSceneMembershipResponse",
                    children: [Field({ name: "GroupId", type: "group-id", conformance: "M" })],
                }),

                Command({
                    name: "EnhancedAddScene",
                    id: 0x40,
                    access: "R F",
                    conformance: "O",
                    direction: "request",
                    response: "EnhancedAddSceneResponse",

                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "M" }),
                        Field({ name: "SceneName", type: "string", conformance: "M" }),
                        Field({
                            name: "ExtensionFieldSets",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "ExtensionFieldSet" })],
                        }),
                    ],
                }),

                Command({
                    name: "EnhancedViewScene",
                    id: 0x41,
                    access: "R F",
                    conformance: "O",
                    direction: "request",
                    response: "EnhancedViewSceneResponse",
                    children: [
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "CopyScene",
                    id: 0x42,
                    access: "R F",
                    conformance: "O",
                    direction: "request",
                    response: "CopySceneResponse",

                    children: [
                        Field({ name: "Mode", type: "ScenesCopyMode", conformance: "M" }),
                        Field({ name: "GroupIdentifierFrom", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneIdentifierFrom", type: "uint8", conformance: "M" }),
                        Field({ name: "GroupIdentifierTo", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneIdentifierTo", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "AddSceneResponse",
                    id: 0x0,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "ViewSceneResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",

                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "O" }),
                        Field({ name: "SceneName", type: "string", conformance: "O" }),
                        Field({
                            name: "ExtensionFieldSets",
                            type: "list",
                            conformance: "O",
                            children: [Field({ name: "entry", type: "ExtensionFieldSet" })],
                        }),
                    ],
                }),

                Command({
                    name: "RemoveSceneResponse",
                    id: 0x2,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "RemoveAllScenesResponse",
                    id: 0x3,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "StoreSceneResponse",
                    id: 0x4,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "GetSceneMembershipResponse",
                    id: 0x6,
                    conformance: "M",
                    direction: "response",

                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "Capacity", type: "uint8", conformance: "M", quality: "X" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({
                            name: "SceneList",
                            type: "list",
                            conformance: "O",
                            children: [Field({ name: "entry", type: "uint8" })],
                        }),
                    ],
                }),

                Command({
                    name: "EnhancedAddSceneResponse",
                    id: 0x40,
                    conformance: "O",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "EnhancedViewSceneResponse",
                    id: 0x41,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupId", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneId", type: "uint8", conformance: "M" }),
                        Field({ name: "TransitionTime", type: "uint16", conformance: "O" }),
                        Field({ name: "SceneName", type: "string", conformance: "O" }),
                        Field({
                            name: "ExtensionFieldSets",
                            type: "list",
                            conformance: "O",
                            children: [Field({ name: "entry", type: "ExtensionFieldSet" })],
                        }),
                    ],
                }),

                Command({
                    name: "CopySceneResponse",
                    id: 0x42,
                    conformance: "O",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "GroupIdentifierFrom", type: "group-id", conformance: "M" }),
                        Field({ name: "SceneIdentifierFrom", type: "uint8", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ExtensionFieldSet",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "ClusterId", type: "cluster-id", conformance: "M" }),
                        Field({
                            name: "AttributeValueList",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "AttributeValuePair" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "AttributeValuePair",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "AttributeId", type: "attrib-id", conformance: "O" }),
                        Field({
                            name: "AttributeValue",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "uint8" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "ScenesCopyMode",
                    type: "map8",
                    conformance: "M",
                    children: [Field({ name: "CopyAllScenes", constraint: "0" })],
                }),
            ],
        }),

        Cluster({
            name: "SoftwareDiagnostics",
            id: 0x34,
            description: "Software Diagnostics",
            details:
                "The Software Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that " +
                "MAY be used by a Node to assist a user or Administrative Node in diagnosing potential problems.",

            children: [
                Attribute({
                    name: "ThreadMetrics",
                    id: 0x0,
                    type: "list",
                    conformance: "O",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "ThreadMetricsStruct" })],
                }),
                Attribute({ name: "CurrentHeapFree", id: 0x1, type: "uint64", conformance: "O", default: 0 }),
                Attribute({ name: "CurrentHeapUsed", id: 0x2, type: "uint64", conformance: "O", default: 0 }),
                Attribute({ name: "CurrentHeapHighWatermark", id: 0x3, type: "uint64", conformance: "O", default: 0 }),
                Command({ name: "ResetWatermarks", id: 0x0, conformance: "O", direction: "request" }),

                Event({
                    name: "SoftwareFault",
                    id: 0x0,
                    conformance: "O",
                    priority: "info",
                    children: [
                        Field({ name: "Id", id: 0x0, type: "uint64", conformance: "M" }),
                        Field({ name: "Name", id: 0x1, type: "string", conformance: "O", constraint: "max 8" }),
                        Field({ name: "FaultRecording", id: 0x2, type: "octstr", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "ThreadMetricsStruct",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "Id", type: "uint64", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "O", constraint: "max 8" }),
                        Field({ name: "StackFreeCurrent", type: "uint32", conformance: "O" }),
                        Field({ name: "StackFreeMinimum", type: "uint32", conformance: "O" }),
                        Field({ name: "StackSize", type: "uint32", conformance: "O" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "Switch",
            id: 0x3b,
            description: "Switch",

            details:
                "This cluster exposes interactions with a switch device, for the purpose of using those interactions " +
                "by other devices. Two types of switch devices are supported: latching switch (e.g. rocker switch) " +
                "and momentary switch (e.g. push button), distinguished with their feature flags. Interactions with " +
                "the switch device are exposed as attributes (for the latching switch) and as events (for both types " +
                "of switches). An interested party MAY subscribe to these attributes/events and thus be informed of " +
                "the interactions, and can perform actions based on this, for example by sending commands to perform " +
                "an action such as controlling a light or a window shade.",

            children: [
                Attribute({
                    name: "NumberOfPositions",
                    id: 0x0,
                    type: "uint8",
                    conformance: "M",
                    constraint: "min 2",
                    default: 2,
                }),
                Attribute({ name: "CurrentPosition", id: 0x1, type: "uint8", conformance: "M", quality: "P" }),
                Attribute({
                    name: "MultiPressMax",
                    id: 0x2,
                    type: "uint8",
                    conformance: "O",
                    constraint: "min 2",
                    default: 2,
                }),
                Event({
                    name: "SwitchLatched",
                    id: 0x0,
                    conformance: "O",
                    priority: "info",
                    children: [Field({ name: "NewPosition", id: 0x0, type: "uint8", conformance: "M" })],
                }),
                Event({
                    name: "InitialPress",
                    id: 0x1,
                    conformance: "O",
                    priority: "info",
                    children: [Field({ name: "NewPosition", id: 0x0, type: "uint8", conformance: "M" })],
                }),
                Event({
                    name: "LongPress",
                    id: 0x2,
                    conformance: "O",
                    priority: "info",
                    children: [Field({ name: "NewPosition", id: 0x0, type: "uint8", conformance: "M" })],
                }),
                Event({
                    name: "ShortRelease",
                    id: 0x3,
                    conformance: "O",
                    priority: "info",
                    children: [Field({ name: "PreviousPosition", id: 0x0, type: "uint8", conformance: "M" })],
                }),
                Event({
                    name: "LongRelease",
                    id: 0x4,
                    conformance: "O",
                    priority: "info",
                    children: [Field({ name: "PreviousPosition", id: 0x0, type: "uint8", conformance: "M" })],
                }),

                Event({
                    name: "MultiPressOngoing",
                    id: 0x5,
                    conformance: "O",
                    priority: "info",
                    children: [
                        Field({ name: "NewPosition", id: 0x0, type: "uint8", conformance: "M" }),
                        Field({ name: "CurrentNumberOfPressesCounted", id: 0x1, type: "uint8", conformance: "M" }),
                    ],
                }),

                Event({
                    name: "MultiPressComplete",
                    id: 0x6,
                    conformance: "O",
                    priority: "info",
                    children: [
                        Field({ name: "PreviousPosition", id: 0x0, type: "uint8", conformance: "M" }),
                        Field({ name: "TotalNumberOfPressesCounted", id: 0x1, type: "uint8", conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "TargetNavigator",
            id: 0x505,
            description: "Target Navigator",
            details:
                "This cluster provides an interface for UX navigation within a set of targets on a device or " +
                "endpoint.",

            children: [
                Attribute({
                    name: "TargetNavigatorList",
                    id: 0x0,
                    type: "list",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "TargetInfoStruct" })],
                }),
                Attribute({
                    name: "TargetNavigatorCurrentTarget",
                    id: 0x1,
                    type: "uint8",
                    conformance: "O",
                    default: 0,
                }),

                Command({
                    name: "NavigateTarget",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    response: "NavigateTargetResponse",
                    children: [
                        Field({ name: "Target", type: "uint8", conformance: "M" }),
                        Field({ name: "Data", type: "string", conformance: "O" }),
                    ],
                }),

                Command({
                    name: "NavigateTargetResponse",
                    id: 0x1,
                    conformance: "M",
                    direction: "response",
                    children: [
                        Field({ name: "Status", type: "TargetNavigatorStatusEnum", conformance: "M" }),
                        Field({ name: "Data", type: "string", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "TargetInfoStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Identifier", type: "uint8", conformance: "M" }),
                        Field({ name: "Name", type: "string", conformance: "M", constraint: "max 32" }),
                    ],
                }),

                Datatype({
                    name: "TargetNavigatorStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Success", id: 0x0, conformance: "M" }),
                        Field({ name: "TargetNotFound", id: 0x1, conformance: "M" }),
                        Field({ name: "NotAllowed", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "TemperatureMeasurement",
            id: 0x402,
            description: "Temperature Measurement",
            details:
                "Attributes and commands for configuring the measurement of temperature, and reporting temperature " +
                "measurements.",

            children: [
                Attribute({
                    name: "TempMeasuredValue",
                    id: 0x0,
                    type: "int16",
                    conformance: "M",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "TempMinMeasuredValue",
                    id: 0x1,
                    type: "int16",
                    conformance: "M",
                    constraint: "0 to 32766",
                    default: 32768,
                    quality: "X",
                }),
                Attribute({
                    name: "TempMaxMeasuredValue",
                    id: 0x2,
                    type: "int16",
                    conformance: "M",
                    constraint: "min 0",
                    default: 32768,
                    quality: "X",
                }),
                Attribute({
                    name: "TempTolerance",
                    id: 0x3,
                    type: "uint16",
                    conformance: "O",
                    constraint: "max 2048",
                    default: 0,
                }),
            ],
        }),

        Cluster({
            name: "Thermostat",
            id: 0x201,
            description: "Thermostat",
            details: "An interface for configuring and controlling the functionality of a thermostat.",

            children: [
                Attribute({
                    name: "LocalTemperature",
                    id: 0x0,
                    type: "int16",
                    conformance: "M",
                    constraint: "min 0",
                    quality: "X P",
                }),
                Attribute({
                    name: "OutdoorTemperature",
                    id: 0x1,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    quality: "X",
                }),
                Attribute({
                    name: "ThermostatOccupancy",
                    id: 0x2,
                    type: "map8",
                    conformance: "O",
                    default: 1,
                    children: [Field({ name: "occupied", constraint: "0" })],
                }),
                Attribute({
                    name: "AbsMinHeatSetpointLimit",
                    id: 0x3,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    default: 700,
                }),
                Attribute({
                    name: "AbsMaxHeatSetpointLimit",
                    id: 0x4,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    default: 3000,
                }),
                Attribute({
                    name: "AbsMinCoolSetpointLimit",
                    id: 0x5,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    default: 1600,
                }),
                Attribute({
                    name: "AbsMaxCoolSetpointLimit",
                    id: 0x6,
                    type: "int16",
                    conformance: "O",
                    constraint: "min 0",
                    default: 3200,
                }),
                Attribute({
                    name: "PiCoolingDemand",
                    id: 0x7,
                    type: "uint8",
                    conformance: "O",
                    constraint: "max 100",
                    quality: "P",
                }),
                Attribute({
                    name: "PiHeatingDemand",
                    id: 0x8,
                    type: "uint8",
                    conformance: "O",
                    constraint: "max 100",
                    quality: "P",
                }),
                Attribute({
                    name: "HvacSystemTypeConfiguration",
                    id: 0x9,
                    type: "map8",
                    access: "RW VM",
                    conformance: "O",
                }),
                Attribute({
                    name: "LocalTemperatureCalibration",
                    id: 0x10,
                    type: "int8",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "0 to 25",
                    default: 0,
                }),
                Attribute({
                    name: "OccupiedCoolingSetpoint",
                    id: 0x11,
                    type: "int16",
                    access: "RW",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 2600,
                }),
                Attribute({
                    name: "OccupiedHeatingSetpoint",
                    id: 0x12,
                    type: "int16",
                    access: "RW",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 2000,
                }),
                Attribute({
                    name: "UnoccupiedCoolingSetpoint",
                    id: 0x13,
                    type: "int16",
                    access: "RW",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 2600,
                }),
                Attribute({
                    name: "UnoccupiedHeatingSetpoint",
                    id: 0x14,
                    type: "int16",
                    access: "RW",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 2000,
                }),
                Attribute({
                    name: "MinHeatSetpointLimit",
                    id: 0x15,
                    type: "int16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 700,
                }),
                Attribute({
                    name: "MaxHeatSetpointLimit",
                    id: 0x16,
                    type: "int16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 3000,
                }),
                Attribute({
                    name: "MinCoolSetpointLimit",
                    id: 0x17,
                    type: "int16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 1600,
                }),
                Attribute({
                    name: "MaxCoolSetpointLimit",
                    id: 0x18,
                    type: "int16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 3200,
                }),
                Attribute({
                    name: "MinSetpointDeadBand",
                    id: 0x19,
                    type: "int8",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "0 to 25",
                    default: 25,
                }),
                Attribute({
                    name: "RemoteSensing",
                    id: 0x1a,
                    type: "map8",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "ControlSequenceOfOperation",
                    id: 0x1b,
                    type: "ThermostatControlSequence",
                    access: "RW VM",
                    conformance: "M",
                    default: 4,
                }),

                Attribute({
                    name: "SystemMode",
                    id: 0x1c,
                    type: "enum8",
                    access: "RW VM",
                    conformance: "M",
                    default: 1,

                    children: [
                        Field({ name: "Off", id: 0x0, conformance: "M" }),
                        Field({ name: "Auto", id: 0x1, conformance: "M" }),
                        Field({ name: "Cool", id: 0x3, conformance: "M" }),
                        Field({ name: "Heat", id: 0x4, conformance: "M" }),
                        Field({ name: "EmergencyHeat", id: 0x5, conformance: "M" }),
                        Field({ name: "Precooling", id: 0x6, conformance: "M" }),
                        Field({ name: "FanOnly", id: 0x7, conformance: "M" }),
                        Field({ name: "Dry", id: 0x8, conformance: "M" }),
                        Field({ name: "Sleep", id: 0x9, conformance: "M" }),
                    ],
                }),

                Attribute({
                    name: "ThermostatRunningMode",
                    id: 0x1e,
                    type: "enum8",
                    conformance: "O",
                    children: [
                        Field({ name: "Off", id: 0x0, conformance: "M" }),
                        Field({ name: "Cool", id: 0x3, conformance: "M" }),
                        Field({ name: "Heat", id: 0x4, conformance: "M" }),
                    ],
                }),

                Attribute({
                    name: "StartOfWeek",
                    id: 0x20,
                    type: "enum8",
                    conformance: "O",

                    children: [
                        Field({ name: "Sunday", id: 0x0, conformance: "M" }),
                        Field({ name: "Monday", id: 0x1, conformance: "M" }),
                        Field({ name: "Tuesday", id: 0x2, conformance: "M" }),
                        Field({ name: "Wednesday", id: 0x3, conformance: "M" }),
                        Field({ name: "Thursday", id: 0x4, conformance: "M" }),
                        Field({ name: "Friday", id: 0x5, conformance: "M" }),
                        Field({ name: "Saturday", id: 0x6, conformance: "M" }),
                    ],
                }),

                Attribute({ name: "NumberOfWeeklyTransitions", id: 0x21, type: "uint8", conformance: "O" }),
                Attribute({ name: "NumberOfDailyTransitions", id: 0x22, type: "uint8", conformance: "O" }),

                Attribute({
                    name: "TemperatureSetpointHold",
                    id: 0x23,
                    type: "enum8",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                    children: [
                        Field({ name: "SetpointHoldOff", id: 0x0, conformance: "M" }),
                        Field({ name: "SetpointHoldOn", id: 0x1, conformance: "M" }),
                    ],
                }),

                Attribute({
                    name: "TemperatureSetpointHoldDuration",
                    id: 0x24,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    constraint: "max 1440",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "ThermostatProgrammingOperationMode",
                    id: 0x25,
                    type: "map8",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),

                Attribute({
                    name: "ThermostatRunningState",
                    id: 0x29,
                    type: "map16",
                    conformance: "O",

                    children: [
                        Field({ name: "HeatStateOn", constraint: "0" }),
                        Field({ name: "CoolStateOn", constraint: "1" }),
                        Field({ name: "FanStateOn", constraint: "2" }),
                        Field({ name: "HeatSecondStageStateOn", constraint: "3" }),
                        Field({ name: "CoolSecondStageStateOn", constraint: "4" }),
                        Field({ name: "FanSecondStageStateOn", constraint: "5" }),
                        Field({ name: "FanThirdStageStateOn", constraint: "6" }),
                    ],
                }),

                Attribute({ name: "SetpointChangeSource", id: 0x30, type: "enum8", conformance: "O" }),
                Attribute({
                    name: "SetpointChangeAmount",
                    id: 0x31,
                    type: "int16",
                    conformance: "O",
                    default: 32768,
                    quality: "X",
                }),
                Attribute({ name: "SetpointChangeSourceTimestamp", id: 0x32, type: "epoch-s", conformance: "O" }),
                Attribute({
                    name: "OccupiedSetback",
                    id: 0x34,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({ name: "OccupiedSetbackMin", id: 0x35, type: "uint8", conformance: "O", quality: "X" }),
                Attribute({ name: "OccupiedSetbackMax", id: 0x36, type: "uint8", conformance: "O", quality: "X" }),
                Attribute({
                    name: "UnoccupiedSetback",
                    id: 0x37,
                    type: "uint8",
                    access: "RW VM",
                    conformance: "O",
                    quality: "X",
                }),
                Attribute({ name: "UnoccupiedSetbackMin", id: 0x38, type: "uint8", conformance: "O", quality: "X" }),
                Attribute({ name: "UnoccupiedSetbackMax", id: 0x39, type: "uint8", conformance: "O", quality: "X" }),
                Attribute({ name: "EmergencyHeatDelta", id: 0x3a, type: "uint8", access: "RW VM", conformance: "O" }),
                Attribute({ name: "AcType", id: 0x40, type: "enum8", access: "RW VM", conformance: "O", default: 0 }),
                Attribute({
                    name: "AcCapacity",
                    id: 0x41,
                    type: "uint16",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AcRefrigerantType",
                    id: 0x42,
                    type: "enum8",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AcCompressorType",
                    id: 0x43,
                    type: "enum8",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AcErrorCode",
                    id: 0x44,
                    type: "map32",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AcLouverPosition",
                    id: 0x45,
                    type: "enum8",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AcCoilTemperature",
                    id: 0x46,
                    type: "int16",
                    conformance: "O",
                    constraint: "min -27315",
                    default: 32768,
                    quality: "X",
                }),
                Attribute({
                    name: "AcCapacityFormat",
                    id: 0x47,
                    type: "enum8",
                    access: "RW VM",
                    conformance: "O",
                    default: 0,
                }),

                Command({
                    name: "SetpointRaiseLower",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "Mode", type: "SetpointAdjustMode", conformance: "M" }),
                        Field({ name: "Amount", type: "int8", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "SetWeeklySchedule",
                    id: 0x1,
                    access: "R M",
                    conformance: "O",
                    direction: "request",

                    children: [
                        Field({ name: "NumberOfTransitionsForSequence", type: "uint8", conformance: "M" }),
                        Field({ name: "DayOfWeekForSequence", type: "DayOfWeek", conformance: "M" }),
                        Field({ name: "ModeForSequence", type: "ModeForSequence", conformance: "M" }),
                        Field({
                            name: "Transitions",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "ThermostatScheduleTransition" })],
                        }),
                    ],
                }),

                Command({
                    name: "GetWeeklySchedule",
                    id: 0x2,
                    conformance: "O",
                    direction: "request",
                    response: "GetWeeklyScheduleResponse",
                    children: [
                        Field({ name: "DaysToReturn", type: "DayOfWeek", conformance: "M" }),
                        Field({ name: "ModeToReturn", type: "ModeForSequence", conformance: "M" }),
                    ],
                }),

                Command({
                    name: "ClearWeeklySchedule",
                    id: 0x3,
                    access: "R M",
                    conformance: "O",
                    direction: "request",
                }),

                Command({
                    name: "GetWeeklyScheduleResponse",
                    id: 0x0,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "NumberOfTransitionsForSequence", type: "uint8", conformance: "M" }),
                        Field({ name: "DayOfWeekForSequence", type: "DayOfWeek", conformance: "M" }),
                        Field({ name: "ModeForSequence", type: "ModeForSequence", conformance: "M" }),
                        Field({
                            name: "Transitions",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "ThermostatScheduleTransition" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "ThermostatControlSequence",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "CoolingOnly", id: 0x0, conformance: "M" }),
                        Field({ name: "CoolingWithReheat", id: 0x1, conformance: "M" }),
                        Field({ name: "HeatingOnly", id: 0x2, conformance: "M" }),
                        Field({ name: "HeatingWithReheat", id: 0x3, conformance: "M" }),
                        Field({ name: "CoolingAndHeating", id: 0x4, conformance: "M" }),
                        Field({ name: "CoolingAndHeatingWithReheat", id: 0x5, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "SetpointAdjustMode",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Heat", id: 0x0, conformance: "M" }),
                        Field({ name: "Cool", id: 0x1, conformance: "M" }),
                        Field({ name: "Both", id: 0x2, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "DayOfWeek",
                    type: "map8",
                    conformance: "M",

                    children: [
                        Field({ name: "Sunday", constraint: "0" }),
                        Field({ name: "Monday", constraint: "1" }),
                        Field({ name: "Tuesday", constraint: "2" }),
                        Field({ name: "Wednesday", constraint: "3" }),
                        Field({ name: "Thursday", constraint: "4" }),
                        Field({ name: "Friday", constraint: "5" }),
                        Field({ name: "Saturday", constraint: "6" }),
                        Field({ name: "Away", constraint: "7" }),
                    ],
                }),

                Datatype({
                    name: "ModeForSequence",
                    type: "map8",
                    conformance: "M",
                    children: [
                        Field({ name: "HeatSetpointPresent", constraint: "0" }),
                        Field({ name: "CoolSetpointPresent", constraint: "1" }),
                    ],
                }),

                Datatype({
                    name: "ThermostatScheduleTransition",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "TransitionTime", id: 0x0, type: "uint16", conformance: "M" }),
                        Field({ name: "HeatSetpoint", id: 0x1, type: "int16", conformance: "M", quality: "X" }),
                        Field({ name: "CoolSetpoint", id: 0x2, type: "int16", conformance: "M", quality: "X" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "ThermostatUserInterfaceConfiguration",
            id: 0x204,
            description: "Thermostat User Interface Configuration",
            details:
                "An interface for configuring the user interface of a thermostat (which may be remote from the " +
                "thermostat).",

            children: [
                Attribute({
                    name: "TemperatureDisplayMode",
                    id: 0x0,
                    type: "enum8",
                    access: "RW",
                    conformance: "M",
                    default: 0,
                    children: [
                        Field({ name: "Celsius", id: 0x0, conformance: "M" }),
                        Field({ name: "Fahrenheit", id: 0x1, conformance: "M" }),
                    ],
                }),

                Attribute({
                    name: "KeypadLockout",
                    id: 0x1,
                    type: "enum8",
                    access: "RW VM",
                    conformance: "M",
                    default: 0,

                    children: [
                        Field({ name: "NoLockout", id: 0x0, conformance: "M" }),
                        Field({ name: "LevelOneLockout", id: 0x1, conformance: "M" }),
                        Field({ name: "LevelTwoLockout", id: 0x2, conformance: "M" }),
                        Field({ name: "LevelThreeLockout", id: 0x3, conformance: "M" }),
                        Field({ name: "LevelFourLockout", id: 0x4, conformance: "M" }),
                        Field({ name: "LevelfiveLockout", id: 0x5, conformance: "M" }),
                    ],
                }),

                Attribute({
                    name: "ScheduleProgrammingVisibility",
                    id: 0x2,
                    type: "enum8",
                    access: "RW VM",
                    conformance: "O",
                }),
            ],
        }),

        Cluster({
            name: "ThreadNetworkDiagnostics",
            id: 0x35,
            description: "Thread Network Diagnostics",
            details:
                "The Thread Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics " +
                "that MAY be used by a Node to assist a user or Administrative Node in diagnosing potential problems",

            children: [
                Attribute({ name: "Channel", id: 0x0, type: "uint16", conformance: "M", quality: "X" }),
                Attribute({ name: "RoutingRole", id: 0x1, type: "RoutingRole", conformance: "M", quality: "X" }),
                Attribute({
                    name: "NetworkName",
                    id: 0x2,
                    type: "string",
                    conformance: "M",
                    constraint: "max 16",
                    default: "",
                    quality: "X",
                }),
                Attribute({ name: "DiagPanId", id: 0x3, type: "uint16", conformance: "M", default: 0, quality: "X" }),
                Attribute({
                    name: "DiagExtendedPanId",
                    id: 0x4,
                    type: "uint64",
                    conformance: "M",
                    default: 0,
                    quality: "X",
                }),
                Attribute({ name: "MeshLocalPrefix", id: 0x5, type: "octstr", conformance: "M", quality: "X" }),
                Attribute({ name: "DiagOverrunCount", id: 0x6, type: "uint64", conformance: "O", default: 0 }),
                Attribute({
                    name: "NeighborTable",
                    id: 0x7,
                    type: "list",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "NeighborTable" })],
                }),
                Attribute({
                    name: "RouteTable",
                    id: 0x8,
                    type: "list",
                    conformance: "M",
                    constraint: "max 254",
                    children: [Field({ name: "entry", type: "RouteTable" })],
                }),
                Attribute({ name: "PartitionId", id: 0x9, type: "uint32", conformance: "M", quality: "X" }),
                Attribute({ name: "Weighting", id: 0xa, type: "uint8", conformance: "M", quality: "X" }),
                Attribute({ name: "DataVersion", id: 0xb, type: "uint8", conformance: "M", quality: "X" }),
                Attribute({ name: "StableDataVersion", id: 0xc, type: "uint8", conformance: "M", quality: "X" }),
                Attribute({ name: "LeaderRouterId", id: 0xd, type: "uint8", conformance: "M", quality: "X" }),
                Attribute({ name: "DetachedRoleCount", id: 0xe, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "ChildRoleCount", id: 0xf, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "RouterRoleCount", id: 0x10, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "LeaderRoleCount", id: 0x11, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "AttachAttemptCount", id: 0x12, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "PartitionIdChangeCount", id: 0x13, type: "uint16", conformance: "O", default: 0 }),
                Attribute({
                    name: "BetterPartitionAttachAttemptCount",
                    id: 0x14,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "ParentChangeCount", id: 0x15, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "TxTotalCount", id: 0x16, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxUnicastCount", id: 0x17, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxBroadcastCount", id: 0x18, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxAckRequestedCount", id: 0x19, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxAckedCount", id: 0x1a, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxNoAckRequestedCount", id: 0x1b, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxDataCount", id: 0x1c, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxDataPollCount", id: 0x1d, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxBeaconCount", id: 0x1e, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxBeaconRequestCount", id: 0x1f, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxOtherCount", id: 0x20, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxRetryCount", id: 0x21, type: "uint32", conformance: "O", default: 0 }),
                Attribute({
                    name: "TxDirectMaxRetryExpiryCount",
                    id: 0x22,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "TxIndirectMaxRetryExpiryCount",
                    id: 0x23,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "TxErrCcaCount", id: 0x24, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxErrAbortCount", id: 0x25, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "TxErrBusyChannelCount", id: 0x26, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxTotalCount", id: 0x27, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxUnicastCount", id: 0x28, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxBroadcastCount", id: 0x29, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxDataCount", id: 0x2a, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxDataPollCount", id: 0x2b, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxBeaconCount", id: 0x2c, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxBeaconRequestCount", id: 0x2d, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxOtherCount", id: 0x2e, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxAddressFilteredCount", id: 0x2f, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxDestaddrFilteredCount", id: 0x30, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxDuplicatedCount", id: 0x31, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxErrNoFrameCount", id: 0x32, type: "uint32", conformance: "O", default: 0 }),
                Attribute({
                    name: "RxErrUnknownNeighborCount",
                    id: 0x33,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "RxErrInvalidSrcAddrCount", id: 0x34, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxErrSecCount", id: 0x35, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxErrFcsCount", id: 0x36, type: "uint32", conformance: "O", default: 0 }),
                Attribute({ name: "RxErrOtherCount", id: 0x37, type: "uint32", conformance: "O", default: 0 }),
                Attribute({
                    name: "ActiveTimestamp",
                    id: 0x38,
                    type: "uint64",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PendingTimestamp",
                    id: 0x39,
                    type: "uint64",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({ name: "Delay", id: 0x3a, type: "uint32", conformance: "O", default: 0, quality: "X" }),
                Attribute({ name: "SecurityPolicy", id: 0x3b, type: "SecurityPolicy", conformance: "M", quality: "X" }),
                Attribute({ name: "DiagChannelMask", id: 0x3c, type: "octstr", conformance: "M", quality: "X" }),
                Attribute({
                    name: "OperationalDatasetComponents",
                    id: 0x3d,
                    type: "OperationalDatasetComponents",
                    conformance: "M",
                    quality: "X",
                }),
                Attribute({
                    name: "ActiveThreadNetworkFaults",
                    id: 0x3e,
                    type: "list",
                    conformance: "M",
                    constraint: "max 4",
                    children: [Field({ name: "entry", type: "NetworkFault" })],
                }),
                Command({ name: "ResetCounts", id: 0x0, conformance: "O", direction: "request" }),

                Event({
                    name: "ConnectionStatus",
                    id: 0x0,
                    conformance: "O",
                    priority: "info",
                    children: [
                        Field({ name: "ConnectionStatus", id: 0x0, type: "ConnectionStatusEnum", conformance: "M" }),
                    ],
                }),

                Event({
                    name: "NetworkFaultChange",
                    id: 0x1,
                    conformance: "O",
                    priority: "info",

                    children: [
                        Field({
                            name: "Current",
                            id: 0x0,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "NetworkFault" })],
                        }),
                        Field({
                            name: "Previous",
                            id: 0x1,
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "NetworkFault" })],
                        }),
                    ],
                }),

                Datatype({
                    name: "RoutingRole",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "Unassigned", id: 0x1, conformance: "M" }),
                        Field({ name: "SleepyEndDevice", id: 0x2, conformance: "M" }),
                        Field({ name: "EndDevice", id: 0x3, conformance: "M" }),
                        Field({ name: "Reed", id: 0x4, conformance: "M" }),
                        Field({ name: "Router", id: 0x5, conformance: "M" }),
                        Field({ name: "Leader", id: 0x6, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "NeighborTable",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "ExtAddress", type: "uint64", conformance: "M" }),
                        Field({ name: "Age", type: "uint32", conformance: "M" }),
                        Field({ name: "Rloc16", type: "uint16", conformance: "M" }),
                        Field({ name: "LinkFrameCounter", type: "uint32", conformance: "M" }),
                        Field({ name: "MleFrameCounter", type: "uint32", conformance: "M" }),
                        Field({ name: "Lqi", type: "uint8", conformance: "M" }),
                        Field({ name: "AverageRssi", type: "int8", conformance: "M", quality: "X" }),
                        Field({ name: "LastRssi", type: "int8", conformance: "M", quality: "X" }),
                        Field({ name: "FrameErrorRate", type: "uint8", conformance: "M" }),
                        Field({ name: "MessageErrorRate", type: "uint8", conformance: "M" }),
                        Field({ name: "RxOnWhenIdle", type: "bool", conformance: "M" }),
                        Field({ name: "FullThreadDevice", type: "bool", conformance: "M" }),
                        Field({ name: "FullNetworkData", type: "bool", conformance: "M" }),
                        Field({ name: "IsChild", type: "bool", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "RouteTable",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "ExtAddress", type: "uint64", conformance: "M" }),
                        Field({ name: "Rloc16", type: "uint16", conformance: "M" }),
                        Field({ name: "RouterId", type: "uint8", conformance: "M" }),
                        Field({ name: "NextHop", type: "uint8", conformance: "M" }),
                        Field({ name: "PathCost", type: "uint8", conformance: "M" }),
                        Field({ name: "LqiIn", type: "uint8", conformance: "M" }),
                        Field({ name: "LqiOut", type: "uint8", conformance: "M" }),
                        Field({ name: "Age", type: "uint8", conformance: "M" }),
                        Field({ name: "Allocated", type: "bool", conformance: "M" }),
                        Field({ name: "LinkEstablished", type: "bool", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "SecurityPolicy",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "RotationTime", type: "uint16", conformance: "M" }),
                        Field({ name: "Flags", type: "uint16", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "OperationalDatasetComponents",
                    type: "struct",
                    conformance: "M",

                    children: [
                        Field({ name: "ActiveTimestampPresent", type: "bool", conformance: "M" }),
                        Field({ name: "PendingTimestampPresent", type: "bool", conformance: "M" }),
                        Field({ name: "MasterKeyPresent", type: "bool", conformance: "M" }),
                        Field({ name: "NetworkNamePresent", type: "bool", conformance: "M" }),
                        Field({ name: "ExtendedPanIdPresent", type: "bool", conformance: "M" }),
                        Field({ name: "MeshLocalPrefixPresent", type: "bool", conformance: "M" }),
                        Field({ name: "DelayPresent", type: "bool", conformance: "M" }),
                        Field({ name: "PanIdPresent", type: "bool", conformance: "M" }),
                        Field({ name: "ChannelPresent", type: "bool", conformance: "M" }),
                        Field({ name: "PskcPresent", type: "bool", conformance: "M" }),
                        Field({ name: "SecurityPolicyPresent", type: "bool", conformance: "M" }),
                        Field({ name: "ChannelMaskPresent", type: "bool", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "NetworkFault",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "LinkDown", id: 0x1, conformance: "M" }),
                        Field({ name: "HardwareFailure", id: 0x2, conformance: "M" }),
                        Field({ name: "NetworkJammed", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ConnectionStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Connected", id: 0x0, conformance: "M" }),
                        Field({ name: "NotConnected", id: 0x1, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "TimeFormatLocalization",
            id: 0x2c,
            description: "Time Format Localization",
            details:
                "Nodes should be expected to be deployed to any and all regions of the world. These global regions " +
                "may have differing preferences for how dates and times are conveyed. As such, Nodes that visually " +
                "or audibly convey time information need a mechanism by which they can be configured to use a user’s " +
                "preferred format.",

            children: [
                Attribute({ name: "HourFormat", id: 0x0, type: "HourFormatEnum", access: "RW", conformance: "M" }),
                Attribute({
                    name: "ActiveCalendarType",
                    id: 0x1,
                    type: "CalendarTypeEnum",
                    access: "RW",
                    conformance: "O",
                }),
                Attribute({
                    name: "SupportedCalendarTypes",
                    id: 0x2,
                    type: "list",
                    conformance: "O",
                    children: [Field({ name: "entry", type: "CalendarTypeEnum" })],
                }),

                Datatype({
                    name: "HourFormatEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "12Hr", id: 0x0, conformance: "M" }),
                        Field({ name: "24Hr", id: 0x1, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "CalendarTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Buddhist", id: 0x0, conformance: "M" }),
                        Field({ name: "Chinese", id: 0x1, conformance: "M" }),
                        Field({ name: "Coptic", id: 0x2, conformance: "M" }),
                        Field({ name: "Ethiopian", id: 0x3, conformance: "M" }),
                        Field({ name: "Gregorian", id: 0x4, conformance: "M" }),
                        Field({ name: "Hebrew", id: 0x5, conformance: "M" }),
                        Field({ name: "Indian", id: 0x6, conformance: "M" }),
                        Field({ name: "Islamic", id: 0x7, conformance: "M" }),
                        Field({ name: "Japanese", id: 0x8, conformance: "M" }),
                        Field({ name: "Korean", id: 0x9, conformance: "M" }),
                        Field({ name: "Persian", id: 0xa, conformance: "M" }),
                        Field({ name: "Taiwanese", id: 0xb, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "TimeSynchronization",
            id: 0x38,
            description: "Time Synchronization",
            details:
                "Accurate time is required for a number of reasons, including scheduling, display and validating " +
                "security materials.",

            children: [
                Attribute({ name: "UtcTime", id: 0x0, type: "epoch-us", conformance: "M", quality: "X" }),
                Attribute({ name: "Granularity", id: 0x1, type: "GranularityEnum", conformance: "M", default: 0 }),
                Attribute({ name: "TimeSource", id: 0x2, type: "TimeSourceEnum", conformance: "O", default: 0 }),
                Attribute({
                    name: "TrustedTimeNodeId",
                    id: 0x3,
                    type: "node-id",
                    access: "RW VA",
                    conformance: "M",
                    quality: "X",
                }),
                Attribute({
                    name: "DefaultNtp",
                    id: 0x4,
                    type: "string",
                    access: "RW VA",
                    conformance: "O",
                    constraint: "max 128",
                    quality: "X",
                }),
                Attribute({
                    name: "TimeZone",
                    id: 0x5,
                    type: "list",
                    access: "RW VM",
                    conformance: "O",
                    children: [Field({ name: "entry", type: "TimeZoneStruct" })],
                }),
                Attribute({
                    name: "DstOffset",
                    id: 0x6,
                    type: "list",
                    access: "RW VM",
                    conformance: "O",
                    children: [Field({ name: "entry", type: "DstOffsetStruct" })],
                }),
                Attribute({ name: "LocalTime", id: 0x7, type: "epoch-us", conformance: "O", default: 0, quality: "X" }),
                Attribute({ name: "TimeZoneDatabase", id: 0x8, type: "bool", conformance: "O", default: true }),
                Attribute({ name: "NtpServerPort", id: 0x9, type: "uint16", conformance: "O", quality: "X" }),

                Command({
                    name: "SetUtcTime",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    children: [
                        Field({ name: "UtcTime", type: "epoch-us", conformance: "M" }),
                        Field({ name: "Granularity", type: "GranularityEnum", conformance: "M" }),
                        Field({ name: "TimeSource", type: "TimeSourceEnum", conformance: "O" }),
                    ],
                }),

                Datatype({
                    name: "GranularityEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "NoTimeGranularity", id: 0x0, conformance: "M" }),
                        Field({ name: "MinutesGranularity", id: 0x1, conformance: "M" }),
                        Field({ name: "SecondsGranularity", id: 0x2, conformance: "M" }),
                        Field({ name: "MillisecondsGranularity", id: 0x3, conformance: "M" }),
                        Field({ name: "MicrosecondsGranularity", id: 0x4, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "TimeSourceEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "None", id: 0x0, conformance: "M" }),
                        Field({ name: "Unknown", id: 0x1, conformance: "M" }),
                        Field({ name: "Admin", id: 0x2, conformance: "M" }),
                        Field({ name: "NodeTimeCluster", id: 0x3, conformance: "M" }),
                        Field({ name: "NonFabricSntp", id: 0x4, conformance: "M" }),
                        Field({ name: "NonFabricNtp", id: 0x5, conformance: "M" }),
                        Field({ name: "FabricSntp", id: 0x6, conformance: "M" }),
                        Field({ name: "FabricNtp", id: 0x7, conformance: "M" }),
                        Field({ name: "MixedNtp", id: 0x8, conformance: "M" }),
                        Field({ name: "NonFabricSntpNts", id: 0x9, conformance: "M" }),
                        Field({ name: "NonFabricNtpNts", id: 0xa, conformance: "M" }),
                        Field({ name: "FabricSntpNts", id: 0xb, conformance: "M" }),
                        Field({ name: "FabricNtpNts", id: 0xc, conformance: "M" }),
                        Field({ name: "MixedNtpNts", id: 0xd, conformance: "M" }),
                        Field({ name: "CloudSource", id: 0xe, conformance: "M" }),
                        Field({ name: "Ptp", id: 0xf, conformance: "M" }),
                        Field({ name: "Gnss", id: 0x10, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "TimeZoneStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Offset", id: 0x0, type: "int32", conformance: "M" }),
                        Field({ name: "ValidAt", id: 0x1, type: "epoch-us", conformance: "M" }),
                        Field({ name: "Name", id: 0x2, type: "string", conformance: "O", constraint: "max 64" }),
                    ],
                }),

                Datatype({
                    name: "DstOffsetStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Offset", id: 0x0, type: "int32", conformance: "M" }),
                        Field({ name: "ValidStarting", id: 0x1, type: "epoch-us", conformance: "M" }),
                        Field({ name: "ValidUntil", id: 0x2, type: "epoch-us", conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "UnitLocalization",
            id: 0x2d,
            description: "Unit Localization",
            details:
                "Nodes should be expected to be deployed to any and all regions of the world. These global regions " +
                "may have differing preferences for the units in which values are conveyed in communication to a " +
                "user. As such, Nodes that visually or audibly convey measurable values to the user need a mechanism " +
                "by which they can be configured to use a user’s preferred unit.",

            children: [
                Attribute({ name: "TemperatureUnit", id: 0x0, type: "TempUnitEnum", access: "RW", conformance: "O" }),

                Datatype({
                    name: "TempUnitEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Fahrenheit", id: 0x0, conformance: "M" }),
                        Field({ name: "Celsius", id: 0x1, conformance: "M" }),
                        Field({ name: "Kelvin", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "UserLabel",
            id: 0x41,
            description: "User Label",
            details: "The User Label Cluster provides a feature to tag an endpoint with zero or more labels.",

            children: [
                Attribute({
                    name: "LabelList",
                    id: 0x0,
                    type: "list",
                    access: "RW VM",
                    conformance: "M",
                    children: [Field({ name: "entry", type: "LabelStruct" })],
                }),

                Datatype({
                    name: "LabelStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        Field({ name: "Label", type: "string", conformance: "M", constraint: "max 16" }),
                        Field({ name: "Value", type: "string", conformance: "M", constraint: "max 16" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "WakeOnLan",
            id: 0x503,
            description: "Wake on LAN",
            details:
                "This cluster provides an interface for managing low power mode on a device that supports the Wake " +
                "On LAN protocol.",
            children: [
                Attribute({
                    name: "WakeOnLanMacAddress",
                    id: 0x0,
                    type: "string",
                    conformance: "O",
                    constraint: "max 32",
                }),
            ],
        }),

        Cluster({
            name: "WiFiNetworkDiagnostics",
            id: 0x36,
            description: "WiFi Network Diagnostics",
            details:
                "The Wi-Fi Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics " +
                "that MAY be used by a Node to assist a user or Administrative Node in diagnosing potential problems.",

            children: [
                Attribute({ name: "Bssid", id: 0x0, type: "octstr", conformance: "M", quality: "X" }),
                Attribute({ name: "SecurityType", id: 0x1, type: "SecurityTypeEnum", conformance: "M", quality: "X" }),
                Attribute({ name: "WifiVersion", id: 0x2, type: "WiFiVersionEnum", conformance: "M", quality: "X" }),
                Attribute({
                    name: "ChannelNumber",
                    id: 0x3,
                    type: "uint16",
                    conformance: "M",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "Rssi",
                    id: 0x4,
                    type: "int8",
                    conformance: "M",
                    constraint: "-120 to 0",
                    quality: "X",
                }),
                Attribute({
                    name: "BeaconLostCount",
                    id: 0x5,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "BeaconRxCount",
                    id: 0x6,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PacketMulticastRxCount",
                    id: 0x7,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PacketMulticastTxCount",
                    id: 0x8,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PacketUnicastRxCount",
                    id: 0x9,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "PacketUnicastTxCount",
                    id: 0xa,
                    type: "uint32",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "CurrentMaxRate",
                    id: 0xb,
                    type: "uint64",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Attribute({
                    name: "OverrunCount",
                    id: 0xc,
                    type: "uint64",
                    conformance: "O",
                    default: 0,
                    quality: "X",
                }),
                Command({ name: "ResetCounts", id: 0x0, conformance: "O", direction: "request" }),
                Event({
                    name: "Disconnection",
                    id: 0x0,
                    conformance: "O",
                    priority: "info",
                    children: [Field({ name: "ReasonCode", id: 0x0, type: "uint16", conformance: "M" })],
                }),

                Event({
                    name: "AssociationFailure",
                    id: 0x1,
                    conformance: "O",
                    priority: "info",

                    children: [
                        Field({
                            name: "AssociationFailure",
                            id: 0x0,
                            type: "AssociationFailureCauseEnum",
                            conformance: "M",
                        }),
                        Field({ name: "Status", id: 0x1, type: "uint16", conformance: "M" }),
                    ],
                }),

                Event({
                    name: "ConnectionStatus",
                    id: 0x2,
                    conformance: "O",
                    priority: "info",
                    children: [
                        Field({ name: "ConnectionStatus", id: 0x0, type: "ConnectionStatusEnum", conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "SecurityTypeEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unspecified", id: 0x0, conformance: "M" }),
                        Field({ name: "None", id: 0x1, conformance: "M" }),
                        Field({ name: "Wep", id: 0x2, conformance: "M" }),
                        Field({ name: "Wpa", id: 0x3, conformance: "M" }),
                        Field({ name: "Wpa2", id: 0x4, conformance: "M" }),
                        Field({ name: "Wpa3", id: 0x5, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "WiFiVersionEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "A", id: 0x0, conformance: "M" }),
                        Field({ name: "B", id: 0x1, conformance: "M" }),
                        Field({ name: "G", id: 0x2, conformance: "M" }),
                        Field({ name: "N", id: 0x3, conformance: "M" }),
                        Field({ name: "Ac", id: 0x4, conformance: "M" }),
                        Field({ name: "Ax", id: 0x5, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "AssociationFailureCauseEnum",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "Unknown", id: 0x0, conformance: "M" }),
                        Field({ name: "AssociationFailed", id: 0x1, conformance: "M" }),
                        Field({ name: "AuthenticationFailed", id: 0x2, conformance: "M" }),
                        Field({ name: "SsidNotFound", id: 0x3, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ConnectionStatusEnum",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Connected", id: 0x0, conformance: "M" }),
                        Field({ name: "NotConnected", id: 0x1, conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "WindowCovering",
            id: 0x102,
            description: "Window Covering",
            details: "Provides an interface for controlling and adjusting automatic window coverings.",

            children: [
                Attribute({ name: "WcType", id: 0x0, type: "Type", conformance: "M", default: 0 }),
                Attribute({ name: "WcPhysicalClosedLimitLift", id: 0x1, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "WcPhysicalClosedLimitTilt", id: 0x2, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "WcCurrentPositionLift", id: 0x3, type: "uint16", conformance: "O", quality: "X" }),
                Attribute({ name: "WcCurrentPositionTilt", id: 0x4, type: "uint16", conformance: "O", quality: "X" }),
                Attribute({ name: "WcNumberOfActuationsLift", id: 0x5, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "WcNumberOfActuationsTilt", id: 0x6, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "WcConfigStatus", id: 0x7, type: "ConfigStatus", conformance: "M", default: 3 }),
                Attribute({
                    name: "WcCurrentPositionLiftPercentage",
                    id: 0x8,
                    type: "percent",
                    conformance: "O",
                    quality: "X P",
                }),
                Attribute({
                    name: "WcCurrentPositionTiltPercentage",
                    id: 0x9,
                    type: "percent",
                    conformance: "O",
                    quality: "X P",
                }),
                Attribute({
                    name: "WcOperationalStatus",
                    id: 0xa,
                    type: "OperationalStatus",
                    conformance: "M",
                    default: 0,
                    quality: "P",
                }),
                Attribute({
                    name: "WcTargetPositionLiftPercent100ths",
                    id: 0xb,
                    type: "percent100ths",
                    conformance: "O",
                    quality: "X P",
                }),
                Attribute({
                    name: "WcTargetPositionTiltPercent100ths",
                    id: 0xc,
                    type: "percent100ths",
                    conformance: "O",
                    quality: "X P",
                }),
                Attribute({ name: "WcEndProductType", id: 0xd, type: "EndProductType", conformance: "M", default: 0 }),
                Attribute({
                    name: "WcCurrentPositionLiftPercent100ths",
                    id: 0xe,
                    type: "percent100ths",
                    conformance: "O",
                    quality: "X P",
                }),
                Attribute({
                    name: "WcCurrentPositionTiltPercent100ths",
                    id: 0xf,
                    type: "percent100ths",
                    conformance: "O",
                    quality: "X P",
                }),
                Attribute({ name: "WcInstalledOpenLimitLift", id: 0x10, type: "uint16", conformance: "O", default: 0 }),
                Attribute({
                    name: "WcInstalledClosedLimitLift",
                    id: 0x11,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "WcInstalledOpenLimitTilt", id: 0x12, type: "uint16", conformance: "O", default: 0 }),
                Attribute({
                    name: "WcInstalledClosedLimitTilt",
                    id: 0x13,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "WcMode", id: 0x17, type: "Mode", access: "RW VM", conformance: "M", default: 0 }),
                Attribute({
                    name: "WcSafetyStatus",
                    id: 0x1a,
                    type: "SafetyStatus",
                    conformance: "O",
                    default: 0,
                    quality: "P",
                }),
                Command({ name: "UpOrOpen", id: 0x0, conformance: "M", direction: "request" }),
                Command({ name: "DownOrClose", id: 0x1, conformance: "M", direction: "request" }),
                Command({ name: "StopMotion", id: 0x2, conformance: "M", direction: "request" }),
                Command({
                    name: "GoToLiftValue",
                    id: 0x4,
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "LiftValue", type: "uint16", conformance: "M" })],
                }),
                Command({
                    name: "GoToLiftPercentage",
                    id: 0x5,
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "LiftPercent100thsValue", type: "percent100ths", conformance: "M" })],
                }),
                Command({
                    name: "GoToTiltValue",
                    id: 0x7,
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "TiltValue", type: "uint16", conformance: "M" })],
                }),
                Command({
                    name: "GoToTiltPercentage",
                    id: 0x8,
                    conformance: "O",
                    direction: "request",
                    children: [Field({ name: "TiltPercent100thsValue", type: "percent100ths", conformance: "M" })],
                }),

                Datatype({
                    name: "Type",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "RollerShade", id: 0x0, conformance: "M" }),
                        Field({ name: "RollerShade2Motor", id: 0x1, conformance: "M" }),
                        Field({ name: "RollerShadeExterior", id: 0x2, conformance: "M" }),
                        Field({ name: "RollerShadeExterior2Motor", id: 0x3, conformance: "M" }),
                        Field({ name: "Drapery", id: 0x4, conformance: "M" }),
                        Field({ name: "Awning", id: 0x5, conformance: "M" }),
                        Field({ name: "Shutter", id: 0x6, conformance: "M" }),
                        Field({ name: "TiltBlindTiltOnly", id: 0x7, conformance: "M" }),
                        Field({ name: "TiltBlindLiftAndTilt", id: 0x8, conformance: "M" }),
                        Field({ name: "ProjectorScreen", id: 0x9, conformance: "M" }),
                        Field({ name: "Unknown", id: 0xff, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "ConfigStatus",
                    type: "map8",
                    conformance: "M",

                    children: [
                        Field({ name: "Operational", constraint: "0" }),
                        Field({ name: "OnlineReserved", constraint: "1" }),
                        Field({ name: "LiftMovementReversed", constraint: "2" }),
                        Field({ name: "LiftPositionAware", constraint: "3" }),
                        Field({ name: "TiltPositionAware", constraint: "4" }),
                        Field({ name: "LiftEncoderControlled", constraint: "5" }),
                        Field({ name: "TiltEncoderControlled", constraint: "6" }),
                    ],
                }),

                Datatype({
                    name: "OperationalStatus",
                    type: "map8",
                    conformance: "M",
                    children: [
                        Field({ name: "Global", constraint: "0 to 2" }),
                        Field({ name: "Lift", constraint: "2 to 4" }),
                        Field({ name: "Tilt", constraint: "4 to 6" }),
                    ],
                }),

                Datatype({
                    name: "EndProductType",
                    type: "enum8",
                    conformance: "M",

                    children: [
                        Field({ name: "RollerShade", id: 0x0, conformance: "M" }),
                        Field({ name: "RomanShade", id: 0x1, conformance: "M" }),
                        Field({ name: "BalloonShade", id: 0x2, conformance: "M" }),
                        Field({ name: "WovenWood", id: 0x3, conformance: "M" }),
                        Field({ name: "PleatedShade", id: 0x4, conformance: "M" }),
                        Field({ name: "CellularShade", id: 0x5, conformance: "M" }),
                        Field({ name: "LayeredShade", id: 0x6, conformance: "M" }),
                        Field({ name: "LayeredShade2D", id: 0x7, conformance: "M" }),
                        Field({ name: "SheerShade", id: 0x8, conformance: "M" }),
                        Field({ name: "TiltOnlyInteriorBlind", id: 0x9, conformance: "M" }),
                        Field({ name: "InteriorBlind", id: 0xa, conformance: "M" }),
                        Field({ name: "VerticalBlindStripCurtain", id: 0xb, conformance: "M" }),
                        Field({ name: "InteriorVenetianBlind", id: 0xc, conformance: "M" }),
                        Field({ name: "ExteriorVenetianBlind", id: 0xd, conformance: "M" }),
                        Field({ name: "LateralLeftCurtain", id: 0xe, conformance: "M" }),
                        Field({ name: "LateralRightCurtain", id: 0xf, conformance: "M" }),
                        Field({ name: "CentralCurtain", id: 0x10, conformance: "M" }),
                        Field({ name: "RollerShutter", id: 0x11, conformance: "M" }),
                        Field({ name: "ExteriorVerticalScreen", id: 0x12, conformance: "M" }),
                        Field({ name: "AwningTerracePatio", id: 0x13, conformance: "M" }),
                        Field({ name: "AwningVerticalScreen", id: 0x14, conformance: "M" }),
                        Field({ name: "TiltOnlyPergola", id: 0x15, conformance: "M" }),
                        Field({ name: "SwingingShutter", id: 0x16, conformance: "M" }),
                        Field({ name: "SlidingShutter", id: 0x17, conformance: "M" }),
                        Field({ name: "Unknown", id: 0xff, conformance: "M" }),
                    ],
                }),

                Datatype({
                    name: "Mode",
                    type: "map8",
                    conformance: "M",

                    children: [
                        Field({ name: "MotorDirectionReversed", constraint: "0" }),
                        Field({ name: "CalibrationMode", constraint: "1" }),
                        Field({ name: "MaintenanceMode", constraint: "2" }),
                        Field({ name: "LedFeedback", constraint: "3" }),
                    ],
                }),

                Datatype({
                    name: "SafetyStatus",
                    type: "map16",
                    conformance: "M",

                    children: [
                        Field({ name: "RemoteLockout", constraint: "0" }),
                        Field({ name: "TamperDetection", constraint: "1" }),
                        Field({ name: "FailedCommunication", constraint: "2" }),
                        Field({ name: "PositionFailure", constraint: "3" }),
                        Field({ name: "ThermalProtection", constraint: "4" }),
                        Field({ name: "ObstacleDetected", constraint: "5" }),
                        Field({ name: "Power", constraint: "6" }),
                        Field({ name: "StopInput", constraint: "7" }),
                        Field({ name: "MotorJammed", constraint: "8" }),
                        Field({ name: "HardwareFailure", constraint: "9" }),
                        Field({ name: "ManualOperation", constraint: "10" }),
                        Field({ name: "Protection", constraint: "11" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "BarrierControl",
            id: 0x103,
            description: "Barrier Control",
            details: "This cluster provides control of a barrier (garage door).",

            children: [
                Attribute({ name: "BarrierMovingState", id: 0x1, type: "enum8", conformance: "M" }),
                Attribute({ name: "BarrierSafetyStatus", id: 0x2, type: "map16", conformance: "M" }),
                Attribute({ name: "BarrierCapabilities", id: 0x3, type: "map8", conformance: "M" }),
                Attribute({
                    name: "BarrierOpenEvents",
                    id: 0x4,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 65534",
                    default: 0,
                }),
                Attribute({
                    name: "BarrierCloseEvents",
                    id: 0x5,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 65534",
                    default: 0,
                }),
                Attribute({
                    name: "BarrierCommandOpenEvents",
                    id: 0x6,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 65534",
                    default: 0,
                }),
                Attribute({
                    name: "BarrierCommandCloseEvents",
                    id: 0x7,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 65534",
                    default: 0,
                }),
                Attribute({
                    name: "BarrierOpenPeriod",
                    id: 0x8,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 65534",
                }),
                Attribute({
                    name: "BarrierClosePeriod",
                    id: 0x9,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 65534",
                }),
                Attribute({ name: "BarrierPosition", id: 0xa, type: "uint8", conformance: "M" }),
                Command({
                    name: "BarrierControlGoToPercent",
                    id: 0x0,
                    conformance: "M",
                    direction: "request",
                    children: [Field({ name: "PercentOpen", type: "uint8", conformance: "M" })],
                }),
                Command({ name: "BarrierControlStop", id: 0x1, conformance: "M", direction: "request" }),
            ],
        }),

        Cluster({
            name: "ElectricalMeasurement",
            id: 0xb04,
            description: "Electrical Measurement",
            details:
                "Attributes related to the electrical properties of a device. This cluster is used by power outlets " +
                "and other devices that need to provide instantaneous data as opposed to metrology data which should " +
                "be retrieved from the metering cluster..",

            children: [
                Attribute({ name: "MeasurementType", id: 0x0, type: "map32", conformance: "O", default: 0 }),
                Attribute({ name: "DcVoltage", id: 0x100, type: "int16", conformance: "O", default: 32768 }),
                Attribute({ name: "DcVoltageMin", id: 0x101, type: "int16", conformance: "O", default: 32768 }),
                Attribute({ name: "DcVoltageMax", id: 0x102, type: "int16", conformance: "O", default: 32768 }),
                Attribute({ name: "DcCurrent", id: 0x103, type: "int16", conformance: "O", default: 32768 }),
                Attribute({ name: "DcCurrentMin", id: 0x104, type: "int16", conformance: "O", default: 32768 }),
                Attribute({ name: "DcCurrentMax", id: 0x105, type: "int16", conformance: "O", default: 32768 }),
                Attribute({ name: "DcPower", id: 0x106, type: "int16", conformance: "O", default: 32768 }),
                Attribute({ name: "DcPowerMin", id: 0x107, type: "int16", conformance: "O", default: 32768 }),
                Attribute({ name: "DcPowerMax", id: 0x108, type: "int16", conformance: "O", default: 32768 }),
                Attribute({
                    name: "DcVoltageMultiplier",
                    id: 0x200,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "DcVoltageDivisor",
                    id: 0x201,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "DcCurrentMultiplier",
                    id: 0x202,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "DcCurrentDivisor",
                    id: 0x203,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "DcPowerMultiplier",
                    id: 0x204,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "DcPowerDivisor",
                    id: 0x205,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({ name: "AcFrequency", id: 0x300, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "AcFrequencyMin", id: 0x301, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "AcFrequencyMax", id: 0x302, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "NeutralCurrent", id: 0x303, type: "uint16", conformance: "O", default: 0 }),
                Attribute({ name: "TotalActivePower", id: 0x304, type: "int32", conformance: "O", default: 0 }),
                Attribute({ name: "TotalReactivePower", id: 0x305, type: "int32", conformance: "O", default: 0 }),
                Attribute({
                    name: "TotalApparentPower",
                    id: 0x306,
                    type: "uint32",
                    conformance: "O",
                    constraint: "max 16777215",
                    default: 1,
                }),
                Attribute({
                    name: "Measured1StHarmonicCurrent",
                    id: 0x307,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "Measured3RdHarmonicCurrent",
                    id: 0x308,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "Measured5ThHarmonicCurrent",
                    id: 0x309,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "Measured7ThHarmonicCurrent",
                    id: 0x30a,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "Measured9ThHarmonicCurrent",
                    id: 0x30b,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "Measured11ThHarmonicCurrent",
                    id: 0x30c,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "MeasuredPhase1StHarmonicCurrent",
                    id: 0x30d,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "MeasuredPhase3RdHarmonicCurrent",
                    id: 0x30e,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "MeasuredPhase5ThHarmonicCurrent",
                    id: 0x30f,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "MeasuredPhase7ThHarmonicCurrent",
                    id: 0x310,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "MeasuredPhase9ThHarmonicCurrent",
                    id: 0x311,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "MeasuredPhase11ThHarmonicCurrent",
                    id: 0x312,
                    type: "int16",
                    conformance: "O",
                    constraint: "max 0",
                    default: 32768,
                }),
                Attribute({
                    name: "AcFrequencyMultiplier",
                    id: 0x400,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "AcFrequencyDivisor",
                    id: 0x401,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "PowerMultiplier",
                    id: 0x402,
                    type: "uint32",
                    conformance: "O",
                    constraint: "max 16777215",
                    default: 1,
                }),
                Attribute({
                    name: "PowerDivisor",
                    id: 0x403,
                    type: "uint32",
                    conformance: "O",
                    constraint: "max 16777215",
                    default: 1,
                }),
                Attribute({
                    name: "HarmonicCurrentMultiplier",
                    id: 0x404,
                    type: "int8",
                    conformance: "O",
                    constraint: "min -127",
                    default: 0,
                }),
                Attribute({
                    name: "PhaseHarmonicCurrentMultiplier",
                    id: 0x405,
                    type: "int8",
                    conformance: "O",
                    constraint: "min -127",
                    default: 0,
                }),
                Attribute({ name: "InstantaneousVoltage", id: 0x500, type: "int16", conformance: "O", default: 65535 }),
                Attribute({
                    name: "InstantaneousLineCurrent",
                    id: 0x501,
                    type: "uint16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({
                    name: "InstantaneousActiveCurrent",
                    id: 0x502,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({
                    name: "InstantaneousReactiveCurrent",
                    id: 0x503,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({ name: "InstantaneousPower", id: 0x504, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsVoltage", id: 0x505, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsVoltageMin", id: 0x506, type: "uint16", conformance: "O", default: 32768 }),
                Attribute({ name: "RmsVoltageMax", id: 0x507, type: "uint16", conformance: "O", default: 32768 }),
                Attribute({ name: "RmsCurrent", id: 0x508, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsCurrentMin", id: 0x509, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsCurrentMax", id: 0x50a, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePower", id: 0x50b, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePowerMin", id: 0x50c, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePowerMax", id: 0x50d, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ReactivePower", id: 0x50e, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ApparentPower", id: 0x50f, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({
                    name: "AcPowerFactor",
                    id: 0x510,
                    type: "int8",
                    conformance: "O",
                    constraint: "-100 to 100",
                    default: 0,
                }),
                Attribute({
                    name: "AverageRmsVoltageMeasurementPeriod",
                    id: 0x511,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AverageRmsUnderVoltageCounter",
                    id: 0x513,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsExtremeOverVoltagePeriod",
                    id: 0x514,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsExtremeUnderVoltagePeriod",
                    id: 0x515,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsVoltageSagPeriod",
                    id: 0x516,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsVoltageSwellPeriod",
                    id: 0x517,
                    type: "uint16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AcVoltageMultiplier",
                    id: 0x600,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "AcVoltageDivisor",
                    id: 0x601,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "AcCurrentMultiplier",
                    id: 0x602,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "AcCurrentDivisor",
                    id: 0x603,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "AcPowerMultiplier",
                    id: 0x604,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "AcPowerDivisor",
                    id: 0x605,
                    type: "uint16",
                    conformance: "O",
                    constraint: "min 1",
                    default: 1,
                }),
                Attribute({
                    name: "DcOverloadAlarmsMask",
                    id: 0x700,
                    type: "map8",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "DcVoltageOverload", id: 0x701, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "DcCurrentOverload", id: 0x702, type: "int16", conformance: "O", default: 65535 }),
                Attribute({
                    name: "AcOverloadAlarmsMask",
                    id: 0x800,
                    type: "map16",
                    access: "RW",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "AcVoltageOverload", id: 0x801, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "AcCurrentOverload", id: 0x802, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "AcPowerOverload", id: 0x803, type: "int16", conformance: "O", default: 65535 }),
                Attribute({
                    name: "AcReactivePowerOverload",
                    id: 0x804,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({
                    name: "AverageRmsOverVoltage",
                    id: 0x805,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({
                    name: "AverageRmsUnderVoltage",
                    id: 0x806,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({
                    name: "RmsExtremeOverVoltage",
                    id: 0x807,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({
                    name: "RmsExtremeUnderVoltage",
                    id: 0x808,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({ name: "RmsVoltageSag", id: 0x809, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsVoltageSwell", id: 0x80a, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "LineCurrentPhaseB", id: 0x901, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActiveCurrentPhaseB", id: 0x902, type: "int16", conformance: "O", default: 65535 }),
                Attribute({
                    name: "ReactiveCurrentPhaseB",
                    id: 0x903,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({ name: "RmsVoltagePhaseB", id: 0x905, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsVoltageMinPhaseB", id: 0x906, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsVoltageMaxPhaseB", id: 0x907, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsCurrentPhaseB", id: 0x908, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsCurrentMinPhaseB", id: 0x909, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsCurrentMaxPhaseB", id: 0x90a, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePowerPhaseB", id: 0x90b, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePowerMinPhaseB", id: 0x90c, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePowerMaxPhaseB", id: 0x90d, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ReactivePowerPhaseB", id: 0x90e, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ApparentPowerPhaseB", id: 0x90f, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({
                    name: "PowerFactorPhaseB",
                    id: 0x910,
                    type: "int8",
                    conformance: "O",
                    constraint: "-100 to 100",
                    default: 0,
                }),
                Attribute({
                    name: "AverageRmsVoltageMeasurementPeriodPhaseB",
                    id: 0x911,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AverageRmsOverVoltageCounterPhaseB",
                    id: 0x912,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AverageRmsUnderVoltageCounterPhaseB",
                    id: 0x913,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsExtremeOverVoltagePeriodPhaseB",
                    id: 0x914,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsExtremeUnderVoltagePeriodPhaseB",
                    id: 0x915,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsVoltageSagPeriodPhaseB",
                    id: 0x916,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsVoltageSwellPeriodPhaseB",
                    id: 0x917,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({ name: "LineCurrentPhaseC", id: 0xa01, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActiveCurrentPhaseC", id: 0xa02, type: "int16", conformance: "O", default: 65535 }),
                Attribute({
                    name: "ReactiveCurrentPhaseC",
                    id: 0xa03,
                    type: "int16",
                    conformance: "O",
                    default: 65535,
                }),
                Attribute({ name: "RmsVoltagePhaseC", id: 0xa05, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsVoltageMinPhaseC", id: 0xa06, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsVoltageMaxPhaseC", id: 0xa07, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsCurrentPhaseC", id: 0xa08, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsCurrentMinPhaseC", id: 0xa09, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "RmsCurrentMaxPhaseC", id: 0xa0a, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePowerPhaseC", id: 0xa0b, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePowerMinPhaseC", id: 0xa0c, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ActivePowerMaxPhaseC", id: 0xa0d, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ReactivePowerPhaseC", id: 0xa0e, type: "int16", conformance: "O", default: 65535 }),
                Attribute({ name: "ApparentPowerPhaseC", id: 0xa0f, type: "uint16", conformance: "O", default: 65535 }),
                Attribute({
                    name: "PowerFactorPhaseC",
                    id: 0xa10,
                    type: "int8",
                    conformance: "O",
                    constraint: "-100 to 100",
                    default: 0,
                }),
                Attribute({
                    name: "AverageRmsVoltageMeasurementPeriodPhaseC",
                    id: 0xa11,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AverageRmsOverVoltageCounterPhaseC",
                    id: 0xa12,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "AverageRmsUnderVoltageCounterPhaseC",
                    id: 0xa13,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsExtremeOverVoltagePeriodPhaseC",
                    id: 0xa14,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsExtremeUnderVoltagePeriodPhaseC",
                    id: 0xa15,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsVoltageSagPeriodPhaseC",
                    id: 0xa16,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),
                Attribute({
                    name: "RmsVoltageSwellPeriodPhaseC",
                    id: 0xa17,
                    type: "uint16",
                    conformance: "O",
                    default: 0,
                }),

                Command({
                    name: "GetProfileInfoResponseCommand",
                    id: 0x0,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "ProfileCount", type: "uint8", conformance: "M" }),
                        Field({ name: "ProfileIntervalPeriod", type: "enum8", conformance: "M" }),
                        Field({ name: "MaxNumberOfIntervals", type: "uint8", conformance: "M" }),
                        Field({
                            name: "ListOfAttributes",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "uint16" })],
                        }),
                    ],
                }),

                Command({
                    name: "GetMeasurementProfileResponseCommand",
                    id: 0x1,
                    conformance: "O",
                    direction: "response",

                    children: [
                        Field({ name: "StartTime", type: "uint32", conformance: "M" }),
                        Field({ name: "Status", type: "status", conformance: "M" }),
                        Field({ name: "ProfileIntervalPeriod", type: "enum8", conformance: "M" }),
                        Field({ name: "NumberOfIntervalsDelivered", type: "uint8", conformance: "M" }),
                        Field({ name: "AttributeId", type: "uint16", conformance: "M" }),
                        Field({
                            name: "Intervals",
                            type: "list",
                            conformance: "M",
                            children: [Field({ name: "entry", type: "uint8" })],
                        }),
                    ],
                }),

                Command({ name: "GetProfileInfoCommand", id: 0x0, conformance: "O", direction: "request" }),

                Command({
                    name: "GetMeasurementProfileCommand",
                    id: 0x1,
                    conformance: "O",
                    direction: "request",
                    children: [
                        Field({ name: "AttributeId", type: "uint16", conformance: "M" }),
                        Field({ name: "StartTime", type: "uint32", conformance: "M" }),
                        Field({ name: "NumberOfIntervals", type: "enum8", conformance: "M" }),
                    ],
                }),
            ],
        }),

        Cluster({
            name: "BinaryInputBasic",
            id: 0xf,
            description: "Binary Input (Basic)",
            details:
                "An interface for reading the value of a binary measurement and accessing various characteristics of " +
                "that measurement.",

            children: [
                Attribute({
                    name: "ActiveText",
                    id: 0x4,
                    type: "string",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 16",
                    default: "",
                }),
                Attribute({
                    name: "Description",
                    id: 0x1c,
                    type: "string",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 16",
                    default: "",
                }),
                Attribute({
                    name: "InactiveText",
                    id: 0x2e,
                    type: "string",
                    access: "RW",
                    conformance: "O",
                    constraint: "max 16",
                    default: "",
                }),
                Attribute({
                    name: "OutOfService",
                    id: 0x51,
                    type: "bool",
                    access: "RW",
                    conformance: "M",
                    default: true,
                }),
                Attribute({ name: "Polarity", id: 0x54, type: "enum8", conformance: "O", default: 0 }),
                Attribute({
                    name: "PresentValue",
                    id: 0x55,
                    type: "bool",
                    access: "RW",
                    conformance: "M",
                    quality: "P",
                }),
                Attribute({ name: "Reliability", id: 0x67, type: "enum8", access: "RW", conformance: "O", default: 0 }),
                Attribute({ name: "StatusFlags", id: 0x6f, type: "map8", conformance: "M", default: 0, quality: "P" }),
                Attribute({ name: "ApplicationType", id: 0x100, type: "uint32", conformance: "O" }),
            ],
        }),

        Cluster({
            name: "OnOffSwitchConfiguration",
            id: 0x7,
            description: "On/off Switch Configuration",
            details: "Attributes and commands for configuring On/Off switching devices.",

            children: [
                Attribute({
                    name: "SwitchType",
                    id: 0x0,
                    type: "enum8",
                    conformance: "M",
                    children: [
                        Field({ name: "Toggle", id: 0x0, conformance: "M" }),
                        Field({ name: "Momentary", id: 0x1, conformance: "M" }),
                        Field({ name: "MultiFunction", id: 0x2, conformance: "M" }),
                    ],
                }),

                Attribute({
                    name: "SwitchActions",
                    id: 0x10,
                    type: "enum8",
                    access: "RW",
                    conformance: "M",
                    default: 0,
                    children: [
                        Field({ name: "On", id: 0x0, conformance: "M" }),
                        Field({ name: "Off", id: 0x1, conformance: "M" }),
                        Field({ name: "Toggle", id: 0x2, conformance: "M" }),
                    ],
                }),
            ],
        }),
    ],
});
