/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "CookSurface", xref: "device§13.7",

    details: "A Cook Surface device type represents a heating object on a cooktop or other similar device. It " +
        "shall only be used when composed as part of another device type." +
        "\n" +
        "### Cluster Restrictions" +
        "\n" +
        "#### On/Off Cluster (Server) Clarifications" +
        "\n" +
        "The OffOnly feature is required for the On/Off cluster in this device type due to safety " +
        "requirements." +
        "\n" +
        "### Element Requirements" +
        "\n" +
        "Whenever the Temperature Control cluster is included on a Cook Surface, the Temperature Control " +
        "cluster shall use the TemperatureLevel feature rather than the TemperatureNumber feature. This is " +
        "because users are usually in the loop for controlling the temperature of the food being cooked " +
        "within a heated cooking utensil. For example, while the surface temperature of a cooktop may be " +
        "significantly above 100°C, an open pot of water will never exceed the boiling point of water as all " +
        "excess energy transmitted is spent on the water's phase change to steam and the liquid within the " +
        "pot reaches an equilibrium temperature.",

    children: [
        {
            tag: "requirement", name: "OnOff", xref: "device§13.7.4",
            children: [{ tag: "requirement", name: "OFFONLY", xref: "device§13.7.6" }]
        },

        {
            tag: "requirement", name: "TemperatureControl", xref: "device§13.7.4",
            children: [
                { tag: "requirement", name: "TEMPERATURELEVEL", xref: "device§13.7.6" },
                { tag: "requirement", name: "TEMPERATURENUMBER", xref: "device§13.7.6" }
            ]
        },

        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§13.7.4" }
    ]
});
