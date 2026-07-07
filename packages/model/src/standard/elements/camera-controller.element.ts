/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const CameraControllerDt = DeviceType(
    { name: "CameraController", id: 0x147, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 327, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "PowerSource", id: 0x2f, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "OccupancySensing", id: 0x406, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "ZoneManagement", id: 0x550, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "CameraAvStreamManagement", id: 0x551, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "CameraAvSettingsUserLevelManagement", id: 0x552, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "WebRtcTransportProvider", id: 0x553, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "WebRtcTransportRequestor", id: 0x554, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "PushAvStreamTransport", id: 0x555, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "TlsCertificateManagement", id: 0x801, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "TlsClientManagement", id: 0x802, conformance: "O", element: "clientCluster" })
);

MatterDefinition.children.push(CameraControllerDt);
