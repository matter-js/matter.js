/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "MicrowaveOven", xref: "device§13.11",

    details: "This defines conformance to the Microwave Oven device type." +
        "\n" +
        "A Microwave Oven is a device with the primary function of heating foods and beverages using a " +
        "magnetron." +
        "\n" +
        "### Microwave Oven Architecture" +
        "\n" +
        "A Microwave Oven is a device which at a minimum is capable of being started and stopped and of " +
        "setting a power level." +
        "\n" +
        "A Microwave Oven may also support additional capabilities via endpoint composition. See Section " +
        "13.11.5, \"Device Type Requirements\" for typical device types." +
        "\n" +
        "The following diagram shows an example Microwave Oven consisting of a parent endpoint that is the " +
        "Microwave Oven device type and a child endpoint providing additional capabilities." +
        "\n" +
        "A microwave oven placed above a thermal oven or cooktop/hob may also include a light for " +
        "illuminating the cooking surface of the thermal oven or cooktop/hob and an exhaust fan for removing " +
        "cooking odors." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "When a light is included as part of a composed device type, it is intended to be used as surface " +
        "light when the microwave oven is installed above a range in an \"over the range\" configuration rather " +
        "than the internal light of the microwave oven cavity." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "When the Fan Control cluster is supported on an endpoint of this device type, it is intended to be " +
        "used as a ventilation fan when the microwave oven is installed above a range in an \"over the range\" " +
        "configuration rather than the internal fan of the microwave oven cavity." +
        "\n" +
        "### Cluster Usage" +
        "\n" +
        "This section describes how to control and monitor the operation of a Microwave Oven device. This " +
        "information is meant to clarify how the data dependencies within the device type's cluster " +
        "composition are to be used." +
        "\n" +
        "Note that the device operations may also be the result of, or affected by, out-of-band actions such " +
        "as physical button presses on the device, internally scheduled events, vendor application requests, " +
        "commands invoked via other fabrics, internal device timeouts, etc. For example, a user may pause the " +
        "oven during operation by opening the door to check on the food." +
        "\n" +
        "#### Starting the Oven" +
        "\n" +
        "The oven operational attributes are set by sending the SetCookingParameters command of the Microwave " +
        "Oven Control cluster with the values as intended by the user via a client. Oven operation can be " +
        "started by sending the Start command via the Operational State cluster or one of its derivatives, if " +
        "supported, or within the SetCookingParameters command via the StartAfterSetting attribute, if " +
        "supported." +
        "\n" +
        "Upon setting the CookTime attribute via the SetCookingParameters command, the CountdownTime " +
        "attribute of the Operational State cluster or one of its derivatives , if supported, is set to the " +
        "same value as the CookTime attribute." +
        "\n" +
        "Once oven operation is started, the values previously sent by the SetCookingParameters command are " +
        "used to control the oven operation and the CountdownTime attribute of the Operational State cluster " +
        "or one of its derivatives begins counting down." +
        "\n" +
        "#### During Operation" +
        "\n" +
        "While the oven is in the Running state, the CountdownTime attribute of the Operational State cluster " +
        "or one of its derivatives counts down and the CookTime attribute of the Microwave Oven Control " +
        "cluster remains fixed." +
        "\n" +
        "#### Stopping the Oven" +
        "\n" +
        "Oven operation will end when either the Stop command of the Operational State cluster or one of its " +
        "derivatives, if supported, is sent, the CountdownTime value reaches zero, or the oven is stopped via " +
        "an out-of-band method." +
        "\n" +
        "It is recommended that when the oven enters the Stopped state of the Operational State cluster or " +
        "one of its derived clusters, the attribute values of the Microwave Oven Control cluster be set to " +
        "their default values by the server." +
        "\n" +
        "#### Adding More Time" +
        "\n" +
        "When time is added to the CookTime attribute using the AddMoreTime command of the Microwave Oven " +
        "Control cluster, the same amount of time is also added to the CountdownTime attribute of the " +
        "Operational State cluster or one of its derivatives. See the CookTime attribute constraints and " +
        "AddMoreTime command for more details.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.11.6" },

        {
            tag: "requirement", name: "OperationalState", xref: "device§13.11.6",
            children: [
                { tag: "requirement", name: "CountdownTime", xref: "device§13.11.7" },
                { tag: "requirement", name: "OperationCompletion", xref: "device§13.11.7" }
            ]
        },

        {
            tag: "requirement", name: "FanControl", xref: "device§13.11.6",
            children: [
                { tag: "requirement", name: "WIND", xref: "device§13.11.7" },
                { tag: "requirement", name: "AIRFLOWDIRECTION", xref: "device§13.11.7" }
            ]
        },

        { tag: "requirement", name: "MicrowaveOvenMode", xref: "device§13.11.6" },
        { tag: "requirement", name: "MicrowaveOvenControl", xref: "device§13.11.6" },
        { tag: "requirement", name: "OnOffLight", xref: "device§13.11.5" }
    ]
});
