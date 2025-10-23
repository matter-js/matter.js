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

export const TemperatureControlledCabinetDt = DeviceType(
    { name: "TemperatureControlledCabinet", id: 0x71 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 113, revision: 5 } ], element: "attribute" })
    ),
    Requirement(
        { name: "TemperatureControl", id: 0x56, conformance: "M", element: "serverCluster" },
        Requirement({ name: "TEMPERATURENUMBER", conformance: "M", element: "feature" }),
        Requirement({ name: "TEMPERATURELEVEL", conformance: "X", element: "feature" })
    ),
    Requirement({ name: "TemperatureMeasurement", id: 0x402, conformance: "O", element: "serverCluster" }),

    Requirement(
        {
            name: "RefrigeratorAndTemperatureControlledCabinetMode", id: 0x52, conformance: "[Cooler]",
            element: "serverCluster"
        },
        Requirement({ name: "StartUpMode", conformance: "X", element: "attribute" }),
        Requirement({ name: "ONOFF", conformance: "X", element: "feature" })
    ),

    Requirement(
        { name: "OvenMode", id: 0x49, conformance: "[Heater]", element: "serverCluster" },
        Requirement({ name: "StartUpMode", conformance: "X", element: "attribute" }),
        Requirement({ name: "ONOFF", conformance: "X", element: "feature" })
    ),

    Requirement(
        { name: "OvenCavityOperationalState", id: 0x48, conformance: "[Heater]", element: "serverCluster" },
        Requirement({ name: "Pause", conformance: "X", element: "command" }),
        Requirement({ name: "Resume", conformance: "X", element: "command" }),
        Requirement({ name: "OperationCompletion", conformance: "M", element: "event" })
    ),

    Field({ name: "conditions", type: "enum8" }, Field({ name: "Cooler" }), Field({ name: "Heater" }))
);

MatterDefinition.children.push(TemperatureControlledCabinetDt);
