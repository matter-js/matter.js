/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "TemperatureAlarm", pics: "TEMPALM", xref: "cluster§2.17",

    details: "This cluster is a derived cluster of Alarm Base cluster and provides the alarm definition related to " +
        "temperature measurements." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> NOTE: Support for this cluster is provisional.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.17.4",

            children: [
                {
                    tag: "field", name: "OVER",
                    details: "Supports activating alarms when a temperature measurement goes over a threshold"
                },
                {
                    tag: "field", name: "UNDER",
                    details: "Supports activating alarms when a temperature measurement goes under a threshold"
                },
                { tag: "field", name: "MAJOR", details: "Supports the major threshold for alarms" },
                { tag: "field", name: "MINOR", details: "Supports the minor threshold for alarms" },
                {
                    tag: "field", name: "OCRIADJ",
                    details: "Supports the ability to adjust the over critical temperature threshold"
                },
                {
                    tag: "field", name: "OMAJADJ",
                    details: "Supports the ability to adjust the over major temperature threshold"
                },
                {
                    tag: "field", name: "OMINADJ",
                    details: "Supports the ability to adjust the over minor temperature threshold"
                },
                {
                    tag: "field", name: "UMINADJ",
                    details: "Supports the ability to adjust the under minor temperature threshold"
                },
                {
                    tag: "field", name: "UMAJADJ",
                    details: "Supports the ability to adjust the under major temperature threshold"
                },
                {
                    tag: "field", name: "UCRIADJ",
                    details: "Supports the ability to adjust the under critical temperature threshold"
                }
            ]
        },

        {
            tag: "attribute", name: "CriticalOverTemperatureThreshold", xref: "cluster§2.17.6.1",
            details: "Indicates the threshold for temperature measurement over which the CriticalOverTemperature alarm " +
                "shall be active."
        },
        {
            tag: "attribute", name: "MajorOverTemperatureThreshold", xref: "cluster§2.17.6.2",
            details: "Indicates the threshold for temperature measurement over which the MajorOverTemperature alarm shall " +
                "be active."
        },
        {
            tag: "attribute", name: "MinorOverTemperatureThreshold", xref: "cluster§2.17.6.3",
            details: "Indicates the threshold for temperature measurement over which the MinorOverTemperature alarm shall " +
                "be active."
        },
        {
            tag: "attribute", name: "MinorUnderTemperatureThreshold", xref: "cluster§2.17.6.4",
            details: "Indicates the threshold for temperature measurement under which the MinorUnderTemperature alarm " +
                "shall be active."
        },
        {
            tag: "attribute", name: "MajorUnderTemperatureThreshold", xref: "cluster§2.17.6.5",
            details: "Indicates the threshold for temperature measurement under which the MajorUnderTemperature alarm " +
                "shall be active."
        },
        {
            tag: "attribute", name: "CriticalUnderTemperatureThreshold", xref: "cluster§2.17.6.6",
            details: "Indicates the threshold for temperature measurement under which the CriticalUnderTemperature alarm " +
                "shall be active."
        },

        {
            tag: "command", name: "SetTemperatureAlarmThresholds", xref: "cluster§2.17.7.1",

            details: "This command will set the alarm thresholds for the specified values." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> NOTE: The constraints related to the field values in the table above shall have the relationship " +
                "as represented by the illustration below:" +
                "\n" +
                "!TemperatureAlarm Thresholds",

            children: [
                {
                    tag: "field", name: "CriticalOverTemperatureThreshold", xref: "cluster§2.17.7.1.1",
                    details: "This field shall specify the new value of the CriticalOverTemperatureThreshold attribute."
                },
                {
                    tag: "field", name: "MajorOverTemperatureThreshold", xref: "cluster§2.17.7.1.2",
                    details: "This field shall specify the new value of the MajorOverTemperatureThreshold attribute."
                },
                {
                    tag: "field", name: "MinorOverTemperatureThreshold", xref: "cluster§2.17.7.1.3",
                    details: "This field shall specify the new value of the MinorOverTemperatureThreshold attribute."
                },
                {
                    tag: "field", name: "MinorUnderTemperatureThreshold", xref: "cluster§2.17.7.1.4",
                    details: "This field shall specify the new value of the MinorUnderTemperatureThreshold attribute."
                },
                {
                    tag: "field", name: "MajorUnderTemperatureThreshold", xref: "cluster§2.17.7.1.5",
                    details: "This field shall specify the new value of the MajorUnderTemperatureThreshold attribute."
                },
                {
                    tag: "field", name: "CriticalUnderTemperatureThreshold", xref: "cluster§2.17.7.1.6",
                    details: "This field shall specify the new value of the CriticalUnderTemperatureThreshold attribute."
                }
            ]
        },

        {
            tag: "datatype", name: "AlarmBitmap", xref: "cluster§2.17.5.1",

            children: [
                {
                    tag: "field", name: "CriticalOverTemperatureAlarm",
                    description: "The measured temperature is above the critical threshold."
                },
                {
                    tag: "field", name: "MajorOverTemperatureAlarm",
                    description: "The measured temperature is above the major threshold."
                },
                {
                    tag: "field", name: "MinorOverTemperatureAlarm",
                    description: "The measured temperature is above the minor threshold."
                },
                {
                    tag: "field", name: "MinorUnderTemperatureAlarm",
                    description: "The measured temperature is below the minor threshold."
                },
                {
                    tag: "field", name: "MajorUnderTemperatureAlarm",
                    description: "The measured temperature is below the major threshold."
                },
                {
                    tag: "field", name: "CriticalUnderTemperatureAlarm",
                    description: "The measured temperature is below the critical threshold."
                }
            ]
        }
    ]
});
