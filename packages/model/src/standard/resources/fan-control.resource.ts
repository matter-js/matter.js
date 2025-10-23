/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "FanControl", classification: "application", pics: "FAN", xref: "cluster§4.4",
    details: "This cluster specifies an interface to control the speed of a fan.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§4.4.4",

            children: [
                {
                    tag: "field", name: "SPD", xref: "cluster§4.4.4.1",

                    details: "Legacy Fan Control cluster revision 0-1 defined 3 speeds (low, medium and high) plus automatic speed " +
                        "control but left it up to the implementer to decide what was supported. Therefore, it is assumed " +
                        "that legacy client implementations are capable of determining, from the server, the number of speeds " +
                        "supported between 1, 2, or 3, and whether automatic speed control is supported." +
                        "\n" +
                        "The MultiSpeed feature includes attributes that support a running fan speed value from 0 to " +
                        "SpeedMax." +
                        "\n" +
                        "See Section 4.4.6.6.1, “Speed Rules” for more details."
                },

                { tag: "field", name: "AUT", details: "Automatic mode supported for fan speed" },
                { tag: "field", name: "RCK", details: "Rocking movement supported" },
                { tag: "field", name: "WND", details: "Wind emulation supported" },
                { tag: "field", name: "STEP", details: "Step command supported" },
                { tag: "field", name: "DIR", details: "Airflow Direction attribute is supported" }
            ]
        },

        {
            tag: "attribute", name: "FanMode", xref: "cluster§4.4.6.1",

            details: "Indicates the current speed mode of the fan." +
                "\n" +
                "This attribute shall be set to one of the values in FanModeEnum supported by the server as indicated " +
                "in the FanModeSequence attribute. The Low value shall be supported if and only if the " +
                "FanModeSequence attribute value is less than 4. The Medium value shall be supported if and only if " +
                "the FanModeSequence attribute value is 0 or 2." +
                "\n" +
                "This attribute may be written by a client to request a different fan mode. The server shall return " +
                "INVALID_IN_STATE to indicate that the fan is not in a state where this attribute can be changed to " +
                "the requested value." +
                "\n" +
                "The server may have values that this attribute can never be set to or that will be ignored by the " +
                "server. For example, where this cluster appears on the same or another endpoint as other clusters " +
                "with a system dependency, for example the Thermostat cluster, attempting to set this attribute to " +
                "Off may not be allowed by the system." +
                "\n" +
                "If an attempt is made to set this attribute to a value not supported by the server as indicated in " +
                "the FanModeSequence attribute, the server shall respond with CONSTRAINT_ERROR." +
                "\n" +
                "When this attribute is successfully written to, the PercentSetting and SpeedSetting (if present) " +
                "attributes shall be set to appropriate values, as defined by Section 4.4.6.3.1, “Percent Rules” and " +
                "Section 4.4.6.6.1, “Speed Rules” respectively, unless otherwise specified below." +
                "\n" +
                "When this attribute is set to any valid value, the PercentCurrent and SpeedCurrent (if present) " +
                "attributes shall indicate the actual currently operating fan speed, unless otherwise specified " +
                "below."
        },

        {
            tag: "attribute", name: "FanModeSequence", xref: "cluster§4.4.6.2",
            details: "This attribute indicates the fan speed ranges that shall be supported by the server."
        },

        {
            tag: "attribute", name: "PercentSetting", xref: "cluster§4.4.6.3",

            details: "Indicates the speed setting for the fan with a value of 0 indicating that the fan is off and a value " +
                "of 100 indicating that the fan is set to run at its maximum speed. If the FanMode attribute is set " +
                "to Auto, the value of this attribute shall be set to null." +
                "\n" +
                "This attribute may be written to by a client to indicate a new fan speed. If a client writes null to " +
                "this attribute, the attribute value shall NOT change. If the fan is in a state where this attribute " +
                "cannot be changed to the requested value, the server shall return INVALID_IN_STATE." +
                "\n" +
                "When this attribute is successfully written, the server shall set the value of the FanMode and " +
                "SpeedSetting (if present) attributes to values that abide by the mapping requirements listed below."
        },

        {
            tag: "attribute", name: "PercentCurrent", xref: "cluster§4.4.6.4",

            details: "Indicates the actual currently operating fan speed, or zero to indicate that the fan is off. There " +
                "may be a temporary mismatch between the value of this attribute and the value of the PercentSetting " +
                "attribute due to other system requirements or constraints that would not allow the fan to operate at " +
                "the requested setting." +
                "\n" +
                "For example, if the value of this attribute is currently 50%, and the PercentSetting attribute is " +
                "newly set to 25%, the value of this attribute may stay above 25% for a period necessary to dissipate " +
                "internal heat, maintain product operational safety, etc." +
                "\n" +
                "When the value of the FanMode attribute is AUTO, the value of this attribute may vary across the " +
                "range over time." +
                "\n" +
                "See Section 4.4.6.3.1, “Percent Rules” for more details."
        },

        {
            tag: "attribute", name: "SpeedMax", xref: "cluster§4.4.6.5",
            details: "Indicates the maximum value to which the SpeedSetting attribute can be set."
        },

        {
            tag: "attribute", name: "SpeedSetting", xref: "cluster§4.4.6.6",

            details: "Indicates the speed setting for the fan. This attribute may be written by a client to indicate a new " +
                "fan speed. If the FanMode attribute is set to Auto, the value of this attribute shall be set to " +
                "null." +
                "\n" +
                "The server shall support all values between 0 and SpeedMax." +
                "\n" +
                "If a client writes null to this attribute, the attribute value shall NOT change. If the fan is in a " +
                "state where this attribute cannot be changed to the requested value, the server shall return " +
                "INVALID_IN_STATE." +
                "\n" +
                "When this attribute is successfully written to, the server shall set the value of the FanMode and " +
                "PercentSetting attributes to values that abide by the mapping requirements listed below."
        },

        {
            tag: "attribute", name: "SpeedCurrent", xref: "cluster§4.4.6.7",

            details: "Indicates the actual currently operating fan speed, or zero to indicate that the fan is off. There " +
                "may be a temporary mismatch between the value of this attribute and the value of the SpeedSetting " +
                "attribute due to other system requirements or constraints that would not allow the fan to operate at " +
                "the requested setting." +
                "\n" +
                "For example, if the value of this attribute is currently 5, and the SpeedSetting attribute is newly " +
                "set to 2, the value of this attribute may stay above 2 for a period necessary to dissipate internal " +
                "heat, maintain product operational safety, etc." +
                "\n" +
                "When the value of the FanMode attribute is AUTO, the value of this attribute may vary across the " +
                "range over time." +
                "\n" +
                "See Section 4.4.6.6.1, “Speed Rules” for more details."
        },

        {
            tag: "attribute", name: "RockSupport", xref: "cluster§4.4.6.8",
            details: "This attribute is a bitmap that indicates the rocking motions that are supported by the server. If " +
                "this attribute is supported by the server, at least one bit shall be set in this attribute."
        },

        {
            tag: "attribute", name: "RockSetting", xref: "cluster§4.4.6.9",

            details: "This attribute is a bitmap that indicates the currently active fan rocking motion setting. Each bit " +
                "shall only be set to 1, if the corresponding bit in the RockSupport attribute is set to 1, otherwise " +
                "a status code of CONSTRAINT_ERROR shall be returned." +
                "\n" +
                "If a combination of supported bits is set by a client, and the server does not support the " +
                "combination, the lowest supported single bit in the combination shall be set and active, and all " +
                "other bits shall indicate zero." +
                "\n" +
                "For example: If RockUpDown and RockRound are both set, but this combination is not possible, then " +
                "only RockUpDown becomes active."
        },

        {
            tag: "attribute", name: "WindSupport", xref: "cluster§4.4.6.10",
            details: "This attribute is a bitmap that indicates what wind modes are supported by the server. If this " +
                "attribute is supported by the server, at least one bit shall be set in this attribute."
        },

        {
            tag: "attribute", name: "WindSetting", xref: "cluster§4.4.6.11",

            details: "This attribute is a bitmap that indicates the current active fan wind feature settings. Each bit " +
                "shall only be set to 1, if the corresponding bit in the WindSupport attribute is set to 1, otherwise " +
                "a status code of CONSTRAINT_ERROR shall be returned." +
                "\n" +
                "If a combination of supported bits is set by a client, and the server does not support the " +
                "combination, the lowest supported single bit in the combination shall be set and active, and all " +
                "other bits shall indicate zero." +
                "\n" +
                "For example: If Sleep Wind and Natural Wind are set, but this combination is not possible, then only " +
                "Sleep Wind becomes active."
        },

        {
            tag: "attribute", name: "AirflowDirection", xref: "cluster§4.4.6.12",
            details: "Indicates the current airflow direction of the fan. This attribute may be written by a client to " +
                "indicate a new airflow direction for the fan. This attribute shall be set to one of the values in " +
                "the AirflowDirectionEnum table."
        },

        {
            tag: "command", name: "Step", xref: "cluster§4.4.7.1",

            details: "This command indirectly changes the speed-oriented attributes of the fan in steps rather than using " +
                "the speed-oriented attributes, FanMode, PercentSetting, or SpeedSetting, directly. This command " +
                "supports, for example, a user-operated and wall-mounted toggle switch that can be used to increase " +
                "or decrease the speed of the fan by pressing the toggle switch up or down until the desired fan " +
                "speed is reached. How this command is interpreted by the server and how it affects the values of the " +
                "speed-oriented attributes is implementation specific." +
                "\n" +
                "For example, a fan supports this command, and the value of the FanModeSequence attribute is 0. The " +
                "current value of the FanMode attribute is 2, or Medium. This command is received with the Direction " +
                "field set to Increase. As per it’s specific implementation, the server reacts to the command by " +
                "setting the value of the FanMode attribute to 3, or High, which in turn sets the PercentSetting and " +
                "SpeedSetting (if present) attributes to appropriate values, as defined by Section 4.4.6.3.1, " +
                "“Percent Rules” and Section 4.4.6.6.1, “Speed Rules” respectively." +
                "\n" +
                "This command supports these fields:",

            children: [
                {
                    tag: "field", name: "Direction", xref: "cluster§4.4.7.1.1",
                    details: "This field shall indicate whether the speed-oriented attributes increase or decrease to the next " +
                        "step value."
                },
                {
                    tag: "field", name: "Wrap", xref: "cluster§4.4.7.1.2",
                    details: "This field shall indicate if the speed-oriented attributes wrap between highest and lowest step " +
                        "value."
                },

                {
                    tag: "field", name: "LowestOff", xref: "cluster§4.4.7.1.3",
                    details: "This field shall indicate that the fan being off" +
                        "\n" +
                        "= 0) is included as a step value."
                }
            ]
        },

        {
            tag: "datatype", name: "RockBitmap", xref: "cluster§4.4.5.1",
            children: [
                { tag: "field", name: "RockLeftRight", description: "Indicate rock left to right" },
                { tag: "field", name: "RockUpDown", description: "Indicate rock up and down" },
                { tag: "field", name: "RockRound", description: "Indicate rock around" }
            ]
        },

        {
            tag: "datatype", name: "WindBitmap", xref: "cluster§4.4.5.2",

            children: [
                {
                    tag: "field", name: "SleepWind", description: "Indicate sleep wind", xref: "cluster§4.4.5.2.1",
                    details: "The fan speed, based on current settings, shall gradually slow down to a final minimum speed. For " +
                        "this process, the sequence, speeds and duration are MS."
                },
                {
                    tag: "field", name: "NaturalWind", description: "Indicate natural wind", xref: "cluster§4.4.5.2.2",
                    details: "The fan speed shall vary to emulate natural wind. For this setting, the sequence, speeds and " +
                        "duration are MS."
                }
            ]
        },

        {
            tag: "datatype", name: "StepDirectionEnum", xref: "cluster§4.4.5.3",
            children: [
                { tag: "field", name: "Increase", description: "Step moves in increasing direction" },
                { tag: "field", name: "Decrease", description: "Step moves in decreasing direction" }
            ]
        },

        {
            tag: "datatype", name: "AirflowDirectionEnum", xref: "cluster§4.4.5.4",
            children: [
                { tag: "field", name: "Forward", description: "Airflow is in the forward direction" },
                { tag: "field", name: "Reverse", description: "Airflow is in the reverse direction" }
            ]
        },

        {
            tag: "datatype", name: "FanModeEnum", xref: "cluster§4.4.5.5",

            children: [
                { tag: "field", name: "Off", description: "Fan is off" },
                { tag: "field", name: "Low", description: "Fan using low speed" },
                { tag: "field", name: "Medium", description: "Fan using medium speed" },
                { tag: "field", name: "High", description: "Fan using high speed" },
                { tag: "field", name: "Auto", description: "Fan is using auto mode" },
                { tag: "field", name: "Smart", description: "Fan is using smart mode" }
            ]
        },

        {
            tag: "datatype", name: "FanModeSequenceEnum", xref: "cluster§4.4.5.6",

            children: [
                {
                    tag: "field", name: "OffLowMedHigh",
                    description: "Fan is capable of off, low, medium and high modes"
                },
                { tag: "field", name: "OffLowHigh", description: "Fan is capable of off, low and high modes" },
                {
                    tag: "field", name: "OffLowMedHighAuto",
                    description: "Fan is capable of off, low, medium, high and auto modes"
                },
                {
                    tag: "field", name: "OffLowHighAuto",
                    description: "Fan is capable of off, low, high and auto modes"
                },
                { tag: "field", name: "OffHighAuto", description: "Fan is capable of off, high and auto modes" },
                { tag: "field", name: "OffHigh", description: "Fan is capable of off and high modes" }
            ]
        }
    ]
});
