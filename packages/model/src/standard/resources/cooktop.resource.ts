/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Cooktop", xref: "device§13.8",

    details: "A cooktop is a cooking surface that heats food either by transferring currents from an " +
        "electromagnetic field located below the glass surface directly to the magnetic induction cookware " +
        "placed above or through traditional gas or electric burners." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Cooktop shall be composed of zero or more endpoints with the Cook Surface device type as defined " +
        "by the conformance below." +
        "\n" +
        "A cooktop falls under strict regulatory control in some regions. One of these restrictions for " +
        "non-induction cooktops is that the only remote commands available are to turn off the entire device " +
        "or read out the temperature setting. This one scenario for allowed remote operation is specifically " +
        "to address the use case of a device that is left on after a user leaves the home. The individual " +
        "cooking surfaces cannot be shut off. This leads to a model of a cooktop that has 0 controllable " +
        "cooking surfaces. For example, the requirements that exist for a gas cooktop would result in zero " +
        "Cook Surface instances being exposed." +
        "\n" +
        "If the Cooktop contains more than one instance of a Cook Surface, those instances shall include a " +
        "semantic tag in the TagList attribute of the Descriptor cluster to disambiguate the cook surface, " +
        "e.g., \"front\", \"left\", or \"back\". Such a semantic tag shall be from the Common namespaces." +
        "\n" +
        "### Cluster Restrictions" +
        "\n" +
        "#### On/Off Cluster (Server) Clarifications" +
        "\n" +
        "The OffOnly feature is required for the On/Off cluster in this device type due to safety " +
        "requirements.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.8.5" },
        {
            tag: "requirement", name: "OnOff", xref: "device§13.8.5",
            children: [{ tag: "requirement", name: "OFFONLY", xref: "device§13.8.7" }]
        },
        { tag: "requirement", name: "CookSurface", xref: "device§13.8.4" }
    ]
});
