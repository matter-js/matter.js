/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const IntercomDt = DeviceType(
    { name: "Intercom", id: 0x140, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 320, revision: 2 } ], element: "attribute" })
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
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),

    Requirement(
        { name: "CameraAvStreamManagement", id: 0x551, conformance: "M", element: "serverCluster" },
        Requirement({ name: "AUDIO", conformance: "M", element: "feature" }),
        Requirement({ name: "VIDEO", conformance: "O", element: "feature" }),
        Requirement({ name: "SNAPSHOT", conformance: "X", element: "feature" })
    ),

    Requirement({ name: "CameraAvSettingsUserLevelManagement", id: 0x552, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "WebRtcTransportProvider", id: 0x553, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "WebRtcTransportProvider", id: 0x553, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "WebRtcTransportRequestor", id: 0x554, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "WebRtcTransportRequestor", id: 0x554, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "Chime", id: 0x556, conformance: "O", element: "clientCluster" }),

    Requirement(
        { name: "GenericSwitch", id: 0xf, conformance: "M", element: "deviceType" },
        Requirement(
            { name: "Switch", id: 0x3b, element: "serverCluster" },
            Requirement({ name: "MOMENTARYSWITCH", conformance: "M", element: "feature" })
        )
    )
);

MatterDefinition.children.push(IntercomDt);
