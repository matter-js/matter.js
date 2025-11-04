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

export const ContentAppDt = DeviceType(
    { name: "ContentApp", id: 0x24, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 36, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "Binding", id: 0x1e, conformance: "ObserverClient", element: "serverCluster" }),
    Requirement({ name: "Channel", id: 0x504, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "TargetNavigator", id: 0x505, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "MediaPlayback", id: 0x506, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "KeypadInput", id: 0x509, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ContentLauncher", id: 0x50a, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "ApplicationLauncher", id: 0x50c, conformance: "M", element: "serverCluster" },
        Requirement({ name: "APPLICATIONPLATFORM", conformance: "X", element: "feature" })
    ),
    Requirement({ name: "ApplicationBasic", id: 0x50d, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "AccountLogin", id: 0x50e, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "ContentAppObserver", id: 0x510, conformance: "ObserverClient", element: "clientCluster" }),
    Field({ name: "conditions", type: "enum8" }, Field({ name: "ObserverClient" }))
);

MatterDefinition.children.push(ContentAppDt);
