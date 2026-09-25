/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "LaundryDryer", xref: "device§13.6",

    details: "A Laundry Dryer represents a device that is capable of drying laundry items." +
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
        "The actions carried out by a Laundry Dryer device on receipt of specific commands are shown below. " +
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
        "responding to a new subscription request or a read request. Note that some of these attributes may " +
        "be missing for the clusters not implemented on the endpoint due to optionality.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.6.4" },

        {
            tag: "requirement", name: "LaundryWasherMode", xref: "device§13.6.4",
            children: [
                { tag: "requirement", name: "ONOFF", xref: "device§13.6.6" },
                { tag: "requirement", name: "StartUpMode", xref: "device§13.6.6" }
            ]
        },

        {
            tag: "requirement", name: "OnOff", xref: "device§13.6.4",
            children: [{ tag: "requirement", name: "DEADFRONTBEHAVIOR", xref: "device§13.6.6" }]
        },
        { tag: "requirement", name: "LaundryDryerControls", xref: "device§13.6.4" },
        { tag: "requirement", name: "TemperatureControl", xref: "device§13.6.4" },
        {
            tag: "requirement", name: "OperationalState", xref: "device§13.6.4",
            children: [{ tag: "requirement", name: "OperationCompletion", xref: "device§13.6.6" }]
        }
    ]
});
