/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const BatteryStorageDt = DeviceType(
    { name: "BatteryStorage", id: 0x18 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 24, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),

    Requirement(
        { name: "PowerSource", id: 0x11, conformance: "M", element: "deviceType" },

        Requirement(
            { name: "PowerSource", id: 0x2f, element: "serverCluster" },
            Requirement({ name: "Wired", conformance: "M", element: "feature" }),
            Requirement({ name: "Battery", conformance: "M", element: "feature" }),
            Requirement({ name: "BatVoltage", conformance: "M", element: "attribute" }),
            Requirement({ name: "BatPercentRemaining", conformance: "M", element: "attribute" }),
            Requirement({ name: "BatTimeRemaining", conformance: "M", element: "attribute" }),
            Requirement({ name: "ActiveBatFaults", conformance: "M", element: "attribute" }),
            Requirement({ name: "BatCapacity", conformance: "M", element: "attribute" }),
            Requirement({ name: "BatTimeToFullCharge", conformance: "M", element: "attribute" }),
            Requirement({ name: "BatChargingCurrent", conformance: "M", element: "attribute" }),
            Requirement({ name: "ActiveBatChargeFaults", conformance: "M", element: "attribute" })
        ),

        Requirement(
            { name: "Descriptor", id: 0x1d, element: "serverCluster" },
            Requirement({ name: "TagList", conformance: "M", element: "feature" })
        )
    ),

    Requirement(
        { name: "ElectricalSensor", id: 0x510, conformance: "M", element: "deviceType" },

        Requirement(
            { name: "ElectricalPowerMeasurement", id: 0x90, element: "serverCluster" },
            Requirement({ name: "AlternatingCurrent", conformance: "M", element: "feature" }),
            Requirement({ name: "Voltage", conformance: "M", element: "attribute" }),
            Requirement({ name: "ActiveCurrent", conformance: "M", element: "attribute" })
        ),

        Requirement(
            { name: "ElectricalEnergyMeasurement", id: 0x91, element: "serverCluster" },
            Requirement({ name: "ExportedEnergy", conformance: "M", element: "feature" })
        )
    ),

    Requirement(
        { name: "DeviceEnergyManagement", id: 0x50d, conformance: "M", element: "deviceType" },
        Requirement(
            { name: "DeviceEnergyManagement", id: 0x98, element: "serverCluster" },
            Requirement({ name: "PowerAdjustment", conformance: "M", element: "feature" })
        )
    ),

    Requirement(
        { name: "TemperatureSensor", id: 0x302, conformance: "O", element: "deviceType" },
        Requirement(
            { name: "Descriptor", id: 0x1d, element: "serverCluster" },
            Requirement({ name: "TagList", conformance: "M", element: "feature" })
        )
    ),

    Requirement({ name: "SolarPower", id: 0x17, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(BatteryStorageDt);
