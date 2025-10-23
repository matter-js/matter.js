/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const LaundryWasherDt = DeviceType(
    { name: "LaundryWasher", id: 0x73 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 115, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "LaundryWasherMode", id: 0x51, conformance: "O", element: "serverCluster" },
        Requirement({ name: "StartUpMode", conformance: "X", element: "attribute" }),
        Requirement({ name: "ONOFF", conformance: "X", element: "feature" })
    ),
    Requirement(
        { name: "OnOff", id: 0x6, conformance: "O", element: "serverCluster" },
        Requirement({ name: "DEADFRONTBEHAVIOR", conformance: "M", element: "feature" })
    ),
    Requirement({ name: "LaundryWasherControls", id: 0x53, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "TemperatureControl", id: 0x56, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "OperationalState", id: 0x60, conformance: "M", element: "serverCluster" },
        Requirement({ name: "OperationCompletion", conformance: "M", element: "event" })
    )
);

MatterDefinition.children.push(LaundryWasherDt);
