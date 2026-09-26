/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Fan", xref: "device§9.2",

    details: "A Fan device is typically standalone or mounted on a ceiling or wall and is used to circulate air in " +
        "a room." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A fan may expose elements of its functionality through one or more additional device types on " +
        "different endpoints. All devices used in compositions shall adhere to the disambiguation " +
        "requirements of the System Model. Other device types, not explicitly listed in the table, may also " +
        "be included in device compositions but are not considered part of the core functionality of the " +
        "device." +
        "\n" +
        "### Cluster Restrictions" +
        "\n" +
        "#### On/Off Cluster (Server) Clarifications" +
        "\n" +
        "The On/Off cluster is independent from the Fan Control Cluster's FanMode attribute, which also " +
        "includes an Off setting." +
        "\n" +
        "If the FanMode attribute of the Fan Control cluster is set to a value other than Off when the OnOff " +
        "attribute of the On/Off cluster transitions from TRUE to FALSE, it may be desirable to restore the " +
        "FanMode, SpeedSetting and PercentSetting attribute values of the Fan Control cluster when the OnOff " +
        "attribute of the On/Off cluster later transitions from FALSE to TRUE. If the FanMode is set to Off " +
        "when the device is turned off, this information is lost, as the SpeedSetting and PercentSetting will " +
        "be set to zero. Using the On/Off cluster alongside the Fan Control cluster allows the FanMode, " +
        "SpeedSetting and PercentSetting to remain unchanged when the device is turned off. In this case, the " +
        "On/Off cluster would be set to Off, and the SpeedCurrent and PercentCurrent set to zero, without " +
        "changing FanMode, SpeedSetting and PercentSetting.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§9.2.5" },
        { tag: "requirement", name: "Groups", xref: "device§9.2.5" },
        { tag: "requirement", name: "OnOff", xref: "device§9.2.5" },
        { tag: "requirement", name: "FanControl", xref: "device§9.2.5" },
        { tag: "requirement", name: "Thermostat", xref: "device§9.2.4" }
    ]
});
