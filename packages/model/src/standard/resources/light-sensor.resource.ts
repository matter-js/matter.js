/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "LightSensor", xref: "device§7.2",
    details: "A Light Sensor device is a measurement and sensing device that is capable of measuring and reporting " +
        "the intensity of light (illuminance) to which the sensor is being subjected.",
    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.2.4" },
        { tag: "requirement", name: "IlluminanceMeasurement", xref: "device§7.2.4" }
    ]
});
