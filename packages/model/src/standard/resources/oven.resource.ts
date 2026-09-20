/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Oven", xref: "device§13.9",

    details: "An oven represents a device that contains one or more cabinets, and optionally a single cooktop, " +
        "that are all capable of heating food. Examples of consumer products implementing this device type " +
        "include ovens, wall ovens, convection ovens, etc." +
        "\n" +
        "### Oven Architecture" +
        "\n" +
        "An oven is always defined via endpoint composition. See Section 13.9.6, \"Device Type Requirements\" " +
        "for more details." +
        "\n" +
        "An example of an oven with two cabinets (one above the other) and a cooktop (with two cook surfaces) " +
        "is illustrated below." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "An Oven shall be composed of at least one endpoint with Temperature Controlled Cabinet device type. " +
        "There may be more endpoints with other device types existing in the Oven. Note that any instance of " +
        "the TemperatureControl cluster on an endpoint is scoped to the device type on that endpoint, and not " +
        "the whole node." +
        "\n" +
        "If the Oven contains more than one instance of a Temperature Controlled Cabinet, those instances " +
        "shall include a semantic tag in the TagList attribute of the Descriptor cluster to disambiguate the " +
        "cabinet, e.g., \"Top\" or \"Bottom\". Such a semantic tag shall be from the defined Common Position " +
        "namespaces." +
        "\n" +
        "Regional restrictions and safety regulations may dictate which aspects of a Temperature Controlled " +
        "Cabinet may be remotely accessible. In such cases, clusters exposed by an instance of a Temperature " +
        "Controlled Cabinet may have limitations on what commands are supported or what attributes are " +
        "mutable.",

    children: [
        { tag: "requirement", name: "Heater", xref: "device§13.9.5" },
        { tag: "requirement", name: "Identify", xref: "device§13.9.7" },
        { tag: "requirement", name: "TemperatureControlledCabinet", xref: "device§13.9.6" },
        { tag: "requirement", name: "Cooktop", xref: "device§13.9.6" }
    ]
});
