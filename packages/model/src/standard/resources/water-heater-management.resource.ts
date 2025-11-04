/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "WaterHeaterManagement", pics: "EWATERHTR", xref: "cluster§9.5",

        details: "This cluster is used to allow clients to control the operation of a hot water heating appliance so " +
            "that it can be used with energy management." +
            "\n" +
            "Heating of hot water is one of the main energy uses in homes, and when coupled with the Energy " +
            "Management cluster, it can help consumers save cost (e.g. using power at cheaper times or from local " +
            "solar PV generation).",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§9.5.4",

                children: [
                    { tag: "field", name: "EM", details: "Allows energy management control of the tank" },
                    {
                        tag: "field", name: "TP",
                        details: "Supports monitoring the percentage of hot water in the tank"
                    }
                ]
            },

            {
                tag: "attribute", name: "HeaterTypes", xref: "cluster§9.5.7.1",
                details: "Indicates the heat sources that the water heater can call on for heating. If a bit is set then the " +
                    "water heater supports the corresponding heat source."
            },
            {
                tag: "attribute", name: "HeatDemand", xref: "cluster§9.5.7.2",
                details: "Indicates if the water heater is heating water. If a bit is set then the corresponding heat source " +
                    "is active."
            },

            {
                tag: "attribute", name: "TankVolume", xref: "cluster§9.5.7.3",
                details: "Indicates the volume of water that the hot water tank can hold (in units of Litres). This allows an " +
                    "energy management system to estimate the required heating energy needed to reach the target " +
                    "temperature."
            },

            {
                tag: "attribute", name: "EstimatedHeatRequired", xref: "cluster§9.5.7.4",

                details: "Indicates the estimated heat energy needed to raise the water temperature to the target setpoint. " +
                    "This can be computed by taking the specific heat capacity of water (4182 J/kg °C) and by knowing the " +
                    "current temperature of the water, the tank volume and target temperature." +
                    "\n" +
                    "For example, if the target temperature was 60°C, the current temperature was 20°C and the tank " +
                    "volume was 100L:" +
                    "\n" +
                    "### Mass of water = 1kg per Litre" +
                    "\n" +
                    "Total Mass = 100 x 1kg = 100kg" +
                    "\n" +
                    "Δ Temperature = (target temperature - current temperature)" +
                    "\n" +
                    "= (60°C - 20°C) = 40°C" +
                    "\n" +
                    "### Energy required to" +
                    "\n" +
                    "heat the water to 60°C = 4182 x 40 x 100 = 16,728,000 J" +
                    "\n" +
                    "Converting Joules in to Wh of heat (divide by 3600):" +
                    "\n" +
                    "If the TankPercent feature is supported, then this estimate shall also take into account the " +
                    "percentage of the water in the tank which is already hot." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> The electrical energy required to heat the water depends on the heating system used to heat the " +
                    "  water. For example, a direct electric immersion heating element can be close to 100% efficient, so " +
                    "  the electrical energy needed to heat the hot water is nearly the same as the " +
                    "  EstimatedHeatEnergyRequired. However some forms of heating, such as an air-source heat pump which " +
                    "  extracts heat from ambient air, requires much less electrical energy to heat hot water. Heat pumps " +
                    "  can be produce 3kWh of heat output for 1kWh of electrical energy input. The conversion between " +
                    "  heat energy and electrical energy is outside the scope of this cluster."
            },

            {
                tag: "attribute", name: "TankPercentage", xref: "cluster§9.5.7.5",

                details: "Indicates an approximate level of hot water stored in the tank, which might help consumers " +
                    "understand the amount of hot water remaining in the tank. The accuracy of this attribute is " +
                    "manufacturer specific." +
                    "\n" +
                    "In most hot water tanks, there is a stratification effect where the hot water layer rests above a " +
                    "cooler layer of water below. For this reason cold water is fed in at the bottom of the tank and the " +
                    "hot water is drawn from the top." +
                    "\n" +
                    "Some water tanks might use multiple temperature probes to estimate the level of the hot water layer. " +
                    "A water heater with multiple temperature probes is likely to implement an algorithm to estimate the " +
                    "hot water tank percentage by taking into account the temperature values of each probe to determine " +
                    "the height of the hot water." +
                    "\n" +
                    "However it might be possible with a single temperature probe to estimate how much hot water is left " +
                    "using a simpler algorithm:" +
                    "\n" +
                    "For example, if the target temperature was 60°C, the CurrentTemperature was 40°C from a single " +
                    "temperature probe measuring the average water temperature and the temperature of incoming cold water " +
                    "(COLD_WATER_TEMP) was assumed to be 20°C:" +
                    "\n" +
                    "TankPercentage = int(((current temperature - COLD_WATER_TEMP) / (target temperature - " +
                    "COLD_WATER_TEMP)) * 100)" +
                    "\n" +
                    "TankPercentage = min( max(TankPercentage,0), 100)" +
                    "\n" +
                    "### TankPercentage = 50%"
            },

            {
                tag: "attribute", name: "BoostState", xref: "cluster§9.5.7.6",
                details: "Indicates whether the Boost, as triggered by a Boost command, is currently Active or Inactive." +
                    "\n" +
                    "See Section 9.5.8.1, “Boost Command” and Section 9.5.8.2, “CancelBoost Command” for more details."
            },

            {
                tag: "event", name: "BoostStarted", xref: "cluster§9.5.9.1",
                details: "This event shall be generated whenever a Boost command is accepted." +
                    "\n" +
                    "The corresponding structure fields within the WaterHeaterBoostInfoStruct are copied from the Boost " +
                    "command."
            },

            {
                tag: "event", name: "BoostEnded", xref: "cluster§9.5.9.2",
                details: "This event shall be generated whenever the BoostState transitions from Active to Inactive."
            },
            {
                tag: "command", name: "Boost", xref: "cluster§9.5.8.1",
                details: "Allows a client to request that the water heater is put into a Boost state."
            },
            {
                tag: "command", name: "CancelBoost", xref: "cluster§9.5.8.2",
                details: "Allows a client to cancel an ongoing Boost operation. This command has no payload."
            },

            {
                tag: "datatype", name: "WaterHeaterHeatSourceBitmap", xref: "cluster§9.5.6.1",

                children: [
                    { tag: "field", name: "ImmersionElement1", description: "Immersion Heating Element 1" },
                    { tag: "field", name: "ImmersionElement2", description: "Immersion Heating Element 2" },
                    { tag: "field", name: "HeatPump", description: "Heat pump Heating" },
                    { tag: "field", name: "Boiler", description: "Boiler Heating (e.g. Gas or Oil)" },
                    { tag: "field", name: "Other", description: "Other Heating" }
                ]
            },

            {
                tag: "datatype", name: "BoostStateEnum", xref: "cluster§9.5.6.2",
                children: [
                    { tag: "field", name: "Inactive", description: "Boost is not currently active" },
                    { tag: "field", name: "Active", description: "Boost is currently active" }
                ]
            },

            {
                tag: "datatype", name: "WaterHeaterBoostInfoStruct", xref: "cluster§9.5.6.3",

                children: [
                    {
                        tag: "field", name: "Duration", xref: "cluster§9.5.6.3.1",
                        details: "This field shall indicate the time period, in seconds, for which the boost state is activated."
                    },

                    {
                        tag: "field", name: "OneShot", xref: "cluster§9.5.6.3.2",

                        details: "This field shall indicate whether the boost state shall be automatically canceled once the hot water " +
                            "has reached either:" +
                            "\n" +
                            "  • the set point temperature (from the thermostat cluster)" +
                            "\n" +
                            "  • the TemporarySetpoint temperature (if specified)" +
                            "\n" +
                            "  • the TargetPercentage (if specified)."
                    },

                    {
                        tag: "field", name: "EmergencyBoost", xref: "cluster§9.5.6.3.3",
                        details: "This field shall indicate that the consumer wants the water to be heated quickly. This may cause " +
                            "multiple heat sources to be activated (e.g. a heat pump and direct electric immersion heating " +
                            "element)." +
                            "\n" +
                            "The choice of which heat sources are activated is manufacturer specific."
                    },

                    {
                        tag: "field", name: "TemporarySetpoint", xref: "cluster§9.5.6.3.4",

                        details: "This field shall indicate the target temperature to which the water will be heated." +
                            "\n" +
                            "If included, it shall be used instead of the thermostat cluster set point temperature whilst the " +
                            "boost state is activated." +
                            "\n" +
                            "The value of this field shall be within the constraints of the MinHeatSetpointLimit and " +
                            "MaxHeatSetpointLimit attributes (inclusive), of the thermostat cluster."
                    },

                    {
                        tag: "field", name: "TargetPercentage", xref: "cluster§9.5.6.3.5",
                        details: "This field shall indicate the target percentage of hot water in the tank that the TankPercentage " +
                            "attribute must reach before the heating is switched off."
                    },

                    {
                        tag: "field", name: "TargetReheat", xref: "cluster§9.5.6.3.6",

                        details: "This field shall indicate the percentage to which the hot water in the tank shall be allowed to fall " +
                            "before again beginning to reheat it." +
                            "\n" +
                            "For example if the TargetPercentage was 80%, and the TargetReheat was 40%, then after initial " +
                            "heating to 80% hot water, the tank may have hot water drawn off until only 40% hot water remains. At " +
                            "this point the heater will begin to heat back up to 80% of hot water. If this field and the OneShot " +
                            "field were both omitted, heating would begin again after any water draw which reduced the " +
                            "TankPercentage below 80%." +
                            "\n" +
                            "This field shall be less than or equal to the TargetPercentage field."
                    }
                ]
            }
        ]
    }
);
