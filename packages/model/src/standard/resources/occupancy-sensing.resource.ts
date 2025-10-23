/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "OccupancySensing", classification: "application", pics: "OCC",
    xref: "cluster§2.7",
    details: "The server cluster provides an interface to occupancy sensing functionality based on one or more " +
        "sensing modalities, including configuration and provision of notifications of occupancy status.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.7.4",

            children: [
                {
                    tag: "field", name: "OTHER",
                    details: "Supports sensing using a modality not listed in the other bits"
                },
                { tag: "field", name: "PIR", details: "Supports sensing using PIR (Passive InfraRed)" },
                { tag: "field", name: "US", details: "Supports sensing using UltraSound" },
                { tag: "field", name: "PHY", details: "Supports sensing using a physical contact" },
                {
                    tag: "field", name: "AIR",
                    details: "Supports sensing using Active InfraRed measurement (e.g. time-of-flight or transflective/reflective " +
                        "IR sensing)"
                },
                { tag: "field", name: "RAD", details: "Supports sensing using radar waves (microwave)" },
                {
                    tag: "field", name: "RFS",
                    details: "Supports sensing using analysis of radio signals, e.g.: RSSI, CSI and/or any other metric from the " +
                        "signal"
                },
                { tag: "field", name: "VIS", details: "Supports sensing based on analyzing images" }
            ]
        },

        {
            tag: "attribute", name: "Occupancy", xref: "cluster§2.7.6.1",
            details: "Indicates the sensed (processed) status of occupancy. For compatibility reasons this is expressed as " +
                "a bitmap where the status is indicated in bit 0: a value of 1 means occupied, and 0 means " +
                "unoccupied, with the other bits set to 0; this can be considered equivalent to a boolean."
        },

        { tag: "attribute", name: "OccupancySensorType", xref: "cluster§2.7.6" },
        { tag: "attribute", name: "OccupancySensorTypeBitmap", xref: "cluster§2.7.6" },

        {
            tag: "attribute", name: "HoldTime", xref: "cluster§2.7.6.3",

            details: "This attribute shall specify the time delay, in seconds, before the sensor changes to its unoccupied " +
                "state after the last detection of occupancy in the sensed area. This is equivalent to the legacy " +
                "*OccupiedToUnoccupiedDelay attributes." +
                "\n" +
                "Low values of HoldTime SHOULD be avoided since they could lead to many reporting messages. A value 0 " +
                "for HoldTime shall NOT be used." +
                "\n" +
                "The figure below illustrates this with an example of how this attribute is used for a PIR sensor. It " +
                "uses threshold detection to generate an \"internal detection\" signal, which needs post-processing to " +
                "become usable for transmission (traffic shaping). The bit in the Occupancy attribute will be set to " +
                "1 when the internal detection signal goes high, and will stay at 1 for HoldTime after the (last) " +
                "instance where the internal detection signal goes low." +
                "\n" +
                "The top half of the figure shows the case of a single trigger: the bit in the Occupancy attribute " +
                "will be 1 for the duration of the PIR signal exceeding the threshold plus HoldTime. The bottom half " +
                "of the figure shows the case of multiple triggers: the second trigger starts before the HoldTime of " +
                "the first trigger has expired; this results in a single period of the bit in the Occupancy attribute " +
                "being 1. The bit in the Occupancy attribute will be set to 1 from the start of the first period " +
                "where the PIR signal exceeds the threshold until HoldTime after the last moment where the PIR " +
                "exceeded the threshold."
        },

        {
            tag: "attribute", name: "HoldTimeLimits", xref: "cluster§2.7.6.4",
            details: "Indicates the server’s limits, and default value, for the HoldTime attribute."
        },
        {
            tag: "attribute", name: "PirOccupiedToUnoccupiedDelay", xref: "cluster§2.7.6.6",
            details: "This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its " +
                "unoccupied state after the last detection of occupancy in the sensed area."
        },
        {
            tag: "attribute", name: "PirUnoccupiedToOccupiedDelay", xref: "cluster§2.7.6.7",
            details: "This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its " +
                "occupied state after the first detection of occupancy in the sensed area."
        },
        {
            tag: "attribute", name: "PirUnoccupiedToOccupiedThreshold", xref: "cluster§2.7.6.8",
            details: "This attribute shall specify the number of occupancy detection events that must occur in the period " +
                "PIRUnoccupiedToOccupiedDelay, before the PIR sensor changes to its occupied state."
        },
        {
            tag: "attribute", name: "UltrasonicOccupiedToUnoccupiedDelay", xref: "cluster§2.7.6.9",
            details: "This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its " +
                "unoccupied state after the last detection of occupancy in the sensed area."
        },
        {
            tag: "attribute", name: "UltrasonicUnoccupiedToOccupiedDelay", xref: "cluster§2.7.6.10",
            details: "This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its " +
                "occupied state after the first detection of occupancy in the sensed area."
        },
        {
            tag: "attribute", name: "UltrasonicUnoccupiedToOccupiedThreshold", xref: "cluster§2.7.6.11",
            details: "This attribute shall specify the number of occupancy detection events that must occur in the period " +
                "UltrasonicUnoccupiedToOccupiedDelay, before the Ultrasonic sensor changes to its occupied state."
        },
        {
            tag: "attribute", name: "PhysicalContactOccupiedToUnoccupiedDelay", xref: "cluster§2.7.6.12",
            details: "This attribute shall specify the time delay, in seconds, before the physical contact occupancy " +
                "sensor changes to its unoccupied state after detecting the unoccupied event."
        },
        {
            tag: "attribute", name: "PhysicalContactUnoccupiedToOccupiedDelay", xref: "cluster§2.7.6.13",
            details: "This attribute shall specify the time delay, in seconds, before the physical contact sensor changes " +
                "to its occupied state after the first detection of the occupied event."
        },

        {
            tag: "attribute", name: "PhysicalContactUnoccupiedToOccupiedThreshold", xref: "cluster§2.7.6.14",
            details: "This attribute shall specify the number of occupancy detection events that must occur in the period " +
                "PhysicalContactUnoccupiedToOccupiedDelay, before the PhysicalContact sensor changes to its occupied " +
                "state."
        },

        {
            tag: "event", name: "OccupancyChanged", xref: "cluster§2.7.7.1",
            details: "If this event is supported, it shall be generated when the Occupancy attribute changes.",
            children: [{
                tag: "field", name: "Occupancy", xref: "cluster§2.7.7.1.1",
                details: "This field shall indicate the new value of the Occupancy attribute."
            }]
        },

        {
            tag: "datatype", name: "OccupancyBitmap", xref: "cluster§2.7.5.1",

            children: [{
                tag: "field", name: "Occupied", description: "Indicates the sensed occupancy state",
                xref: "cluster§2.7.5.1.1",
                details: "If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall " +
                    "indicate the unoccupied state."
            }]
        },

        {
            tag: "datatype", name: "OccupancySensorTypeBitmap", xref: "cluster§2.7.5.2",
            details: "> [!NOTE]" +
                "\n" +
                "> This enum is as defined in ClusterRevision 4 and its definition shall NOT be extended; the feature " +
                "  flags provide the sensor modality (or modalities) for later cluster revisions. See Backward " +
                "  Compatibility section.",
            children: [
                { tag: "field", name: "Pir", description: "Indicates a passive infrared sensor." },
                { tag: "field", name: "Ultrasonic", description: "Indicates a ultrasonic sensor." },
                { tag: "field", name: "PhysicalContact", description: "Indicates a physical contact sensor." }
            ]
        },

        {
            tag: "datatype", name: "OccupancySensorTypeEnum", xref: "cluster§2.7.5.3",
            details: "> [!NOTE]" +
                "\n" +
                "> This enum is as defined in ClusterRevision 4 and its definition shall NOT be extended; the feature " +
                "  flags provide the sensor modality (or modalities) for later cluster revisions. See Backward " +
                "  Compatibility section.",

            children: [
                { tag: "field", name: "Pir", description: "Indicates a passive infrared sensor." },
                { tag: "field", name: "Ultrasonic", description: "Indicates a ultrasonic sensor." },
                {
                    tag: "field", name: "PirAndUltrasonic",
                    description: "Indicates a passive infrared and ultrasonic sensor."
                },
                { tag: "field", name: "PhysicalContact", description: "Indicates a physical contact sensor." }
            ]
        },

        {
            tag: "datatype", name: "HoldTimeLimitsStruct", xref: "cluster§2.7.5.4",
            details: "This structure provides information on the server’s supported values for the HoldTime attribute.",

            children: [
                {
                    tag: "field", name: "HoldTimeMin", xref: "cluster§2.7.5.4.1",
                    details: "This field shall specify the minimum value of the server’s supported value for the HoldTime " +
                        "attribute, in seconds."
                },
                {
                    tag: "field", name: "HoldTimeMax", xref: "cluster§2.7.5.4.2",
                    details: "This field shall specify the maximum value of the server’s supported value for the HoldTime " +
                        "attribute, in seconds."
                },

                {
                    tag: "field", name: "HoldTimeDefault", xref: "cluster§2.7.5.4.3",
                    details: "This field shall specify the (manufacturer-determined) default value of the server’s HoldTime " +
                        "attribute, in seconds. This is the value that a client who wants to reset the settings to a valid " +
                        "default SHOULD use."
                }
            ]
        }
    ]
});
