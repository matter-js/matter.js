/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const AudioDoorbellDt = DeviceType(
    { name: "AudioDoorbell", id: 0x141, type: "Doorbell", classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 321, revision: 1 } ], element: "attribute" })
    ),
    Requirement(
        { name: "TlsCertificatesCond", type: "RootNode.TlsCertificatesCond", conformance: "M", element: "condition" }
    ),
    Requirement({ name: "PowerSourceCond", type: "RootNode.PowerSourceCond", conformance: "M", element: "condition" }),
    Requirement(
        { name: "TimeSyncWithNtpcCond", type: "RootNode.TimeSyncWithNtpcCond", conformance: "O", element: "condition" }
    ),
    Requirement({ name: "TlsClientCond", type: "RootNode.TlsClientCond", conformance: "O", element: "condition" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Switch", id: 0x3b, conformance: "M", element: "serverCluster" }),

    Requirement(
        { name: "CameraAvStreamManagement", id: 0x551, conformance: "M", element: "serverCluster" },
        Requirement({ name: "AUDIO", conformance: "M", element: "feature" }),
        Requirement({ name: "SNAPSHOT", conformance: "X", element: "feature" }),
        Requirement({ name: "VIDEO", conformance: "X", element: "feature" })
    ),

    Requirement({ name: "WebRtcTransportProvider", id: 0x553, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "WebRtcTransportProvider", id: 0x553, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "WebRtcTransportRequestor", id: 0x554, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "WebRtcTransportRequestor", id: 0x554, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "PushAvStreamTransport", id: 0x555, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "Chime", id: 0x556, conformance: "M", element: "clientCluster" })
);

MatterDefinition.children.push(AudioDoorbellDt);
