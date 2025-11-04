/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
        "oven, range, or similar device.",

    children: [
        { tag: "requirement", name: "TemperatureControl", xref: "device§13.4.4" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§13.4.4" },
        { tag: "requirement", name: "RefrigeratorAndTemperatureControlledCabinetMode", xref: "device§13.4.4" },
        { tag: "requirement", name: "OvenMode", xref: "device§13.4.4" },
        { tag: "requirement", name: "OvenCavityOperationalState", xref: "device§13.4.4" },

        {
            tag: "field", name: "conditions",

            children: [
                {
                    tag: "field", name: "Cooler", description: "The device has cooling functionality.",
                    xref: "device§13.4.3"
                },
                {
                    tag: "field", name: "Heater", description: "The device has heating functionality.",
                    xref: "device§13.4.3"
                }
            ]
        }
    ]
});
