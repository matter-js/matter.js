/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "TemperatureControl", classification: "application", pics: "TCTL",
        xref: "cluster§8.2",

        details: "This cluster provides an interface to the setpoint temperature on devices such as washers, " +
            "refrigerators, and water heaters. The setpoint temperature is the temperature to which a device " +
            "using this cluster would attempt to control to. This cluster does not provide access to the actual " +
            "or physical temperature associated with any device using this cluster. Access to the physical " +
            "temperature associated with a device using this cluster would be provided by other clusters as part " +
            "of that devices device type definition." +
            "\n" +
            "The values and constraints of the attributes communicated to clients SHOULD match the controls on " +
            "any physical interface on a device implementing this server. For example, the value of the Step " +
            "attribute SHOULD match the incremental value by which the temperature setpoint can be changed on the " +
            "physical device.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§8.2.4",

                children: [
                    {
                        tag: "field", name: "TN", xref: "cluster§8.2.4.1",
                        details: "For devices that use an actual temperature value for the temperature setpoint, such as some water " +
                            "heaters, the feature TN shall be used. Note that this cluster provides and supports temperatures in " +
                            "degrees Celsius via the temperature data type."
                    },

                    {
                        tag: "field", name: "TL", xref: "cluster§8.2.4.2",
                        details: "For devices that use vendor-specific temperature levels for the temperature setpoint, such as some " +
                            "washers, the feature TL shall be used."
                    },
                    {
                        tag: "field", name: "STEP", xref: "cluster§8.2.4.3",
                        details: "For devices that support discrete temperature setpoints that are larger than the temperature " +
                            "resolution imposed via the temperature data type, the Step feature may be used."
                    }
                ]
            },

            {
                tag: "attribute", name: "TemperatureSetpoint", xref: "cluster§8.2.5.1",
                details: "Indicates the desired Temperature Setpoint on the device."
            },
            {
                tag: "attribute", name: "MinTemperature", xref: "cluster§8.2.5.2",
                details: "Indicates the minimum temperature to which the TemperatureSetpoint attribute may be set."
            },

            {
                tag: "attribute", name: "MaxTemperature", xref: "cluster§8.2.5.3",
                details: "Indicates the maximum temperature to which the TemperatureSetpoint attribute may be set." +
                    "\n" +
                    "If the Step attribute is supported, this attribute shall be such that MaxTemperature = " +
                    "MinTemperature + (Step * n), where n is an integer and n > 0. If the Step attribute is not " +
                    "supported, this attribute shall be such that MaxTemperature > MinTemperature."
            },

            {
                tag: "attribute", name: "Step", xref: "cluster§8.2.5.4",

                details: "Indicates the discrete value by which the TemperatureSetpoint attribute can be changed via the " +
                    "SetTemperature command." +
                    "\n" +
                    "For example, if the value of MinTemperature is 25.00C (2500) and the Step value is 0.50C (50), valid " +
                    "values of the TargetTemperature field of the SetTemperature command would be 25.50C" +
                    "\n" +
                    "(2550), 26.00C (2600), 26.50C (2650), etc."
            },

            {
                tag: "attribute", name: "SelectedTemperatureLevel", xref: "cluster§8.2.5.5",
                details: "Indicates the currently selected temperature level setting of the server. This attribute shall be " +
                    "the positional index of the list item in the SupportedTemperatureLevels list that represents the " +
                    "currently selected temperature level setting of the server."
            },

            {
                tag: "attribute", name: "SupportedTemperatureLevels", xref: "cluster§8.2.5.6",

                details: "Indicates the list of supported temperature level settings that may be selected via the " +
                    "TargetTemperatureLevel field in the SetTemperature command. Each string is readable text that " +
                    "describes each temperature level setting in a way that can be easily understood by humans. For " +
                    "example, a washing machine can have temperature levels like \"Cold\", \"Warm\", and \"Hot\". Each string " +
                    "is specified by the manufacturer." +
                    "\n" +
                    "Each item in this list shall represent a unique temperature level. Each entry in this list shall " +
                    "have a unique value. The entries in this list shall appear in order of increasing temperature level " +
                    "with list item 0 being the setting with the lowest temperature level."
            },

            {
                tag: "command", name: "SetTemperature", xref: "cluster§8.2.6.1",
                details: "This command is used to set the temperature setpoint.",

                children: [
                    {
                        tag: "field", name: "TargetTemperature", xref: "cluster§8.2.6.1.1",
                        details: "This field shall specify the desired temperature setpoint that the server is to be set to." +
                            "\n" +
                            "The TargetTemperature shall be from MinTemperature to MaxTemperature inclusive. If the Step " +
                            "attribute is supported, TargetTemperature shall be such that (TargetTemperature - MinTemperature) % " +
                            "Step == 0."
                    },

                    {
                        tag: "field", name: "TargetTemperatureLevel", xref: "cluster§8.2.6.1.2",
                        details: "This field shall specify the index of the list item in the SupportedTemperatureLevels list that " +
                            "represents the desired temperature level setting of the server. The value of this field shall be " +
                            "between 0 and the length of the SupportedTemperatureLevels list -1."
                    }
                ]
            }
        ]
    }
);
