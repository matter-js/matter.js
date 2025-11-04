/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    DeviceTypeElement as DeviceType,
    RequirementElement as Requirement,
    FieldElement as Field
} from "../../elements/index.js";

export const RootNodeDt = DeviceType(
    { name: "RootNode", id: 0x16, classification: "node" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 22, revision: 3 } ], element: "attribute" })
    ),
    Requirement({ name: "BasicInformation", id: 0x28, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement(
        { name: "AccessControl", id: 0x1f, conformance: "M", element: "serverCluster", quality: "I" },
        Requirement({ name: "MNGD", conformance: "[ManagedAclAllowed]", constraint: "desc", element: "feature" })
    ),
    Requirement(
        { name: "PowerSourceConfiguration", id: 0x2e, conformance: "O, D", element: "serverCluster", quality: "I" }
    ),
    Requirement({ name: "TimeSynchronization", id: 0x38, conformance: "O", element: "serverCluster", quality: "I" }),
    Requirement({ name: "GroupKeyManagement", id: 0x3f, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "GeneralCommissioning", id: 0x30, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "NetworkCommissioning", id: 0x31, conformance: "!CustomNetworkConfig", element: "serverCluster" }),
    Requirement({ name: "AdministratorCommissioning", id: 0x3c, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "OperationalCredentials", id: 0x3e, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({
        name: "LocalizationConfiguration", id: 0x2b, conformance: "LanguageLocale",
        element: "serverCluster", quality: "I"
    }),
    Requirement(
        { name: "TimeFormatLocalization", id: 0x2c, conformance: "TimeLocale", element: "serverCluster", quality: "I" }
    ),
    Requirement({ name: "UnitLocalization", id: 0x2d, conformance: "UnitLocale", element: "serverCluster", quality: "I" }),
    Requirement({ name: "GeneralDiagnostics", id: 0x33, conformance: "M", element: "serverCluster", quality: "I" }),
    Requirement({ name: "DiagnosticLogs", id: 0x32, conformance: "O", element: "serverCluster", quality: "I" }),
    Requirement({ name: "SoftwareDiagnostics", id: 0x34, conformance: "O", element: "serverCluster", quality: "I" }),
    Requirement({ name: "EthernetNetworkDiagnostics", id: 0x37, conformance: "[Ethernet]", element: "serverCluster" }),
    Requirement({ name: "WiFiNetworkDiagnostics", id: 0x36, conformance: "[WiFi]", element: "serverCluster" }),
    Requirement({ name: "ThreadNetworkDiagnostics", id: 0x35, conformance: "[Thread]", element: "serverCluster" }),
    Requirement(
        { name: "IcdManagement", id: 0x46, conformance: "SIT | LIT", element: "serverCluster", quality: "I" },
        Requirement({ name: "LONGIDLETIMESUPPORT", conformance: "LIT", element: "feature" })
    ),
    Requirement({ name: "PowerSource", id: 0x11, conformance: "O", element: "deviceType" }),
    Field(
        { name: "conditions", type: "enum8" },
        Field({ name: "CustomNetworkConfig" }),
        Field({ name: "ManagedAclAllowed" })
    )
);

MatterDefinition.children.push(RootNodeDt);
