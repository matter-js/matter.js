/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "MicrowaveOvenControl", pics: "MWOCTRL", xref: "cluster§8.13",
    details: "This cluster defines the requirements for the Microwave Oven Control cluster." +
        "\n" +
        "This cluster has dependencies with the Operational State and Microwave Oven Mode clusters. The " +
        "Operational State cluster and the Microwave Oven Mode clusters, or derivatives of those clusters " +
        "shall appear on the same endpoint as this cluster.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§8.13.4",

            children: [
                { tag: "field", name: "PWRNUM", details: "Power is specified as a unitless number or a percentage" },
                { tag: "field", name: "WATTS", details: "Power is specified in Watts" },
                {
                    tag: "field", name: "PWRLMTS",
                    details: "Supports the limit attributes used with the PWRNUM feature"
                }
            ]
        },

        {
            tag: "attribute", name: "CookTime", xref: "cluster§8.13.5.1",
            details: "Indicates the total cook time associated with the operation of the device." +
                "\n" +
                "This attribute shall remain unchanged during the operation of the oven unless the value is changed " +
                "via a command or out-of-band action."
        },

        {
            tag: "attribute", name: "MaxCookTime", xref: "cluster§8.13.5.2",
            details: "Indicates the maximum value to which the CookTime attribute can be set."
        },

        {
            tag: "attribute", name: "PowerSetting", xref: "cluster§8.13.5.3",

            details: "Indicates the power level associated with the operation of the device. If the MinPower, MaxPower, " +
                "and PowerStep attributes are not supported:" +
                "\n" +
                "  • The minimum value of this attribute shall be 10," +
                "\n" +
                "  • The maximum value of this attribute shall be 100," +
                "\n" +
                "  • The value shall be in even multiples of 10," +
                "\n" +
                "  • The default value shall be 100." +
                "\n" +
                "If the MinPower, MaxPower, and PowerStep attributes are supported:" +
                "\n" +
                "  • The value of this attribute shall be between MinPower and MaxPower inclusive." +
                "\n" +
                "  • The value of this attribute shall be such that (PowerSetting - MinPower) % PowerStep == 0"
        },

        {
            tag: "attribute", name: "MinPower", xref: "cluster§8.13.5.4",
            details: "Indicates the minimum value to which the PowerSetting attribute that can be set on the server."
        },
        {
            tag: "attribute", name: "MaxPower", xref: "cluster§8.13.5.5",
            details: "Indicates the maximum value to which the PowerSetting attribute that can be set on the server."
        },

        {
            tag: "attribute", name: "PowerStep", xref: "cluster§8.13.5.6",

            details: "Indicates the increment of power that can be set on the server. The value of this attribute shall be " +
                "between 1 and MaxPower inclusive." +
                "\n" +
                "The value of this attribute shall be such that (MaxPower - MinPower) % PowerStep == 0" +
                "\n" +
                "For example, if MinPower is 1, MaxPower is 10, and PowerSetting can be set to any integer between " +
                "MinPower and MaxPower, PowerStep would be set to 1."
        },

        {
            tag: "attribute", name: "SupportedWatts", xref: "cluster§8.13.5.7",
            details: "Indicates the list of power levels (in W) supported by the server."
        },

        {
            tag: "attribute", name: "SelectedWattIndex", xref: "cluster§8.13.5.8",
            details: "Indicates the index into the list of SupportedWatts of the currently selected power setting." +
                "\n" +
                "The index shall be a valid index into the SupportedWatts list."
        },

        {
            tag: "attribute", name: "WattRating", xref: "cluster§8.13.5.9",
            details: "Indicates the rating, in Watts, of the microwave power of the oven." +
                "\n" +
                "Supporting this attribute can assist clients in suggesting cooking settings for various foods and " +
                "beverages."
        },

        {
            tag: "command", name: "SetCookingParameters", xref: "cluster§8.13.6.2",
            details: "This command is used to set the cooking parameters associated with the operation of the device. This " +
                "command supports the following fields:",

            children: [
                {
                    tag: "field", name: "CookMode", xref: "cluster§8.13.6.2.1",

                    details: "This field shall indicate the value to which the CurrentMode attribute of the Microwave Oven Mode " +
                        "cluster should be set. The value of this field shall be one from the list of SupportedModes from the " +
                        "Microwave Oven Mode cluster." +
                        "\n" +
                        "If this field is missing, the CurrentMode attribute shall be set to a mode having the Normal mode " +
                        "tag."
                },

                {
                    tag: "field", name: "CookTime", xref: "cluster§8.13.6.2.2",
                    details: "This field shall indicate the CookTime associated with the operation of the device. The value of " +
                        "this field shall be subject to the constraints of the CookTime attribute of this cluster." +
                        "\n" +
                        "If this field is missing, the CookTime attribute shall be set to 30 seconds by the server."
                },

                {
                    tag: "field", name: "PowerSetting", xref: "cluster§8.13.6.2.3",

                    details: "This field shall indicate the PowerSetting associated with the operation of the device. The value of " +
                        "this field shall be subject to the constraints of the PowerSetting attribute of this cluster. If the " +
                        "PowerSetting field does not conform to the constraints of the PowerSetting attribute, the server " +
                        "shall return a CONSTRAINT_ERROR status." +
                        "\n" +
                        "If this field is missing, the PowerSetting attribute shall be set to 100 if MaxPower is not " +
                        "supported by the server, otherwise it shall be set to MaxPower if the MaxPower attribute is " +
                        "supported by the server."
                },

                {
                    tag: "field", name: "WattSettingIndex", xref: "cluster§8.13.6.2.4",

                    details: "This field shall indicate the value to which the SelectedWattIndex attribute is set. If the value of " +
                        "this field is greater than or equal to the length of the SupportedWatts attribute list, the server " +
                        "shall return a CONSTRAINT_ERROR status and the value of the SelectedWattIndex attribute shall be " +
                        "unchanged." +
                        "\n" +
                        "If this field is missing, the SelectedWattIndex attribute shall be set by the server to the index " +
                        "associated with the highest Watt setting for the selected CookMode."
                },

                {
                    tag: "field", name: "StartAfterSetting", xref: "cluster§8.13.6.2.5",
                    details: "This field shall indicate whether or not oven operation shall be started when the command is " +
                        "received."
                }
            ]
        },

        {
            tag: "command", name: "AddMoreTime", xref: "cluster§8.13.6.3",
            details: "This command is used to add more time to the CookTime attribute of the server. This command supports " +
                "these fields:",
            children: [{
                tag: "field", name: "TimeToAdd", xref: "cluster§8.13.6.3.1",
                details: "This field shall indicate the number of seconds to be added to the CookTime attribute."
            }]
        }
    ]
});
