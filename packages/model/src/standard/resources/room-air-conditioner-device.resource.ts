/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "RoomAirConditioner", xref: "device§13.3",

    details: "This defines conformance to the Room Air Conditioner device type." +
        "\n" +
        "A Room Air Conditioner is a device with the primary function of controlling the air temperature in a " +
        "single room." +
        "\n" +
        "### Room Air Conditioner Architecture" +
        "\n" +
        "A Room Air Conditioner is a device which at a minimum is capable of being turned on and off and of " +
        "controlling the temperature in the living space." +
        "\n" +
        "A Room Air Conditioner may also support additional capabilities via endpoint composition. See " +
        "Section 13.3.5, \"Device Type Requirements\" for typical device types." +
        "\n" +
        "The following diagram shows an example Room Air Conditioner consisting of a parent endpoint that is " +
        "the Room Air Conditioner device type and several child endpoints providing additional capabilities. " +
        "Note that two of the child endpoints are of the same device type, Temperature Sensor, which are " +
        "being disambiguated via the requirements of endpoint composition defined in the system model." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Room Air Conditioner may have zero or more of each device type listed in this table subject to the " +
        "conformance column of the table. All devices used in compositions shall adhere to the disambiguation " +
        "requirements of the System Model. Additional device types not listed in this table may also be " +
        "included in device compositions." +
        "\n" +
        "### Cluster Restrictions" +
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
        { tag: "requirement", name: "Identify", xref: "device§13.3.6" },
        { tag: "requirement", name: "Groups", xref: "device§13.3.6" },
        {
            tag: "requirement", name: "OnOff", xref: "device§13.3.6",
            children: [{ tag: "requirement", name: "DEADFRONTBEHAVIOR", xref: "device§13.3.8" }]
        },
        { tag: "requirement", name: "ScenesManagement", xref: "device§13.3.6" },
        { tag: "requirement", name: "HepaFilterMonitoring", xref: "device§13.3.6" },
        { tag: "requirement", name: "ActivatedCarbonFilterMonitoring", xref: "device§13.3.6" },
        { tag: "requirement", name: "Thermostat", xref: "device§13.3.6" },
        { tag: "requirement", name: "FanControl", xref: "device§13.3.6" },
        {
            tag: "requirement", name: "ThermostatUserInterfaceConfiguration", xref: "device§13.3.6",
            children: [{ tag: "requirement", name: "KeypadLockout", xref: "device§13.3.8" }]
        },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§13.3.6" },
        { tag: "requirement", name: "RelativeHumidityMeasurement", xref: "device§13.3.6" },
        { tag: "requirement", name: "TemperatureSensor", xref: "device§13.3.5" },
        { tag: "requirement", name: "HumiditySensor", xref: "device§13.3.5" }
    ]
});
