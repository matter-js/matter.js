/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const CameraDt = DeviceType(
    { name: "Camera", id: 0x142, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 322, revision: 1 } ], element: "attribute" })
    ),
    Requirement(
        { name: "TlsCertificatesCond", type: "RootNode.TlsCertificatesCond", conformance: "M", element: "condition" }
    ),
    Requirement({ name: "PowerSourceCond", type: "RootNode.PowerSourceCond", conformance: "M", element: "condition" }),
    Requirement(
        { name: "TimeSyncWithNtpcCond", type: "RootNode.TimeSyncWithNtpcCond", conformance: "M", element: "condition" }
    ),
    Requirement({ name: "TimeSyncWithClientCond", type: "RootNode.TimeSyncWithClientCond", conformance: "M", element: "condition" }),
    Requirement(
        { name: "TimeSyncWithTzCond", type: "RootNode.TimeSyncWithTzCond", conformance: "M", element: "condition" }
    ),
    Requirement({ name: "TlsClientCond", type: "RootNode.TlsClientCond", conformance: "M", element: "condition" }),

    Requirement(
        { name: "CameraAvStreamManagement", id: 0x551, conformance: "M", element: "serverCluster" },
        Requirement({ name: "VIDEO", conformance: "M", element: "feature" }),
        Requirement({ name: "AUDIO", conformance: "M", element: "feature" }),
        Requirement({ name: "SNAPSHOT", conformance: "M", element: "feature" })
    ),

    Requirement({ name: "WebRtcTransportProvider", id: 0x553, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "WebRtcTransportRequestor", id: 0x554, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "WebRtcTransportProvider", id: 0x553, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "WebRtcTransportRequestor", id: 0x554, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "PushAvStreamTransport", id: 0x555, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "CameraAvSettingsUserLevelManagement", id: 0x552, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "ZoneManagement", id: 0x550, conformance: "O", element: "serverCluster" },
        Requirement({ name: "TWODIMENSIONALCARTESIANZONE", conformance: "M", element: "feature" })
    ),
    Requirement({ name: "OccupancySensing", id: 0x406, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "OccupancySensor", id: 0x107, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(CameraDt);
