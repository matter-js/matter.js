/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "LaundryWasher", xref: "device§13.1",

    details: "A Laundry Washer represents a device that is capable of laundering consumer items. Any laundry " +
        "washer product may utilize this device type." +
        "\n" +
        "A Laundry Washer shall be composed of at least one endpoint with the Laundry Washer device type." +
        "\n" +
        "### Cluster Restrictions" +
        "\n" +
        "#### Temperature Control Cluster (Server) Clarifications" +
        "\n" +
        "Given that different markets have different customary methods of providing temperature settings " +
        "(e.g. North America often prefers levels, whereas many other markets provide temperatures in °C), it " +
        "is recommended that when the Temperature Control cluster is present, the TemperatureLevel or " +
        "TemperatureNumber feature of that cluster is chosen to follow the most widely applied convention for " +
        "the market where the product is sold." +
        "\n" +
        "#### On/Off Cluster (Server) Clarifications" +
        "\n" +
        "As indicated in the Element Requirements section below, the DF (Dead Front) feature is required for " +
        "the On/Off cluster in this device type. See the \"DeadFrontBehavior feature\" section in the On/Off " +
        "cluster description for detailed requirements. The \"dead front\" state is linked to the OnOff " +
        "attribute in the On/Off cluster having the value False. Thus, the Off command of the On/Off cluster " +
        "shall move the device into the \"dead front\" state, the On command of the On/Off cluster shall bring " +
        "the device out of the \"dead front\" state, and the device shall adhere with the associated " +
        "requirements on subscription handling and event reporting." +
        "\n" +
        "#### Best Effort Attribute Values in \"Dead Front\" State" +
        "\n" +
        "When in \"dead front\", should the operational values of the cluster attributes not be available or " +
        "accessible, the following are the recommended best effort values for per cluster attributes when " +
        "responding to a new subscription request or a read request. Attributes not listed have no change in " +
        "their defined or expected values.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.1.4" },
        {
            tag: "requirement", name: "OnOff", xref: "device§13.1.4",
            children: [{ tag: "requirement", name: "DEADFRONTBEHAVIOR", xref: "device§13.1.6" }]
        },

        {
            tag: "requirement", name: "LaundryWasherMode", xref: "device§13.1.4",
            children: [
                { tag: "requirement", name: "ONOFF", xref: "device§13.1.6" },
                { tag: "requirement", name: "StartUpMode", xref: "device§13.1.6" }
            ]
        },

        { tag: "requirement", name: "LaundryWasherControls", xref: "device§13.1.4" },
        { tag: "requirement", name: "TemperatureControl", xref: "device§13.1.4" },
        {
            tag: "requirement", name: "OperationalState", xref: "device§13.1.4",
            children: [{ tag: "requirement", name: "OperationCompletion", xref: "device§13.1.6" }]
        }
    ]
});
