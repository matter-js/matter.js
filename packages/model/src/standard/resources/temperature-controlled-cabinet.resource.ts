/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "TemperatureControlledCabinet", xref: "device§13.4",

    details: "A Temperature Controlled Cabinet only exists composed as part of another device type. It represents " +
        "a single cabinet that is capable of having its temperature controlled. Such a cabinet may be " +
        "chilling or freezing food, for example as part of a refrigerator, freezer, wine chiller, or other " +
        "similar device. Equally, such a cabinet may be warming or heating food, for example as part of an " +
        "oven, range, or similar device." +
        "\n" +
        "### Element Requirements" +
        "\n" +
        "Temperature Controlled cabinets only allow the Temperature Control cluster to use the " +
        "TemperatureNumber feature (i.e. actual temperature in °C). This is because using qualitative " +
        "temperature levels (e.g. Low/Medium/High) does not allow the behavior expected by the majority of " +
        "clients. Clients would be trying to \"set the temperature\" of a cabinet using that cluster, such as " +
        "an oven's cooking temperature, or a refrigerator's internal cabinet temperature setpoint.",

    children: [
        {
            tag: "requirement", name: "TemperatureControl", xref: "device§13.4.4",
            children: [
                { tag: "requirement", name: "TEMPERATURENUMBER", xref: "device§13.4.5" },
                { tag: "requirement", name: "TEMPERATURELEVEL", xref: "device§13.4.5" }
            ]
        },

        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§13.4.4" },

        {
            tag: "requirement", name: "RefrigeratorAndTemperatureControlledCabinetMode", xref: "device§13.4.4",
            children: [
                { tag: "requirement", name: "StartUpMode", xref: "device§13.4.5" },
                { tag: "requirement", name: "ONOFF", xref: "device§13.4.5" }
            ]
        },

        {
            tag: "requirement", name: "OvenMode", xref: "device§13.4.4",
            children: [
                { tag: "requirement", name: "StartUpMode", xref: "device§13.4.5" },
                { tag: "requirement", name: "ONOFF", xref: "device§13.4.5" }
            ]
        },

        {
            tag: "requirement", name: "OvenCavityOperationalState", xref: "device§13.4.4",
            children: [
                { tag: "requirement", name: "Pause", xref: "device§13.4.5" },
                { tag: "requirement", name: "Resume", xref: "device§13.4.5" },
                { tag: "requirement", name: "OperationCompletion", xref: "device§13.4.5" }
            ]
        },

        { tag: "requirement", name: "TemperatureAlarm", xref: "device§13.4.4" },
        {
            tag: "condition", name: "Cooler", description: "The device has cooling functionality.",
            xref: "device§13.4.3"
        },
        {
            tag: "condition", name: "Heater", description: "The device has heating functionality.",
            xref: "device§13.4.3"
        }
    ]
});
