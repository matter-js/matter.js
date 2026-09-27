/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    DeviceTypeElement as DeviceType,
    RequirementElement as Requirement,
    ConditionElement as Condition
} from "../../elements/index.js";

export const RootNodeDt = DeviceType(
    { name: "RootNode", id: 0x16, classification: "node", composition: "full-family" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 22, revision: 5 } ], element: "attribute" })
    ),

    Requirement(
        { name: "AccessControl", id: 0x1f, conformance: "M", element: "serverCluster", quality: "I" },
        Requirement({ name: "MANAGEDDEVICE", conformance: "[ManagedAclAllowed]", constraint: "desc", element: "feature" }),
        Requirement({ name: "AUXILIARY", conformance: "GroupcastListenerCond", element: "feature" }),
        Requirement({ name: "Extension", conformance: "AclExtensionCond", element: "attribute" })
    ),

    Requirement({ name: "BasicInformation", id: 0x28, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({
        name: "LocalizationConfiguration", id: 0x2b, conformance: "LanguageLocale",
        element: "serverCluster", quality: "I"
    }),
    Requirement(
        { name: "TimeFormatLocalization", id: 0x2c, conformance: "TimeLocale", element: "serverCluster", quality: "I" }
    ),
    Requirement({ name: "UnitLocalization", id: 0x2d, conformance: "UnitLocale", element: "serverCluster", quality: "I" }),
    Requirement(
        { name: "PowerSourceConfiguration", id: 0x2e, conformance: "O, D", element: "serverCluster", quality: "I" }
    ),
    Requirement({ name: "GeneralCommissioning", id: 0x30, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "NetworkCommissioning", id: 0x31, conformance: "!CustomNetworkConfig", element: "serverCluster" }),
    Requirement({ name: "DiagnosticLogs", id: 0x32, conformance: "O", element: "serverCluster", quality: "I" }),
    Requirement({ name: "GeneralDiagnostics", id: 0x33, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "SoftwareDiagnostics", id: 0x34, conformance: "O", element: "serverCluster", quality: "I" }),
    Requirement({ name: "ThreadNetworkDiagnostics", id: 0x35, conformance: "[Thread]", element: "serverCluster" }),
    Requirement({ name: "WiFiNetworkDiagnostics", id: 0x36, conformance: "[WiFi]", element: "serverCluster" }),
    Requirement({ name: "EthernetNetworkDiagnostics", id: 0x37, conformance: "[Ethernet]", element: "serverCluster" }),

    Requirement(
        {
            name: "TimeSynchronization", id: 0x38,
            conformance: "TimeSyncCond, TimeSyncWithClientCond, TimeSyncWithNtpcCond, TimeSyncWithTzCond, TlsClientCond, TlsCertificatesCond, O",
            element: "serverCluster", quality: "I"
        },
        Requirement({
            name: "TIMESYNCCLIENT",
            conformance: "TimeSyncWithClientCond, [TlsCertificatesCond | TlsClientCond].a+, O",
            element: "feature"
        }),
        Requirement({
            name: "NTPCLIENT", conformance: "TimeSyncWithNtpcCond, [TlsCertificatesCond | TlsClientCond].a+, O",
            element: "feature"
        }),
        Requirement({ name: "TIMEZONE", conformance: "TimeSyncWithTzCond, O", element: "feature" })
    ),

    Requirement(
        {
            name: "TimeSynchronization", id: 0x38, conformance: "TimeSyncWithClientCond, O",
            element: "clientCluster", quality: "I"
        },
        Requirement({
            name: "TIMESYNCCLIENT",
            conformance: "TimeSyncWithClientCond, [TlsCertificatesCond | TlsClientCond].a+, O",
            element: "feature"
        }),
        Requirement({
            name: "NTPCLIENT", conformance: "TimeSyncWithNtpcCond, [TlsCertificatesCond | TlsClientCond].a+, O",
            element: "feature"
        }),
        Requirement({ name: "TIMEZONE", conformance: "TimeSyncWithTzCond, O", element: "feature" })
    ),

    Requirement({ name: "AdministratorCommissioning", id: 0x3c, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "OperationalCredentials", id: 0x3e, conformance: "M", element: "serverCluster", quality: "I" }),

    Requirement(
        { name: "GroupKeyManagement", id: 0x3f, conformance: "M", element: "serverCluster", quality: "I" },
        Requirement(
            { name: "GROUPCAST", conformance: "GroupcastListenerCond | GroupcastSenderCond, O", element: "feature" }
        )
    ),

    Requirement(
        { name: "IcdManagement", id: 0x46, conformance: "Sit | Lit", element: "serverCluster", quality: "I" },
        Requirement({ name: "LONGIDLETIMESUPPORT", conformance: "Lit", element: "feature" })
    ),

    Requirement(
        {
            name: "Groupcast", id: 0x65, conformance: "GroupcastListenerCond, GroupcastSenderCond, O",
            element: "serverCluster", quality: "I"
        },
        Requirement({ name: "LISTENER", conformance: "GroupcastListenerCond, O", element: "feature" }),
        Requirement({ name: "SENDER", conformance: "GroupcastSenderCond, O", element: "feature" })
    ),

    Requirement({
        name: "TlsCertificateManagement", id: 0x801, conformance: "TlsCertificatesCond, O",
        element: "serverCluster", quality: "I"
    }),
    Requirement({ name: "TlsClientManagement", id: 0x802, conformance: "TlsClientCond, O", element: "serverCluster", quality: "I" }),
    Requirement({ name: "PowerSource", id: 0x11, conformance: "PowerSourceCond, O", element: "deviceType" }),
    Condition({ name: "CustomNetworkConfig" }),
    Condition({ name: "ManagedAclAllowed" }),
    Condition({ name: "TimeSyncCond" }),
    Condition({ name: "TimeSyncWithClientCond" }),
    Condition({ name: "TimeSyncWithNtpcCond" }),
    Condition({ name: "TimeSyncWithTzCond" }),
    Condition({ name: "TlsCertificatesCond" }),
    Condition({ name: "TlsClientCond" }),
    Condition({ name: "PowerSourceCond" }),
    Condition({ name: "AclExtensionCond" }),
    Condition({ name: "GroupcastListenerCond" }),
    Condition({ name: "GroupcastSenderCond" })
);

MatterDefinition.children.push(RootNodeDt);
