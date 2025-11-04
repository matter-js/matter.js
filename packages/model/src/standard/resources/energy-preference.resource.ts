/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "EnergyPreference", pics: "EPREF", xref: "cluster§9.7",
    details: "This cluster provides an interface to specify preferences for how devices should consume energy." +
        "\n" +
        "NOTE Support for Energy Preference cluster is provisional.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§9.7.4",

            children: [
                {
                    tag: "field", name: "BALA", xref: "cluster§9.7.4.1",
                    details: "This feature allows a user to select from a list of energy balances with associated descriptions of " +
                        "which strategies a device will use to target the specified balance."
                },

                {
                    tag: "field", name: "LPMS", xref: "cluster§9.7.4.2",
                    details: "This feature allows the user to select a condition or set of conditions which will cause the device " +
                        "to switch to a mode using less power. For example, a device might provide a scale of durations that " +
                        "must elapse without user interaction before it goes to sleep."
                }
            ]
        },

        {
            tag: "attribute", name: "EnergyBalances", xref: "cluster§9.7.6.1",

            details: "Indicates a list of BalanceStructs, each representing a step along a linear scale of relative " +
                "priorities. A Step field with a value of zero shall indicate that the device SHOULD entirely favor " +
                "the priority specified by the first element in EnergyPriorities; whereas a Step field with a value " +
                "of 100 shall indicate that the device SHOULD entirely favor the priority specified by the second " +
                "element in EnergyPriorities. The midpoint value of 50 shall indicate an even split between the two " +
                "priorities." +
                "\n" +
                "This shall contain at least two BalanceStructs." +
                "\n" +
                "Each BalanceStruct shall have a Step field larger than the Step field on the previous BalanceStruct " +
                "in the list." +
                "\n" +
                "The first BalanceStruct shall have a Step value of zero, and the last BalanceStruct shall have a " +
                "Step value of 100."
        },

        {
            tag: "attribute", name: "CurrentEnergyBalance", xref: "cluster§9.7.6.2",

            details: "Indicates the current preference of the user for balancing different priorities during device use. " +
                "The value of this attribute is the index, 0-based, into the EnergyBalances attribute for the " +
                "currently selected balance." +
                "\n" +
                "If an attempt is made to set this attribute to an index outside the maximum index for " +
                "EnergyBalances, a response with the status code CONSTRAINT_ERROR shall be returned." +
                "\n" +
                "If the value of EnergyBalances changes after an update, the device shall migrate the value of the " +
                "CurrentEnergyBalance attribute to the index which the manufacturer specifies most closely matches " +
                "the previous value, while preserving extreme preferences as follows:" +
                "\n" +
                "  1. If the previous value of CurrentEnergyBalance was zero, indicating a total preference for the " +
                "     priority specified by the first element in EnergyPriorities, the new value of " +
                "     CurrentEnergyBalance shall also be zero." +
                "\n" +
                "  2. If the previous value of CurrentEnergyBalance was the index of the last BalanceStruct in the " +
                "     previous value of EnergyBalances, indicating a total preference for the priority specified by " +
                "     the last element in EnergyPriorities, the new value of CurrentEnergyBalance shall be the index " +
                "     of the last element in the updated value of EnergyBalances."
        },

        {
            tag: "attribute", name: "EnergyPriorities", xref: "cluster§9.7.6.3",

            details: "Indicates two extremes for interpreting the values in the EnergyBalances attribute. These two " +
                "priorities shall be in opposition to each other; e.g. Comfort vs. Efficiency or Speed vs. " +
                "WaterConsumption." +
                "\n" +
                "If the value of EnergyPriorities changes after an update to represent a new balance between " +
                "priorities, the value of the CurrentEnergyBalance attribute shall be set to its default."
        },

        {
            tag: "attribute", name: "LowPowerModeSensitivities", xref: "cluster§9.7.6.4",
            details: "Indicates a list of BalanceStructs, each representing a condition or set of conditions for the " +
                "device to enter a low power mode. This shall contain at least two BalanceStructs." +
                "\n" +
                "Each BalanceStruct shall have a Step field larger than the Step field on the previous BalanceStruct " +
                "in the list."
        },

        {
            tag: "attribute", name: "CurrentLowPowerModeSensitivity", xref: "cluster§9.7.6.5",

            details: "Indicates the current preference of the user for determining when the device should enter a low " +
                "power mode. The value of this attribute is the index, 0-based, into the LowPowerModeSensitivities " +
                "attribute for the currently selected preference." +
                "\n" +
                "If an attempt is made to set this attribute to an index outside the maximum index for " +
                "LowPowerModeSensitivities, a response with the status code CONSTRAINT_ERROR shall be returned." +
                "\n" +
                "If the value of LowPowerModeSensitivities changes after an update, the device shall migrate the " +
                "value of the LowPowerModeSensitivity attribute to the index which the manufacturer specifies most " +
                "closely matches the previous value."
        },

        {
            tag: "datatype", name: "EnergyPriorityEnum", xref: "cluster§9.7.5.1",

            children: [
                {
                    tag: "field", name: "Comfort", description: "User comfort", xref: "cluster§9.7.5.1.1",
                    details: "This value shall emphasize user comfort; e.g. local temperature for a thermostat."
                },
                {
                    tag: "field", name: "Speed", description: "Speed of operation", xref: "cluster§9.7.5.1.2",
                    details: "This value shall emphasize how quickly a device accomplishes its targeted use; e.g. how quickly a " +
                        "robot vacuum completes a cleaning cycle."
                },
                {
                    tag: "field", name: "Efficiency", description: "Amount of Energy consumed by the device",
                    xref: "cluster§9.7.5.1.3",
                    details: "This value shall emphasize how much energy a device uses; e.g. electricity usage for a Pump."
                },
                { tag: "field", name: "WaterConsumption", description: "Amount of water consumed by the device" }
            ]
        },

        {
            tag: "datatype", name: "BalanceStruct", xref: "cluster§9.7.5.2",
            details: "This represents a step along a scale of preferences.",

            children: [
                {
                    tag: "field", name: "Step", xref: "cluster§9.7.5.2.1",
                    details: "This field shall indicate the relative value of this step."
                },
                {
                    tag: "field", name: "Label", xref: "cluster§9.7.5.2.2",
                    details: "This field shall indicate an optional string explaining which actions a device might take at the " +
                        "given step value."
                }
            ]
        }
    ]
});
