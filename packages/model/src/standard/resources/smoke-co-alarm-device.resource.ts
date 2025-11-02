/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "SmokeCoAlarm", classification: "simple", xref: "device§7.9",

    details: "A Smoke CO Alarm device is capable of sensing smoke, carbon monoxide or both. It is capable of " +
        "issuing a visual and audible alert to indicate elevated concentration of smoke or carbon monoxide." +
        "\n" +
        "Smoke CO Alarms are capable of monitoring themselves and issuing visual and audible alerts for " +
        "hardware faults, critical low battery conditions, and end of service. Optionally, some of the " +
        "audible alerts can be temporarily silenced. Smoke CO Alarms are capable of performing a self-test " +
        "which performs a diagnostic of the primary sensor and issuing a cycle of the audible and visual life " +
        "safety alarm indications." +
        "\n" +
        "Some smoke alarms may be capable of adjusting sensitivity. Smoke CO Alarm may have the ability to " +
        "detect and report humidity levels, temperature levels, and contamination levels.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.9.5" },
        { tag: "requirement", name: "Groups", xref: "device§7.9.5" },
        { tag: "requirement", name: "SmokeCoAlarm", xref: "device§7.9.5" },
        { tag: "requirement", name: "RelativeHumidityMeasurement", xref: "device§7.9.5" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§7.9.5" },
        { tag: "requirement", name: "CarbonMonoxideConcentrationMeasurement", xref: "device§7.9.5" },
        { tag: "requirement", name: "PowerSource", xref: "device§7.9.4" }
    ]
});
