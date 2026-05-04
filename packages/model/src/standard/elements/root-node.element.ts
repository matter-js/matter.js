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
    { name: "RootNode", id: 0x16, classification: "node" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 22, revision: 4 } ], element: "attribute" })
    ),
    Requirement(
        { name: "AccessControl", id: 0x1f, conformance: "M", element: "serverCluster", quality: "I" },
        Requirement({ name: "MNGD", conformance: "[ManagedAclAllowed]", constraint: "desc", element: "feature" }),
        Requirement({ name: "Extension", conformance: "ACLExtensionCond", element: "attribute" })
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
            conformance: "TimeSyncCond, TimeSyncWithClientCond, TimeSyncWithNTPCCond, TimeSyncWithTZCond, TLSClientCond, TLSCertificatesCond, O",
            element: "serverCluster", quality: "I"
        },
        Requirement({
            name: "TIMESYNCCLIENT",
            conformance: "TimeSyncWithClientCond, [TLSCertificatesCond | TLSClientCond].a+, O",
            element: "feature"
        }),
        Requirement({
            name: "NTPCLIENT", conformance: "TimeSyncWithNTPCCond, [TLSCertificatesCond | TLSClientCond].a+, O",
            element: "feature"
        }),
        Requirement({ name: "TIMEZONE", conformance: "TimeSyncWithTZCond, O", element: "feature" })
    ),

    Requirement(
        {
            name: "TimeSynchronization", id: 0x38, conformance: "TimeSyncWithClientCond, O",
            element: "clientCluster", quality: "I"
        },
        Requirement({
            name: "TIMESYNCCLIENT",
            conformance: "TimeSyncWithClientCond, [TLSCertificatesCond | TLSClientCond].a+, O",
            element: "feature"
        }),
        Requirement({
            name: "NTPCLIENT", conformance: "TimeSyncWithNTPCCond, [TLSCertificatesCond | TLSClientCond].a+, O",
            element: "feature"
        }),
        Requirement({ name: "TIMEZONE", conformance: "TimeSyncWithTZCond, O", element: "feature" })
    ),

    Requirement({ name: "AdministratorCommissioning", id: 0x3c, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "OperationalCredentials", id: 0x3e, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "GroupKeyManagement", id: 0x3f, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement(
        { name: "IcdManagement", id: 0x46, conformance: "SIT | LIT", element: "serverCluster", quality: "I" },
        Requirement({ name: "LONGIDLETIMESUPPORT", conformance: "LIT", element: "feature" })
    ),
    Requirement({
        name: "TlsCertificateManagement", id: 0x801, conformance: "TLSCertificatesCond, O",
        element: "serverCluster", quality: "I"
    }),
    Requirement({ name: "TlsClientManagement", id: 0x802, conformance: "TLSClientCond, O", element: "serverCluster", quality: "I" }),
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
    Condition({ name: "AclExtensionCond" })
);

MatterDefinition.children.push(RootNodeDt);
