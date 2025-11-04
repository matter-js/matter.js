/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const CookSurfaceDt = DeviceType(
    { name: "CookSurface", id: 0x77, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 119, revision: 2 } ], element: "attribute" })
    ),
    Requirement(
        { name: "TemperatureControl", id: 0x56, conformance: "O.a+", element: "serverCluster" },
        Requirement({ name: "TEMPERATURELEVEL", conformance: "M", element: "feature" }),
        Requirement({ name: "TEMPERATURENUMBER", conformance: "X", element: "feature" })
    ),
    Requirement({ name: "TemperatureMeasurement", id: 0x402, conformance: "O.a+", element: "serverCluster" }),
    Requirement(
        { name: "OnOff", id: 0x6, conformance: "O", element: "serverCluster" },
        Requirement({ name: "OFFONLY", conformance: "M", element: "feature" })
    )
);

MatterDefinition.children.push(CookSurfaceDt);
