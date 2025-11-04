/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ThermostatUserInterfaceConfiguration", pics: "TSUIC", xref: "cluster§4.5",
    details: "This cluster provides an interface to allow configuration of the user interface for a thermostat, or " +
        "a thermostat controller device, that supports a keypad and LCD screen.",

    children: [
        {
            tag: "attribute", name: "TemperatureDisplayMode", xref: "cluster§4.5.6.1",
            details: "Indicates the units of the temperature displayed on the thermostat screen."
        },
        {
            tag: "attribute", name: "KeypadLockout", xref: "cluster§4.5.6.2",
            details: "Indicates the level of functionality that is available to the user via the keypad."
        },

        {
            tag: "attribute", name: "ScheduleProgrammingVisibility", xref: "cluster§4.5.6.3",

            details: "This attribute is used to hide the weekly schedule programming functionality or menu on a thermostat " +
                "from a user to prevent local user programming of the weekly schedule. The schedule programming may " +
                "still be performed via a remote interface, and the thermostat may operate in schedule programming " +
                "mode." +
                "\n" +
                "This attribute is designed to prevent local tampering with or disabling of schedules that may have " +
                "been programmed by users or service providers via a more capable remote interface. The programming " +
                "schedule shall continue to run even though it is not visible to the user locally at the thermostat."
        },

        {
            tag: "datatype", name: "TemperatureDisplayModeEnum", xref: "cluster§4.5.5.1",
            children: [
                { tag: "field", name: "Celsius", description: "Temperature displayed in °C" },
                { tag: "field", name: "Fahrenheit", description: "Temperature displayed in °F" }
            ]
        },

        {
            tag: "datatype", name: "KeypadLockoutEnum", xref: "cluster§4.5.5.2",
            details: "The interpretation of the various levels is device-dependent.",

            children: [
                { tag: "field", name: "NoLockout", description: "All functionality available to the user" },
                { tag: "field", name: "Lockout1", description: "Level 1 reduced functionality" },
                { tag: "field", name: "Lockout2", description: "Level 2 reduced functionality" },
                { tag: "field", name: "Lockout3", description: "Level 3 reduced functionality" },
                { tag: "field", name: "Lockout4", description: "Level 4 reduced functionality" },
                { tag: "field", name: "Lockout5", description: "Least functionality available to the user" }
            ]
        },

        {
            tag: "datatype", name: "ScheduleProgrammingVisibilityEnum", xref: "cluster§4.5.5.3",

            children: [
                {
                    tag: "field", name: "ScheduleProgrammingPermitted",
                    description: "Local schedule programming functionality is enabled at the thermostat"
                },
                {
                    tag: "field", name: "ScheduleProgrammingDenied",
                    description: "Local schedule programming functionality is disabled at the thermostat"
                }
            ]
        }
    ]
});
