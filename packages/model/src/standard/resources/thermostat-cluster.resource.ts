/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "Thermostat", pics: "TSTAT", xref: "cluster§4.3",
        details: "This cluster provides an interface to the functionality of a thermostat.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§4.3.4",

                children: [
                    { tag: "field", name: "HEAT", details: "Thermostat is capable of managing a heating device" },
                    { tag: "field", name: "COOL", details: "Thermostat is capable of managing a cooling device" },
                    { tag: "field", name: "OCC", details: "Supports Occupied and Unoccupied setpoints" },
                    {
                        tag: "field", name: "SCH",
                        details: "Supports remote configuration of a weekly schedule of setpoint transitions"
                    },
                    { tag: "field", name: "SB", details: "Supports configurable setback (or span)" },
                    { tag: "field", name: "AUTO", details: "Supports a System Mode of Auto" },

                    {
                        tag: "field", name: "LTNE", xref: "cluster§4.3.4.1",
                        details: "This feature indicates that the Calculated Local Temperature used internally is unavailable to " +
                            "report externally, for example due to the temperature control being done by a separate subsystem " +
                            "which does not offer a view into the currently measured temperature, but allows setpoints to be " +
                            "provided."
                    },

                    {
                        tag: "field", name: "MSCH", xref: "cluster§4.3.4.2",
                        details: "This feature indicates that the thermostat is capable of schedules. If this feature is supported, " +
                            "the thermostat shall support a mechanism to do time synchronization."
                    },
                    { tag: "field", name: "PRES", details: "Thermostat supports setpoint presets" }
                ]
            },

            {
                tag: "attribute", name: "LocalTemperature", xref: "cluster§4.3.9.2",

                details: "Indicates the current Calculated Local Temperature, when available." +
                    "\n" +
                    "  • If the LTNE feature is not supported:" +
                    "\n" +
                    "    ◦ If the LocalTemperatureCalibration is invalid or currently unavailable, the attribute shall " +
                    "      report null." +
                    "\n" +
                    "    ◦ If the LocalTemperatureCalibration is valid, the attribute shall report that value." +
                    "\n" +
                    "  • Otherwise, if the LTNE feature is supported, there is no feedback externally available for the " +
                    "    LocalTemperatureCalibration. In that case, the LocalTemperature attribute shall always report " +
                    "    null."
            },

            {
                tag: "attribute", name: "OutdoorTemperature", xref: "cluster§4.3.9.3",
                details: "Indicates the outdoor temperature, as measured locally or remotely (over the network)."
            },
            {
                tag: "attribute", name: "Occupancy", xref: "cluster§4.3.9.4",
                details: "Indicates whether the heated/cooled space is occupied or not, as measured locally or remotely (over " +
                    "the network)."
            },

            {
                tag: "attribute", name: "AbsMinHeatSetpointLimit", xref: "cluster§4.3.9.5",
                details: "Indicates the absolute minimum level that the heating setpoint may be set to. This is a limitation " +
                    "imposed by the manufacturer." +
                    "\n" +
                    "### Refer to Setpoint Limits for constraints"
            },

            { tag: "attribute", name: "AbsMaxHeatSetpointLimit", xref: "cluster§4.3.9" },
            { tag: "attribute", name: "AbsMinCoolSetpointLimit", xref: "cluster§4.3.9" },

            {
                tag: "attribute", name: "AbsMaxCoolSetpointLimit", xref: "cluster§4.3.9.8",
                details: "Indicates the absolute maximum level that the cooling setpoint may be set to. This is a limitation " +
                    "imposed by the manufacturer." +
                    "\n" +
                    "### Refer to Setpoint Limits for constraints"
            },

            {
                tag: "attribute", name: "PiCoolingDemand", xref: "cluster§4.3.9.9",
                details: "Indicates the level of cooling demanded by the PI (proportional integral) control loop in use by the " +
                    "thermostat (if any), in percent. This value is 0 when the thermostat is in “off” or “heating” mode." +
                    "\n" +
                    "This attribute is reported regularly and may be used to control a cooling device."
            },

            {
                tag: "attribute", name: "PiHeatingDemand", xref: "cluster§4.3.9.10",
                details: "Indicates the level of heating demanded by the PI loop in percent. This value is 0 when the " +
                    "thermostat is in “off” or “cooling” mode." +
                    "\n" +
                    "This attribute is reported regularly and may be used to control a heating device."
            },

            {
                tag: "attribute", name: "HvacSystemTypeConfiguration", xref: "cluster§4.3.9.11",
                details: "Indicates the HVAC system type controlled by the thermostat. If the thermostat uses physical DIP " +
                    "switches to set these parameters, this information shall be available read-only from the DIP " +
                    "switches. If these parameters are set via software, there shall be read/write access in order to " +
                    "provide remote programming capability."
            },

            {
                tag: "attribute", name: "LocalTemperatureCalibration", xref: "cluster§4.3.9.12",

                details: "Indicates the offset the Thermostat server shall make to the measured temperature (locally or " +
                    "remotely) to adjust the Calculated Local Temperature prior to using, displaying or reporting it." +
                    "\n" +
                    "The purpose of this attribute is to adjust the calibration of the Thermostat server per the user’s " +
                    "preferences (e.g., to match if there are multiple servers displaying different values for the same " +
                    "HVAC area) or compensate for variability amongst temperature sensors." +
                    "\n" +
                    "If a Thermostat client attempts to write LocalTemperatureCalibration attribute to an unsupported " +
                    "value (e.g., out of the range supported by the Thermostat server), the Thermostat server shall " +
                    "respond with a status of SUCCESS and set the value of LocalTemperatureCalibration to the upper or " +
                    "lower limit reached." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> Prior to revision 8 of this cluster specification the value of this attribute was constrained to a " +
                    "  range of -2.5°C to 2.5°C."
            },

            {
                tag: "attribute", name: "OccupiedCoolingSetpoint", xref: "cluster§4.3.9.13",

                details: "Indicates the cooling mode setpoint when the room is occupied. Refer to Setpoint Limits for " +
                    "constraints." +
                    "\n" +
                    "If an attempt is made to set this attribute to a value greater than MaxCoolSetpointLimit or less " +
                    "than MinCoolSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "If this attribute is set to a value that is less than (OccupiedHeatingSetpoint + " +
                    "MinSetpointDeadBand), the value of OccupiedHeatingSetpoint shall be adjusted to " +
                    "(OccupiedCoolingSetpoint - MinSetpointDeadBand)." +
                    "\n" +
                    "If the occupancy status of the room is unknown, this attribute shall be used as the cooling mode " +
                    "setpoint." +
                    "\n" +
                    "If a client changes the value of this attribute, the server supports the PRES feature, and the " +
                    "server either does not support the OCC feature or the Occupied bit is set on the Occupancy " +
                    "attribute, the value of the ActivePresetHandle attribute shall be set to null."
            },

            {
                tag: "attribute", name: "OccupiedHeatingSetpoint", xref: "cluster§4.3.9.14",

                details: "Indicates the heating mode setpoint when the room is occupied. Refer to Setpoint Limits for " +
                    "constraints." +
                    "\n" +
                    "If an attempt is made to set this attribute to a value greater than MaxHeatSetpointLimit or less " +
                    "than MinHeatSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "If this attribute is set to a value that is greater than (OccupiedCoolingSetpoint - " +
                    "MinSetpointDeadBand), the value of OccupiedCoolingSetpoint shall be adjusted to " +
                    "(OccupiedHeatingSetpoint + MinSetpointDeadBand)." +
                    "\n" +
                    "If the occupancy status of the room is unknown, this attribute shall be used as the heating mode " +
                    "setpoint." +
                    "\n" +
                    "If a client changes the value of this attribute, the server supports the PRES feature, and the " +
                    "server either does not support the OCC feature or the Occupied bit is set on the Occupancy " +
                    "attribute, the value of the ActivePresetHandle attribute shall be set to null."
            },

            {
                tag: "attribute", name: "UnoccupiedCoolingSetpoint", xref: "cluster§4.3.9.15",

                details: "Indicates the cooling mode setpoint when the room is unoccupied. Refer to Setpoint Limits for " +
                    "constraints." +
                    "\n" +
                    "If an attempt is made to set this attribute to a value greater than MaxCoolSetpointLimit or less " +
                    "than MinCoolSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "If this attribute is set to a value that is less than (UnoccupiedHeatingSetpoint + " +
                    "MinSetpointDeadBand), the value of UnoccupiedHeatingSetpoint shall be adjusted to " +
                    "(UnoccupiedCoolingSetpoint - MinSetpointDeadBand)." +
                    "\n" +
                    "If the occupancy status of the room is unknown, this attribute shall NOT be used." +
                    "\n" +
                    "If a client changes the value of this attribute, the server supports the PRES and OCC features, and " +
                    "the Occupied bit is not set on the Occupancy attribute, the value of the ActivePresetHandle " +
                    "attribute shall be set to null."
            },

            {
                tag: "attribute", name: "UnoccupiedHeatingSetpoint", xref: "cluster§4.3.9.16",

                details: "Indicates the heating mode setpoint when the room is unoccupied. Refer to Setpoint Limits for " +
                    "constraints." +
                    "\n" +
                    "If an attempt is made to set this attribute to a value greater than MaxHeatSetpointLimit or less " +
                    "than MinHeatSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "If this attribute is set to a value that is greater than (UnoccupiedCoolingSetpoint - " +
                    "MinSetpointDeadBand), the value of UnoccupiedCoolingSetpoint shall be adjusted to" +
                    "\n" +
                    "+ MinSetpointDeadBand)." +
                    "\n" +
                    "If the occupancy status of the room is unknown, this attribute shall NOT be used." +
                    "\n" +
                    "If a client changes the value of this attribute, the server supports the PRES and OCC features, and " +
                    "the Occupied bit is not set on the Occupancy attribute, the value of the ActivePresetHandle " +
                    "attribute shall be set to null."
            },

            {
                tag: "attribute", name: "MinHeatSetpointLimit", xref: "cluster§4.3.9.17",

                details: "Indicates the minimum level that the heating setpoint may be set to." +
                    "\n" +
                    "This attribute, and the following three attributes, allow the user to define setpoint limits more " +
                    "constrictive than the manufacturer imposed ones. Limiting users (e.g., in a commercial building) to " +
                    "such setpoint limits can help conserve power." +
                    "\n" +
                    "Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value " +
                    "which conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to " +
                    "permit this attribute to be set to the desired value. If an attempt is made to set this attribute to " +
                    "a value which is not consistent with the constraints and cannot be resolved by modifying setpoints " +
                    "then a response with the status code CONSTRAINT_ERROR shall be returned."
            },

            {
                tag: "attribute", name: "MaxHeatSetpointLimit", xref: "cluster§4.3.9.18",

                details: "Indicates the maximum level that the heating setpoint may be set to." +
                    "\n" +
                    "Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value " +
                    "which conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to " +
                    "permit this attribute to be set to the desired value. If an attempt is made to set this attribute to " +
                    "a value which is not consistent with the constraints and cannot be resolved by modifying setpoints " +
                    "then a response with the status code CONSTRAINT_ERROR shall be returned."
            },

            {
                tag: "attribute", name: "MinCoolSetpointLimit", xref: "cluster§4.3.9.19",

                details: "Indicates the minimum level that the cooling setpoint may be set to." +
                    "\n" +
                    "Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value " +
                    "which conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to " +
                    "permit this attribute to be set to the desired value. If an attempt is made to set this attribute to " +
                    "a value which is not consistent with the constraints and cannot be resolved by modifying setpoints " +
                    "then a response with the status code CONSTRAINT_ERROR shall be returned."
            },

            {
                tag: "attribute", name: "MaxCoolSetpointLimit", xref: "cluster§4.3.9.20",

                details: "Indicates the maximum level that the cooling setpoint may be set to." +
                    "\n" +
                    "Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value " +
                    "which conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to " +
                    "permit this attribute to be set to the desired value. If an attempt is made to set this attribute to " +
                    "a value which is not consistent with the constraints and cannot be resolved by modifying setpoints " +
                    "then a response with the status code CONSTRAINT_ERROR shall be returned."
            },

            {
                tag: "attribute", name: "MinSetpointDeadBand", xref: "cluster§4.3.9.21",

                details: "On devices which support the AUTO feature, this attribute shall indicate the minimum difference " +
                    "between the Heat Setpoint and the Cool Setpoint." +
                    "\n" +
                    "Refer to Setpoint Limits for constraints." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> Prior to revision 8 of this cluster specification the value of this attribute was constrained to a " +
                    "  range of 0°C to 2.5°C." +
                    "\n" +
                    "For backwards compatibility, this attribute is optionally writeable. However any writes to this " +
                    "attribute shall be silently ignored."
            },

            {
                tag: "attribute", name: "RemoteSensing", xref: "cluster§4.3.9.22",

                details: "Indicates when the local temperature, outdoor temperature and occupancy are being sensed by remote " +
                    "networked sensors, rather than internal sensors." +
                    "\n" +
                    "If the LTNE feature is present in the server, the LocalTemperature RemoteSensing bit value shall " +
                    "always report a value of 0." +
                    "\n" +
                    "If the LocalTemperature RemoteSensing bit is written with a value of 1 when the LTNE feature is " +
                    "present, the write shall fail and the server shall report a CONSTRAINT_ERROR."
            },

            {
                tag: "attribute", name: "ControlSequenceOfOperation", xref: "cluster§4.3.9.23",

                details: "Indicates the overall operating environment of the thermostat, and thus the possible system modes " +
                    "that the thermostat can operate in." +
                    "\n" +
                    "If an attempt is made to write to this attribute, the server shall silently ignore the write and the " +
                    "value of this attribute shall remain unchanged. This behavior is in place for backwards " +
                    "compatibility with existing thermostats."
            },

            {
                tag: "attribute", name: "SystemMode", xref: "cluster§4.3.9.24",
                details: "Indicates the current operating mode of the thermostat. Its value shall be limited by the " +
                    "ControlSequenceOfOperation attribute."
            },

            {
                tag: "attribute", name: "ThermostatRunningMode", xref: "cluster§4.3.9.25",
                details: "Indicates the running mode of the thermostat. This attribute uses the same values as SystemModeEnum " +
                    "but can only be Off, Cool or Heat. This attribute is intended to provide additional information when " +
                    "the thermostat’s system mode is in auto mode."
            },

            {
                tag: "attribute", name: "StartOfWeek", xref: "cluster§4.3.9.26",

                details: "Indicates the day of the week that this thermostat considers to be the start of week for weekly " +
                    "setpoint scheduling." +
                    "\n" +
                    "This attribute may be able to be used as the base to determine if the device supports weekly " +
                    "scheduling by reading the attribute. Successful response means that the weekly scheduling is " +
                    "supported."
            },

            {
                tag: "attribute", name: "NumberOfWeeklyTransitions", xref: "cluster§4.3.9.27",
                details: "Indicates how many weekly schedule transitions the thermostat is capable of handling."
            },
            {
                tag: "attribute", name: "NumberOfDailyTransitions", xref: "cluster§4.3.9.28",
                details: "Indicates how many daily schedule transitions the thermostat is capable of handling."
            },

            {
                tag: "attribute", name: "TemperatureSetpointHold", xref: "cluster§4.3.9.29",

                details: "Indicates the temperature hold status on the thermostat. If hold status is on, the thermostat SHOULD " +
                    "maintain the temperature setpoint for the current mode until a system mode change. If hold status is " +
                    "off, the thermostat SHOULD follow the setpoint transitions specified by its internal scheduling " +
                    "program. If the thermostat supports setpoint hold for a specific duration, it SHOULD also implement " +
                    "the TemperatureSetpointHoldDuration attribute." +
                    "\n" +
                    "If the server supports a setpoint hold for a specific duration, it SHOULD also implement the " +
                    "SetpointHoldExpiryTimestamp attribute." +
                    "\n" +
                    "If this attribute is updated to SetpointHoldOn and the TemperatureSetpointHoldDuration has a " +
                    "non-null value and the SetpointHoldExpiryTimestamp is supported, the server shall update the " +
                    "SetpointHoldExpiryTimestamp with a value of current UTC timestamp, in seconds, plus the value in " +
                    "TemperatureSetpointHoldDuration multiplied by 60." +
                    "\n" +
                    "If this attribute is updated to SetpointHoldOff and the SetpointHoldExpiryTimestamp is supported, " +
                    "the server shall set the SetpointHoldExpiryTimestamp to null."
            },

            {
                tag: "attribute", name: "TemperatureSetpointHoldDuration", xref: "cluster§4.3.9.30",

                details: "Indicates the period in minutes for which a setpoint hold is active. Thermostats that support hold " +
                    "for a specified duration SHOULD implement this attribute. The null value indicates the field is " +
                    "unused. All other values are reserved." +
                    "\n" +
                    "If this attribute is updated to a non-null value and the TemperatureSetpointHold is set to " +
                    "SetpointHoldOn and the SetpointHoldExpiryTimestamp is supported, the server shall update " +
                    "SetpointHoldExpiryTimestamp with a value of current UTC timestamp, in seconds, plus the new value of " +
                    "this attribute multiplied by 60." +
                    "\n" +
                    "If this attribute is set to null and the SetpointHoldExpiryTimestamp is supported, the server shall " +
                    "set the SetpointHoldExpiryTimestamp to null."
            },

            {
                tag: "attribute", name: "ThermostatProgrammingOperationMode", xref: "cluster§4.3.9.31",

                details: "Indicates the operational state of the thermostat’s programming. The thermostat shall modify its " +
                    "programming operation when this attribute is modified by a client and update this attribute when its " +
                    "programming operation is modified locally by a user. The thermostat may support more than one active " +
                    "ProgrammingOperationModeBitmap. For example, the thermostat may operate simultaneously in Schedule " +
                    "Programming Mode and Recovery Mode." +
                    "\n" +
                    "Thermostats which contain a schedule may use this attribute to control how that schedule is used, " +
                    "even if they do not support the ScheduleConfiguration feature." +
                    "\n" +
                    "When ScheduleActive is not set, the setpoint is altered only by manual up/down changes at the " +
                    "thermostat or remotely, not by internal schedule programming." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> Modifying the ScheduleActive bit does not clear or delete previous weekly schedule programming " +
                    "  configurations."
            },

            {
                tag: "attribute", name: "ThermostatRunningState", xref: "cluster§4.3.9.32",
                details: "Indicates the current relay state of the heat, cool, and fan relays. Unimplemented outputs shall be " +
                    "treated as if they were Off."
            },

            {
                tag: "attribute", name: "SetpointChangeSource", xref: "cluster§4.3.9.33",

                details: "Indicates the source of the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint (i.e., " +
                    "who or what determined the current setpoint)." +
                    "\n" +
                    "This attribute enables service providers to determine whether changes to setpoints were initiated " +
                    "due to occupant comfort, scheduled programming or some other source (e.g., electric utility or other " +
                    "service provider). Because automation services may initiate frequent setpoint changes, this " +
                    "attribute clearly differentiates the source of setpoint changes made at the thermostat."
            },

            {
                tag: "attribute", name: "SetpointChangeAmount", xref: "cluster§4.3.9.34",
                details: "Indicates the delta between the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint " +
                    "and the previous active setpoint. This attribute is meant to accompany the SetpointChangeSource " +
                    "attribute; devices implementing SetpointChangeAmount SHOULD also implement SetpointChangeSource." +
                    "\n" +
                    "The null value indicates that the previous setpoint was unknown."
            },

            {
                tag: "attribute", name: "SetpointChangeSourceTimestamp", xref: "cluster§4.3.9.35",
                details: "Indicates the time in UTC at which the SetpointChangeAmount attribute change was recorded."
            },

            {
                tag: "attribute", name: "OccupiedSetback", xref: "cluster§4.3.9.36",

                details: "Indicates the amount that the Thermostat server will allow the Calculated Local Temperature to float " +
                    "above the OccupiedCoolingSetpoint (i.e., OccupiedCoolingSetpoint + OccupiedSetback) or below the " +
                    "OccupiedHeatingSetpoint setpoint (i.e., OccupiedHeatingSetpoint – OccupiedSetback) before initiating " +
                    "a state change to bring the temperature back to the user’s desired setpoint. This attribute is " +
                    "sometimes also referred to as the “span.”" +
                    "\n" +
                    "The purpose of this attribute is to allow remote configuration of the span between the desired " +
                    "setpoint and the measured temperature to help prevent over-cycling and reduce energy bills, though " +
                    "this may result in lower comfort on the part of some users." +
                    "\n" +
                    "The null value indicates the attribute is unused." +
                    "\n" +
                    "If the Thermostat client attempts to write OccupiedSetback to a value greater than " +
                    "OccupiedSetbackMax, the Thermostat server shall set its OccupiedSetback value to OccupiedSetbackMax " +
                    "and shall send a Write Attribute Response command with a Status Code field enumeration of SUCCESS " +
                    "response." +
                    "\n" +
                    "If the Thermostat client attempts to write OccupiedSetback to a value less than OccupiedSetbackMin, " +
                    "the Thermostat server shall set its OccupiedSetback value to OccupiedSetbackMin and shall send a " +
                    "Write Attribute Response command with a Status Code field enumeration of SUCCESS response."
            },

            {
                tag: "attribute", name: "OccupiedSetbackMin", xref: "cluster§4.3.9.37",
                details: "Indicates the minimum value that the Thermostat server will allow the OccupiedSetback attribute to " +
                    "be configured by a user." +
                    "\n" +
                    "The null value indicates the attribute is unused."
            },

            {
                tag: "attribute", name: "OccupiedSetbackMax", xref: "cluster§4.3.9.38",
                details: "Indicates the maximum value that the Thermostat server will allow the OccupiedSetback attribute to " +
                    "be configured by a user." +
                    "\n" +
                    "The null value indicates the attribute is unused."
            },

            {
                tag: "attribute", name: "UnoccupiedSetback", xref: "cluster§4.3.9.39",

                details: "Indicates the amount that the Thermostat server will allow the Calculated Local Temperature to float " +
                    "above the UnoccupiedCoolingSetpoint (i.e., UnoccupiedCoolingSetpoint + UnoccupiedSetback) or below " +
                    "the UnoccupiedHeatingSetpoint setpoint (i.e., UnoccupiedHeatingSetpoint - UnoccupiedSetback) before " +
                    "initiating a state change to bring the temperature back to the user’s desired setpoint. This " +
                    "attribute is sometimes also referred to as the “span.”" +
                    "\n" +
                    "The purpose of this attribute is to allow remote configuration of the span between the desired " +
                    "setpoint and the measured temperature to help prevent over-cycling and reduce energy bills, though " +
                    "this may result in lower comfort on the part of some users." +
                    "\n" +
                    "The null value indicates the attribute is unused." +
                    "\n" +
                    "If the Thermostat client attempts to write UnoccupiedSetback to a value greater than " +
                    "UnoccupiedSetbackMax, the Thermostat server shall set its UnoccupiedSetback value to " +
                    "UnoccupiedSetbackMax and shall send a Write Attribute Response command with a Status Code field " +
                    "enumeration of SUCCESS response." +
                    "\n" +
                    "If the Thermostat client attempts to write UnoccupiedSetback to a value less than " +
                    "UnoccupiedSetbackMin, the Thermostat server shall set its UnoccupiedSetback value to " +
                    "UnoccupiedSetbackMin and shall send a Write Attribute Response command with a Status Code field " +
                    "enumeration of SUCCESS response."
            },

            {
                tag: "attribute", name: "UnoccupiedSetbackMin", xref: "cluster§4.3.9.40",
                details: "Indicates the minimum value that the Thermostat server will allow the UnoccupiedSetback attribute to " +
                    "be configured by a user." +
                    "\n" +
                    "The null value indicates the attribute is unused."
            },

            {
                tag: "attribute", name: "UnoccupiedSetbackMax", xref: "cluster§4.3.9.41",
                details: "Indicates the maximum value that the Thermostat server will allow the UnoccupiedSetback attribute to " +
                    "be configured by a user." +
                    "\n" +
                    "The null value indicates the attribute is unused."
            },

            {
                tag: "attribute", name: "EmergencyHeatDelta", xref: "cluster§4.3.9.42",

                details: "Indicates the delta between the Calculated Local Temperature and the OccupiedHeatingSetpoint or " +
                    "UnoccupiedHeatingSetpoint attributes at which the Thermostat server will operate in emergency heat " +
                    "mode." +
                    "\n" +
                    "If the difference between the Calculated Local Temperature and OccupiedCoolingSetpoint or " +
                    "UnoccupiedCoolingSetpoint is greater than or equal to the EmergencyHeatDelta and the Thermostat " +
                    "server’s SystemMode attribute is in a heating-related mode, then the Thermostat server shall " +
                    "immediately switch to the SystemMode attribute value that provides the highest stage of heating " +
                    "(e.g., emergency heat) and continue operating in that running state until the " +
                    "OccupiedHeatingSetpoint value is reached. For example:" +
                    "\n" +
                    "  • Calculated Local Temperature = 10.0°C" +
                    "\n" +
                    "  • OccupiedHeatingSetpoint = 16.0°C" +
                    "\n" +
                    "  • EmergencyHeatDelta = 2.0°C" +
                    "\n" +
                    "⇒ OccupiedHeatingSetpoint - Calculated Local Temperature ≥? EmergencyHeatDelta" +
                    "\n" +
                    "⇒ 16°C - 10°C ≥? 2°C" +
                    "\n" +
                    "⇒ TRUE >>> Thermostat server changes its SystemMode to operate in 2nd stage or emergency heat mode" +
                    "\n" +
                    "The purpose of this attribute is to provide Thermostat clients the ability to configure rapid " +
                    "heating when a setpoint is of a specified amount greater than the measured temperature. This allows " +
                    "the heated space to be quickly heated to the desired level set by the user."
            },

            {
                tag: "attribute", name: "AcType", xref: "cluster§4.3.9.43",
                details: "Indicates the type of Mini Split ACTypeEnum of Mini Split AC is defined depending on how Cooling and " +
                    "Heating condition is achieved by Mini Split AC."
            },
            {
                tag: "attribute", name: "AcCapacity", xref: "cluster§4.3.9.44",
                details: "Indicates capacity of Mini Split AC in terms of the format defined by the ACCapacityFormat attribute"
            },
            {
                tag: "attribute", name: "AcRefrigerantType", xref: "cluster§4.3.9.45",
                details: "Indicates type of refrigerant used within the Mini Split AC."
            },
            {
                tag: "attribute", name: "AcCompressorType", xref: "cluster§4.3.9.46",
                details: "Indicates the type of compressor used within the Mini Split AC."
            },
            {
                tag: "attribute", name: "AcErrorCode", xref: "cluster§4.3.9.47",
                details: "Indicates the type of errors encountered within the Mini Split AC."
            },
            {
                tag: "attribute", name: "AcLouverPosition", xref: "cluster§4.3.9.48",
                details: "Indicates the position of Louver on the AC."
            },
            {
                tag: "attribute", name: "AcCoilTemperature", xref: "cluster§4.3.9.49",
                details: "Indicates the temperature of the AC coil, as measured locally or remotely (over the network)."
            },
            {
                tag: "attribute", name: "AcCapacityFormat", xref: "cluster§4.3.9.50",
                details: "Indicates the format for the ACCapacity attribute."
            },

            {
                tag: "attribute", name: "PresetTypes", xref: "cluster§4.3.9.51",
                details: "Indicates the supported PresetScenarioEnum values, limits on how many presets can be created for " +
                    "each PresetScenarioEnum, and whether or not a thermostat can transition automatically to a given " +
                    "scenario."
            },

            {
                tag: "attribute", name: "ScheduleTypes", xref: "cluster§4.3.9.52",
                details: "Indicates the supported SystemMode values for Schedules, limits on how many schedules can be created " +
                    "for each SystemMode value, and whether or not a given SystemMode value supports transitions to " +
                    "Presets, target setpoints, or both."
            },

            {
                tag: "attribute", name: "NumberOfPresets", xref: "cluster§4.3.9.53",
                details: "Indicates the maximum number of entries supported by the Presets attribute."
            },
            {
                tag: "attribute", name: "NumberOfSchedules", xref: "cluster§4.3.9.54",
                details: "Indicates the maximum number of entries supported by the Schedules attribute."
            },
            {
                tag: "attribute", name: "NumberOfScheduleTransitions", xref: "cluster§4.3.9.55",
                details: "Indicates the maximum number of transitions per Schedules attribute entry."
            },
            { tag: "attribute", name: "NumberOfScheduleTransitionPerDay", xref: "cluster§4.3.9" },
            {
                tag: "attribute", name: "ActivePresetHandle", xref: "cluster§4.3.9.57",
                details: "Indicates the PresetHandle of the active preset. If this attribute is null, then there is no active " +
                    "preset."
            },
            {
                tag: "attribute", name: "ActiveScheduleHandle", xref: "cluster§4.3.9.58",
                details: "Indicates the ScheduleHandle of the active schedule. A null value in this attribute indicates that " +
                    "there is no active schedule."
            },

            {
                tag: "attribute", name: "Presets", xref: "cluster§4.3.9.59",

                details: "This attribute shall contain the current list of configured presets. On receipt of a write request:" +
                    "\n" +
                    "  1. If the PresetHandle field is null, the PresetStruct shall be treated as an added preset, and " +
                    "     the device shall create a new unique value for the PresetHandle field." +
                    "\n" +
                    "    a. If the BuiltIn field is true, a response with the status code CONSTRAINT_ERROR shall be " +
                    "       returned." +
                    "\n" +
                    "  2. If the PresetHandle field is not null, the PresetStruct shall be treated as a modification of " +
                    "     an existing preset." +
                    "\n" +
                    "    a. If the value of the PresetHandle field does not match any of the existing presets, a response " +
                    "       with the status code NOT_FOUND shall be returned." +
                    "\n" +
                    "    b. If the value of the PresetHandle field is duplicated on multiple presets in the updated list, " +
                    "       a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "    c. If the BuiltIn field is true, and the PresetStruct in the current value with a matching " +
                    "       PresetHandle field has a BuiltIn field set to false, a response with the status code " +
                    "       CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "    d. If the BuiltIn field is false, and the PresetStruct in the current value with a matching " +
                    "       PresetHandle field has a BuiltIn field set to true, a response with the status code " +
                    "       CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "  3. If the specified PresetScenarioEnum value does not exist in PresetTypes, a response with the " +
                    "     status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "  4. If the Name is set, but the associated PresetTypeStruct does not have the SupportsNames bit " +
                    "     set, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "  5. If appending the received PresetStruct to the pending list of Presets would cause the total " +
                    "     number of pending presets to exceed the value of the NumberOfPresets attribute, a response with " +
                    "     the status code RESOURCE_EXHAUSTED shall be returned." +
                    "\n" +
                    "  6. If appending the received PresetStruct to the pending list of Presets would cause the total " +
                    "     number of pending presets whose PresetScenario field matches the appended preset’s " +
                    "     PresetScenario field to exceed the value of the NumberOfPresets field on the PresetTypeStruct " +
                    "     whose PresetScenario matches the appended preset’s PresetScenario field, a response with the " +
                    "     status code RESOURCE_EXHAUSTED shall be returned." +
                    "\n" +
                    "  7. Otherwise, the write shall be pended until receipt of a commit request, and the status code " +
                    "     SUCCESS shall be returned." +
                    "\n" +
                    "    a. If the BuiltIn field is null:" +
                    "\n" +
                    "      i. If there is a PresetStruct in the current value with a matching PresetHandle field, the " +
                    "         BuiltIn field on the pending PresetStruct shall be set to the value of the BuiltIn on the " +
                    "         matching PresetStruct." +
                    "\n" +
                    "      ii. Otherwise, the BuiltIn field on the pending PresetStruct shall be set to false." +
                    "\n" +
                    "On an attempt to commit, the status of this attribute shall be determined as follows:" +
                    "\n" +
                    "  1. For all existing presets:" +
                    "\n" +
                    "    a. If, after applying all pending changes, the updated value of the Presets attribute would not " +
                    "       contain a PresetStruct with a matching PresetHandle field, indicating the removal of the " +
                    "       PresetStruct, the server shall check for invalid removal of the PresetStruct:" +
                    "\n" +
                    "      i. If the BuiltIn field is true on the removed PresetStruct, the attribute status shall be " +
                    "         CONSTRAINT_ERROR." +
                    "\n" +
                    "      ii. If the MSCH feature is supported and the removed PresetHandle would be referenced by any " +
                    "          PresetHandle on any ScheduleTransitionStruct on any ScheduleStruct in the updated value of " +
                    "          the Schedules attribute, the attribute status shall be INVALID_IN_STATE." +
                    "\n" +
                    "      iii. If the removed PresetHandle is equal to the value of the ActivePresetHandle attribute, " +
                    "           the attribute status shall be INVALID_IN_STATE." +
                    "\n" +
                    "  2. Otherwise, the attribute status shall be SUCCESS."
            },

            {
                tag: "attribute", name: "Schedules", xref: "cluster§4.3.9.60",

                details: "This attribute shall contain a list of ScheduleStructs. On receipt of a write request:" +
                    "\n" +
                    "  1. For all schedules in the write request:" +
                    "\n" +
                    "    a. If the ScheduleHandle field is null, the ScheduleStruct shall be treated as an added " +
                    "       schedule, and the device shall create a new unique value for the ScheduleHandle field." +
                    "\n" +
                    "      i. If the BuiltIn field is true, a response with the status code CONSTRAINT_ERROR shall be " +
                    "         returned." +
                    "\n" +
                    "    b. Otherwise, if the ScheduleHandle field is not null, the ScheduleStruct shall be treated as a " +
                    "       modification of an existing schedule." +
                    "\n" +
                    "      i. If the value of the ScheduleHandle field does not match any of the existing schedules, a " +
                    "         response with the status code NOT_FOUND shall be returned." +
                    "\n" +
                    "      ii. If the BuiltIn field is true, and the ScheduleStruct in the current value with a matching " +
                    "          ScheduleHandle field has a BuiltIn field set to false, a response with the status code " +
                    "          CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "      iii. If the BuiltIn field is false, and the ScheduleStruct in the current value with a " +
                    "           matching ScheduleHandle field has a BuiltIn field set to true, a response with the status " +
                    "           code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "    c. If the specified SystemMode does not exist in ScheduleTypes, a response with the status code " +
                    "       CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "    d. If the number of transitions exceeds the NumberOfScheduleTransitions value, a response with " +
                    "       the status code RESOURCE_EXHAUSTED shall be returned." +
                    "\n" +
                    "    e. If the value of the NumberOfScheduleTransitionsPerDay attribute is not null, and the number " +
                    "       of transitions on any single day of the week exceeds the NumberOfScheduleTransitionsPerDay " +
                    "       value, a response with the status code RESOURCE_EXHAUSTED shall be returned." +
                    "\n" +
                    "    f. If the PresetHandle field is present, but the associated ScheduleTypeStruct does not have the " +
                    "       SupportsPresets bit set, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "    g. If the PresetHandle field is present, but after applying all pending changes, the Presets " +
                    "       attribute would not contain a PresetStruct whose PresetHandle field matches the value of the " +
                    "       PresetHandle field, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "    h. If the Name is set, but the associated ScheduleTypeStruct does not have the SupportsNames bit " +
                    "       set, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "      i. For all transitions in all schedules in the write request:" +
                    "\n" +
                    "      i. If the PresetHandle field is present, but the ScheduleTypeStruct matching the value of the " +
                    "         SystemMode field on the encompassing ScheduleStruct does not have the SupportsPresets bit " +
                    "         set, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "    j. If the PresetHandle field is present, but after applying all pending changes, the Presets " +
                    "       attribute would not contain a PresetStruct whose PresetHandle field matches the value of the " +
                    "       PresetHandle field, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "      i. If the SystemMode field is present, but the ScheduleTypeStruct matching the value of the " +
                    "         SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit " +
                    "         set, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "      ii. If the SystemMode field is has a value of SystemModeOff, but the ScheduleTypeStruct " +
                    "          matching the value of the SystemMode field on the encompassing ScheduleStruct does not " +
                    "          have the SupportsOff bit set, a response with the status code CONSTRAINT_ERROR shall be " +
                    "          returned." +
                    "\n" +
                    "    k. If the HeatingSetpoint field is present, but the ScheduleTypeStruct matching the value of the " +
                    "       SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit " +
                    "       set, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "    l. If the CoolingSetpoint field is present, but the ScheduleTypeStruct matching the value of the " +
                    "       SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit " +
                    "       set, a response with the status code CONSTRAINT_ERROR shall be returned." +
                    "\n" +
                    "  2. If appending the received ScheduleStruct to the pending list of Schedules would cause the total " +
                    "     number of pending schedules to exceed the value of the NumberOfSchedules attribute, a response " +
                    "     with the status code RESOURCE_EXHAUSTED shall be returned." +
                    "\n" +
                    "  3. If appending the received ScheduleStruct to the pending list of Schedules would cause the total " +
                    "     number of pending schedules whose SystemMode field matches the appended schedule’s SystemMode " +
                    "     field to exceed the value of the NumberOfSchedules field on the ScheduleTypeStruct whose " +
                    "     SystemMode field matches the appended schedule’s SystemMode field, a response with the status " +
                    "     code RESOURCE_EXHAUSTED shall be returned." +
                    "\n" +
                    "  4. Otherwise, the write shall be pended until receipt of a commit request, and the attribute " +
                    "     status shall be SUCCESS." +
                    "\n" +
                    "    a. If the BuiltIn field is null:" +
                    "\n" +
                    "      i. If there is a ScheduleStruct in the current value with a matching ScheduleHandle field, the " +
                    "         BuiltIn field on the pending ScheduleStruct shall be set to the value of the BuiltIn on the " +
                    "         matching ScheduleStruct." +
                    "\n" +
                    "      ii. Otherwise, the BuiltIn field on the pending ScheduleStruct shall be set to false." +
                    "\n" +
                    "On an attempt to commit, the status of this attribute shall be determined as follows:" +
                    "\n" +
                    "  1. For all existing schedules:" +
                    "\n" +
                    "    a. If, after applying all pending changes, the updated value of the Schedules attribute would " +
                    "       not contain a ScheduleStruct with a matching ScheduleHandle field, indicating the removal of " +
                    "       the ScheduleStruct, the server shall check for invalid removal of the ScheduleStruct:" +
                    "\n" +
                    "      i. If the BuiltIn field is true on the removed ScheduleStruct, the attribute status shall be " +
                    "         CONSTRAINT_ERROR." +
                    "\n" +
                    "      ii. If the removed ScheduleHandle is equal to the value of the ActiveScheduleHandle attribute, " +
                    "          the attribute status shall be INVALID_IN_STATE." +
                    "\n" +
                    "  2. Otherwise, the attribute status shall be SUCCESS."
            },

            {
                tag: "attribute", name: "SetpointHoldExpiryTimestamp", xref: "cluster§4.3.9.61",

                details: "If there is a known time when the TemperatureSetpointHold shall be cleared, this attribute shall " +
                    "contain the timestamp in UTC indicating when that will happen. If there is no such known time, this " +
                    "attribute shall be null." +
                    "\n" +
                    "If the TemperatureSetpointHold is set to SetpointHoldOn and the TemperatureSetpointHoldDuration is " +
                    "set to null, this attribute shall be set to null indicating there is a hold on the Thermostat " +
                    "without a duration." +
                    "\n" +
                    "If the TemperatureSetpointHold is set to SetpointHoldOff, this attribute shall be set to null " +
                    "indicating there is no hold on the Thermostat."
            },

            {
                tag: "command", name: "SetpointRaiseLower", xref: "cluster§4.3.10.1",

                children: [
                    {
                        tag: "field", name: "Mode", xref: "cluster§4.3.10.1.1",
                        details: "The field shall specify which setpoints are to be adjusted."
                    },
                    {
                        tag: "field", name: "Amount", xref: "cluster§4.3.10.1.2",
                        details: "This field shall indicate the amount (possibly negative) that should be added to the setpoint(s), in " +
                            "steps of 0.1°C."
                    }
                ]
            },

            {
                tag: "command", name: "SetWeeklySchedule", xref: "cluster§4.3.10.2",

                details: "This command is used to update the thermostat weekly setpoint schedule from a management system. If " +
                    "the thermostat already has a weekly setpoint schedule programmed, then it SHOULD replace each daily " +
                    "setpoint set as it receives the updates from the management system. For example, if the thermostat " +
                    "has 4 setpoints for every day of the week and is sent a SetWeeklySchedule command with one setpoint " +
                    "for Saturday then the thermostat SHOULD remove all 4 setpoints for Saturday and replace those with " +
                    "the updated setpoint but leave all other days unchanged. If the schedule is larger than what fits in " +
                    "one frame or contains more than 10 transitions, the schedule shall then be sent using multiple " +
                    "SetWeeklySchedule Commands.",

                children: [
                    {
                        tag: "field", name: "NumberOfTransitionsForSequence", xref: "cluster§4.3.10.2.1",
                        details: "This field shall indicate how many individual transitions to expect for this sequence of commands. " +
                            "If a device supports more than 10 transitions in its schedule they can send this by sending more " +
                            "than 1 “Set Weekly Schedule” command, each containing the separate information that the device needs " +
                            "to set."
                    },

                    {
                        tag: "field", name: "DayOfWeekForSequence", xref: "cluster§4.3.10.2.2",

                        details: "This field shall represent the day of the week at which all the transitions within the payload of " +
                            "the command SHOULD be associated to. This field is a bitmap and therefore the associated setpoint " +
                            "could overlap onto multiple days (you could set one transition time for all “week days” or whatever " +
                            "combination of days the implementation requests)." +
                            "\n" +
                            "Each setpoint transition will begin with the day of week for this transition. There can be up to 10 " +
                            "transitions for each command."
                    },

                    {
                        tag: "field", name: "ModeForSequence", xref: "cluster§4.3.10.2.3",

                        details: "This field shall indicate how the application decodes the setpoint fields of each transition in the " +
                            "Transitions list." +
                            "\n" +
                            "If the HeatSetpointPresent bit is On, the HeatSetpoint field shall NOT be null in every entry of the " +
                            "Transitions list." +
                            "\n" +
                            "If the HeatSetpointPresent bit is Off, the HeatSetpoint field shall be null in every entry of the " +
                            "Transitions list." +
                            "\n" +
                            "If the CoolSetpointPresent bit is On, the CoolSetpoint field shall NOT be null in every entry of the " +
                            "Transitions list." +
                            "\n" +
                            "If the CoolSetpointPresent bit is Off, the CoolSetpoint field shall be null in every entry of the " +
                            "Transitions list." +
                            "\n" +
                            "At least one of the bits in the Mode For Sequence byte shall be on." +
                            "\n" +
                            "Both bits must be respected, even if the HEAT or COOL feature is not supported, to ensure the " +
                            "command is decoded and handled correctly."
                    },

                    {
                        tag: "field", name: "Transitions", xref: "cluster§4.3.10.2.4",
                        details: "This field shall contain the list of setpoint transitions used to update the specified daily " +
                            "schedules"
                    }
                ]
            },

            {
                tag: "command", name: "GetWeeklySchedule", xref: "cluster§4.3.10.3",

                children: [
                    {
                        tag: "field", name: "DaysToReturn", xref: "cluster§4.3.10.3.1",
                        details: "This field shall indicate the number of days the client would like to return the setpoint values for " +
                            "and could be any combination of single days or the entire week."
                    },
                    {
                        tag: "field", name: "ModeToReturn", xref: "cluster§4.3.10.3.2",
                        details: "This field shall indicate the mode the client would like to return the set point values for and " +
                            "could be any combination of heat only, cool only or heat & cool."
                    }
                ]
            },

            {
                tag: "command", name: "GetWeeklyScheduleResponse", xref: "cluster§4.3.10.4",
                details: "This command has the same payload format as the Set Weekly Schedule."
            },

            {
                tag: "command", name: "ClearWeeklySchedule", xref: "cluster§4.3.10.5",
                details: "This command is used to clear the weekly schedule. The Clear weekly schedule has no payload." +
                    "\n" +
                    "Upon receipt, all transitions currently stored shall be cleared and a default response of SUCCESS " +
                    "shall be sent in response. There are no error responses to this command."
            },

            {
                tag: "command", name: "GetRelayStatusLogResponse", xref: "cluster§4.3.10.7",
                details: "This command is sent from the thermostat cluster server in response to the Get Relay Status Log. " +
                    "After the Relay Status Entry is sent over the air to the requesting client, the specific entry will " +
                    "be cleared from the thermostat internal log.",

                children: [
                    {
                        tag: "field", name: "TimeOfDay", xref: "cluster§4.3.10.7.1",
                        details: "This field shall indicate the sample time of the day, in minutes since midnight, when the relay " +
                            "status was captured for this associated log entry. For example, 6am will be represented by 360 " +
                            "minutes since midnight and 11:30pm will be represented by 1410 minutes since midnight."
                    },

                    {
                        tag: "field", name: "RelayStatus", xref: "cluster§4.3.10.7.2",
                        details: "This field shall indicate the relay status for thermostat when the log is captured. Each bit " +
                            "represents one relay used by the thermostat. If the bit is on, the associated relay is on and " +
                            "active. Each thermostat manufacturer can create its own mapping between the bitmap and the " +
                            "associated relay."
                    },

                    {
                        tag: "field", name: "LocalTemperature", xref: "cluster§4.3.10.7.3",
                        details: "This field shall indicate the LocalTemperature when the log is captured. The null value indicates " +
                            "that LocalTemperature was invalid or unavailable."
                    },
                    {
                        tag: "field", name: "Setpoint", xref: "cluster§4.3.10.7.5",
                        details: "This field shall indicate the target setpoint temperature when the log is captured."
                    },
                    {
                        tag: "field", name: "UnreadEntries", xref: "cluster§4.3.10.7.6",
                        details: "This field shall indicate the number of unread entries within the thermostat internal log system."
                    }
                ]
            },

            {
                tag: "command", name: "SetActiveScheduleRequest", xref: "cluster§4.3.10.8",
                children: [{
                    tag: "field", name: "ScheduleHandle", xref: "cluster§4.3.10.8.1",
                    details: "This field shall specify the value of the ScheduleHandle field on the ScheduleStruct to be made " +
                        "active."
                }]
            },

            {
                tag: "command", name: "SetActivePresetRequest", xref: "cluster§4.3.10.9",
                children: [{
                    tag: "field", name: "PresetHandle", xref: "cluster§4.3.10.9.1",
                    details: "This field shall specify the value of the PresetHandle field on the PresetStruct to be made active. " +
                        "If the field is set to null, that indicates there should be no active preset."
                }]
            },

            {
                tag: "datatype", name: "TemperatureDifference", xref: "cluster§4.3.8.1",

                details: "This data type is derived from int16 and represents a temperature difference with a resolution of " +
                    "0.01°C." +
                    "\n" +
                    "  • value = (temperature in °C) x 100" +
                    "\n" +
                    "  • -4°C ⇒ -400" +
                    "\n" +
                    "  • 123.45°C ⇒ 12345" +
                    "\n" +
                    "The full (non-null) range of -327.67°C to 327.67°C may be used."
            },

            {
                tag: "datatype", name: "SignedTemperature", xref: "cluster§4.3.8.2",

                details: "This data type is derived from int8 and represents a temperature from -12.7°C to 12.7°C with a " +
                    "resolution of 0.1°C." +
                    "\n" +
                    "  • value = (temperature in °C) x 10" +
                    "\n" +
                    "  • -4°C ⇒ -40" +
                    "\n" +
                    "  • 12.3°C ⇒ 123" +
                    "\n" +
                    "This type is employed where compactness of representation is important and where the resolution and " +
                    "range are still satisfactory."
            },

            {
                tag: "datatype", name: "UnsignedTemperature", xref: "cluster§4.3.8.3",

                details: "This data type is derived from uint8 and represents a temperature from 0°C to 25.5°C with a " +
                    "resolution of 0.1°C." +
                    "\n" +
                    "  • value = (temperature in °C) x 10" +
                    "\n" +
                    "  • 4°C ⇒ 40" +
                    "\n" +
                    "  • 12.3°C ⇒ 123" +
                    "\n" +
                    "This type is employed where compactness of representation is important and where the resolution and " +
                    "range are still satisfactory."
            },

            {
                tag: "datatype", name: "ACErrorCodeBitmap", xref: "cluster§4.3.8.4",

                children: [
                    { tag: "field", name: "CompressorFail", description: "Compressor Failure or Refrigerant Leakage" },
                    { tag: "field", name: "RoomSensorFail", description: "Room Temperature Sensor Failure" },
                    { tag: "field", name: "OutdoorSensorFail", description: "Outdoor Temperature Sensor Failure" },
                    { tag: "field", name: "CoilSensorFail", description: "Indoor Coil Temperature Sensor Failure" },
                    { tag: "field", name: "FanFail", description: "Fan Failure" }
                ]
            },

            {
                tag: "datatype", name: "HVACSystemTypeBitmap", xref: "cluster§4.3.8.5",

                children: [
                    {
                        tag: "field", name: "CoolingStage", description: "Stage of cooling the HVAC system is using.",
                        xref: "cluster§4.3.8.5.1",

                        details: "These bits shall indicate what stage of cooling the HVAC system is using." +
                            "\n" +
                            "  • 00 = Cool Stage 1" +
                            "\n" +
                            "  • 01 = Cool Stage 2" +
                            "\n" +
                            "  • 10 = Cool Stage 3" +
                            "\n" +
                            "  • 11 = Reserved"
                    },

                    {
                        tag: "field", name: "HeatingStage", description: "Stage of heating the HVAC system is using.",
                        xref: "cluster§4.3.8.5.2",

                        details: "These bits shall indicate what stage of heating the HVAC system is using." +
                            "\n" +
                            "  • 00 = Heat Stage 1" +
                            "\n" +
                            "  • 01 = Heat Stage 2" +
                            "\n" +
                            "  • 10 = Heat Stage 3" +
                            "\n" +
                            "  • 11 = Reserved"
                    },

                    {
                        tag: "field", name: "HeatingIsHeatPump", description: "Is the heating type Heat Pump.",
                        xref: "cluster§4.3.8.5.3",
                        details: "This bit shall indicate whether the HVAC system is conventional or a heat pump." +
                            "\n" +
                            "  • 0 = Conventional" +
                            "\n" +
                            "  • 1 = Heat Pump"
                    },

                    {
                        tag: "field", name: "HeatingUsesFuel", description: "Does the HVAC system use fuel.",
                        xref: "cluster§4.3.8.5.4",
                        details: "This bit shall indicate whether the HVAC system uses fuel." +
                            "\n" +
                            "  • 0 = Does not use fuel" +
                            "\n" +
                            "  • 1 = Uses fuel"
                    }
                ]
            },

            {
                tag: "datatype", name: "OccupancyBitmap", xref: "cluster§4.3.8.6",

                children: [{
                    tag: "field", name: "Occupied", description: "Indicates the occupancy state",
                    xref: "cluster§4.3.8.6.1",
                    details: "If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall " +
                        "indicate the unoccupied state."
                }]
            },

            {
                tag: "datatype", name: "PresetTypeFeaturesBitmap", xref: "cluster§4.3.8.7",

                children: [
                    {
                        tag: "field", name: "Automatic",
                        description: "Preset may be automatically activated by the thermostat"
                    },
                    { tag: "field", name: "SupportsNames", description: "Preset supports user-provided names" }
                ]
            },

            {
                tag: "datatype", name: "ProgrammingOperationModeBitmap", xref: "cluster§4.3.8.8",

                children: [
                    {
                        tag: "field", name: "ScheduleActive",
                        description: "Schedule programming mode. This enables any programmed weekly schedule configurations."
                    },
                    { tag: "field", name: "AutoRecovery", description: "Auto/recovery mode" },
                    { tag: "field", name: "Economy", description: "Economy/EnergyStar mode" }
                ]
            },

            {
                tag: "datatype", name: "RelayStateBitmap", xref: "cluster§4.3.8.9",

                children: [
                    { tag: "field", name: "Heat", description: "Heat Stage On" },
                    { tag: "field", name: "Cool", description: "Cool Stage On" },
                    { tag: "field", name: "Fan", description: "Fan Stage On" },
                    { tag: "field", name: "HeatStage2", description: "Heat 2nd Stage On" },
                    { tag: "field", name: "CoolStage2", description: "Cool 2nd Stage On" },
                    { tag: "field", name: "FanStage2", description: "Fan 2nd Stage On" },
                    { tag: "field", name: "FanStage3", description: "Fan 3rd Stage On" }
                ]
            },

            {
                tag: "datatype", name: "RemoteSensingBitmap", xref: "cluster§4.3.8.10",

                children: [
                    {
                        tag: "field", name: "LocalTemperature",
                        description: "Calculated Local Temperature is derived from a remote node"
                    },
                    {
                        tag: "field", name: "OutdoorTemperature",
                        description: "OutdoorTemperature is derived from a remote node"
                    },
                    { tag: "field", name: "Occupancy", description: "Occupancy is derived from a remote node" }
                ]
            },

            {
                tag: "datatype", name: "ScheduleTypeFeaturesBitmap", xref: "cluster§4.3.8.11",

                children: [
                    {
                        tag: "field", name: "SupportsPresets", description: "Supports presets", xref: "cluster§4.3.8.11.1",
                        details: "This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the " +
                            "SystemMode field on the encompassing ScheduleTypeStruct supports specifying presets on " +
                            "ScheduleTransitionStructs contained in its Transitions field."
                    },

                    {
                        tag: "field", name: "SupportsSetpoints", description: "Supports setpoints",
                        xref: "cluster§4.3.8.11.2",
                        details: "This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the " +
                            "SystemMode field on the encompassing ScheduleTypeStruct supports specifying setpoints on " +
                            "ScheduleTransitionStructs contained in its Transitions field."
                    },

                    {
                        tag: "field", name: "SupportsNames", description: "Supports user-provided names",
                        xref: "cluster§4.3.8.11.3",
                        details: "This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the " +
                            "SystemMode field on the encompassing ScheduleTypeStruct supports setting the value of the Name " +
                            "field."
                    },

                    {
                        tag: "field", name: "SupportsOff", description: "Supports transitioning to SystemModeOff",
                        xref: "cluster§4.3.8.11.4",
                        details: "This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the " +
                            "SystemMode field on the encompassing ScheduleTypeStruct supports setting its SystemMode field to " +
                            "Off."
                    }
                ]
            },

            {
                tag: "datatype", name: "ScheduleDayOfWeekBitmap", xref: "cluster§4.3.8.12",

                children: [
                    { tag: "field", name: "Sunday", description: "Sunday" },
                    { tag: "field", name: "Monday", description: "Monday" },
                    { tag: "field", name: "Tuesday", description: "Tuesday" },
                    { tag: "field", name: "Wednesday", description: "Wednesday" },
                    { tag: "field", name: "Thursday", description: "Thursday" },
                    { tag: "field", name: "Friday", description: "Friday" },
                    { tag: "field", name: "Saturday", description: "Saturday" },
                    { tag: "field", name: "Away", description: "Away or Vacation" }
                ]
            },

            {
                tag: "datatype", name: "ScheduleModeBitmap", xref: "cluster§4.3.8.13",
                children: [
                    { tag: "field", name: "HeatSetpointPresent", description: "Adjust Heat Setpoint" },
                    { tag: "field", name: "CoolSetpointPresent", description: "Adjust Cool Setpoint" }
                ]
            },

            {
                tag: "datatype", name: "ACCapacityFormatEnum", xref: "cluster§4.3.8.14",
                children: [{ tag: "field", name: "BtUh", description: "British Thermal Unit per Hour" }]
            },

            {
                tag: "datatype", name: "ACCompressorTypeEnum", xref: "cluster§4.3.8.15",

                children: [
                    { tag: "field", name: "Unknown", description: "Unknown compressor type" },
                    { tag: "field", name: "T1", description: "Max working ambient 43 °C" },
                    { tag: "field", name: "T2", description: "Max working ambient 35 °C" },
                    { tag: "field", name: "T3", description: "Max working ambient 52 °C" }
                ]
            },

            {
                tag: "datatype", name: "ACLouverPositionEnum", xref: "cluster§4.3.8.16",

                children: [
                    { tag: "field", name: "Closed", description: "Fully Closed" },
                    { tag: "field", name: "Open", description: "Fully Open" },
                    { tag: "field", name: "Quarter", description: "Quarter Open" },
                    { tag: "field", name: "Half", description: "Half Open" },
                    { tag: "field", name: "ThreeQuarters", description: "Three Quarters Open" }
                ]
            },

            {
                tag: "datatype", name: "ACRefrigerantTypeEnum", xref: "cluster§4.3.8.17",

                children: [
                    { tag: "field", name: "Unknown", description: "Unknown Refrigerant Type" },
                    { tag: "field", name: "R22", description: "R22 Refrigerant" },
                    { tag: "field", name: "R410A", description: "R410a Refrigerant" },
                    { tag: "field", name: "R407C", description: "R407c Refrigerant" }
                ]
            },

            {
                tag: "datatype", name: "ACTypeEnum", xref: "cluster§4.3.8.18",

                children: [
                    { tag: "field", name: "Unknown", description: "Unknown AC Type" },
                    { tag: "field", name: "CoolingFixed", description: "Cooling and Fixed Speed" },
                    { tag: "field", name: "HeatPumpFixed", description: "Heat Pump and Fixed Speed" },
                    { tag: "field", name: "CoolingInverter", description: "Cooling and Inverter" },
                    { tag: "field", name: "HeatPumpInverter", description: "Heat Pump and Inverter" }
                ]
            },

            {
                tag: "datatype", name: "SetpointRaiseLowerModeEnum", xref: "cluster§4.3.8.19",
                children: [
                    { tag: "field", name: "Heat", description: "Adjust Heat Setpoint" },
                    { tag: "field", name: "Cool", description: "Adjust Cool Setpoint" },
                    { tag: "field", name: "Both", description: "Adjust Heat Setpoint and Cool Setpoint" }
                ]
            },

            {
                tag: "datatype", name: "ControlSequenceOfOperationEnum", xref: "cluster§4.3.8.20",

                details: "> [!NOTE]" +
                    "\n" +
                    "> CoolingAndHeating" +
                    "\n" +
                    "A thermostat indicating it supports CoolingAndHeating (or CoolingAndHeatingWithReheat) SHOULD be " +
                    "able to request heating or cooling on demand and will usually support the Auto SystemMode." +
                    "\n" +
                    "Systems which support cooling or heating, requiring external intervention to change modes or where " +
                    "the whole building must be in the same mode, SHOULD report CoolingOnly or HeatingOnly based on the " +
                    "current capability.",

                children: [
                    { tag: "field", name: "CoolingOnly", description: "Heat and Emergency are not possible" },
                    { tag: "field", name: "CoolingWithReheat", description: "Heat and Emergency are not possible" },
                    { tag: "field", name: "HeatingOnly", description: "Cool and precooling (see Terms) are not possible" },
                    { tag: "field", name: "HeatingWithReheat", description: "Cool and precooling are not possible" },
                    { tag: "field", name: "CoolingAndHeating", description: "All modes are possible" },
                    { tag: "field", name: "CoolingAndHeatingWithReheat", description: "All modes are possible" }
                ]
            },

            {
                tag: "datatype", name: "PresetScenarioEnum", xref: "cluster§4.3.8.21",

                children: [
                    {
                        tag: "field", name: "Occupied", description: "The thermostat-controlled area is occupied",
                        xref: "cluster§4.3.8.21.2",
                        details: "This value shall indicate the preset for periods when the thermostat’s temperature-controlled area " +
                            "is occupied. It is intended for thermostats that can automatically determine occupancy."
                    },

                    {
                        tag: "field", name: "Unoccupied", description: "The thermostat-controlled area is unoccupied",
                        xref: "cluster§4.3.8.21.3",
                        details: "This value shall indicate the preset for periods when the thermostat’s temperature-controlled area " +
                            "is unoccupied. It is intended for thermostats that can automatically determine occupancy."
                    },

                    {
                        tag: "field", name: "Sleep", description: "Users are likely to be sleeping",
                        xref: "cluster§4.3.8.21.4",
                        details: "This value shall indicate the preset for periods when users are likely to be asleep."
                    },
                    {
                        tag: "field", name: "Wake", description: "Users are likely to be waking up",
                        xref: "cluster§4.3.8.21.5",
                        details: "This value shall indicate the preset for periods when users are likely to be waking up."
                    },
                    {
                        tag: "field", name: "Vacation", description: "Users are on vacation", xref: "cluster§4.3.8.21.6",
                        details: "This value shall indicate the preset for periods when users are on vacation, or otherwise " +
                            "out-of-home for extended periods of time."
                    },
                    {
                        tag: "field", name: "GoingToSleep", description: "Users are likely to be going to sleep",
                        xref: "cluster§4.3.8.21.7",
                        details: "This value shall indicate the preset for periods when users are likely to be going to sleep."
                    },
                    {
                        tag: "field", name: "UserDefined", description: "Custom presets", xref: "cluster§4.3.8.21.8",
                        details: "This value shall indicate a free-form preset; when set, the Name field on PresetStruct shall NOT be " +
                            "null."
                    }
                ]
            },

            {
                tag: "datatype", name: "SetpointChangeSourceEnum", xref: "cluster§4.3.8.22",

                children: [
                    {
                        tag: "field", name: "Manual",
                        description: "Manual, user-initiated setpoint change via the thermostat"
                    },
                    {
                        tag: "field", name: "Schedule",
                        description: "Schedule/internal programming-initiated setpoint change"
                    },
                    {
                        tag: "field", name: "External",
                        description: "Externally-initiated setpoint change (e.g., DRLC cluster command, attribute write)"
                    }
                ]
            },

            { tag: "datatype", name: "StartOfWeekEnum", xref: "cluster§4.3.8.23" },

            {
                tag: "datatype", name: "SystemModeEnum", xref: "cluster§4.3.8.24",
                details: "Table 9. Interpretation of Heat, Cool and Auto SystemModeEnum Values",

                children: [
                    {
                        tag: "field", name: "Off",
                        description: "The Thermostat does not generate demand for Cooling or Heating"
                    },
                    {
                        tag: "field", name: "Auto",
                        description: "Demand is generated for either Cooling or Heating, as required"
                    },
                    { tag: "field", name: "Cool", description: "Demand is only generated for Cooling" },
                    { tag: "field", name: "Heat", description: "Demand is only generated for Heating" },
                    {
                        tag: "field", name: "EmergencyHeat",
                        description: "2nd stage heating is in use to achieve desired temperature"
                    },
                    { tag: "field", name: "Precooling", description: "(see Terms)" }
                ]
            },

            {
                tag: "datatype", name: "ThermostatRunningModeEnum", xref: "cluster§4.3.8.25",

                children: [
                    {
                        tag: "field", name: "Off",
                        description: "The Thermostat does not generate demand for Cooling or Heating"
                    },
                    { tag: "field", name: "Cool", description: "Demand is only generated for Cooling" },
                    { tag: "field", name: "Heat", description: "Demand is only generated for Heating" }
                ]
            },

            {
                tag: "datatype", name: "TemperatureSetpointHoldEnum", xref: "cluster§4.3.8.26",

                children: [
                    { tag: "field", name: "SetpointHoldOff", description: "Follow scheduling program" },
                    {
                        tag: "field", name: "SetpointHoldOn",
                        description: "Maintain current setpoint, regardless of schedule transitions"
                    }
                ]
            },

            {
                tag: "datatype", name: "PresetStruct", xref: "cluster§4.3.8.27",

                children: [
                    {
                        tag: "field", name: "PresetHandle", xref: "cluster§4.3.8.27.1",

                        details: "This field shall indicate a device generated identifier for this preset. It shall be unique on the " +
                            "device, and shall NOT be reused after the associated preset has been deleted." +
                            "\n" +
                            "This field shall only be null when the encompassing PresetStruct is appended to the Presets " +
                            "attribute for the purpose of creating a new Preset. Refer to Presets for the creation of Preset " +
                            "handles."
                    },

                    {
                        tag: "field", name: "PresetScenario", xref: "cluster§4.3.8.27.2",
                        details: "This field shall indicate the associated PresetScenarioEnum value for this preset."
                    },

                    {
                        tag: "field", name: "Name", xref: "cluster§4.3.8.27.3",
                        details: "This field shall indicate a name provided by a user. The null value shall indicate no name." +
                            "\n" +
                            "Within each subset of presets sharing the same PresetScenario field value, there shall NOT be any " +
                            "presets with the same value, including null as a value, in the Name field."
                    },

                    {
                        tag: "field", name: "CoolingSetpoint", xref: "cluster§4.3.8.27.4",
                        details: "This field shall indicate the cooling setpoint for the preset. Refer to Setpoint Limits for value " +
                            "constraints."
                    },
                    {
                        tag: "field", name: "HeatingSetpoint", xref: "cluster§4.3.8.27.5",
                        details: "This field shall indicate the heating setpoint for the preset. Refer to Setpoint Limits for value " +
                            "constraints."
                    },
                    {
                        tag: "field", name: "BuiltIn", xref: "cluster§4.3.8.27.6",
                        details: "This field shall indicate whether the preset is marked as \"built-in\", meaning that it can be " +
                            "modified, but it cannot be deleted."
                    }
                ]
            },

            {
                tag: "datatype", name: "PresetTypeStruct", xref: "cluster§4.3.8.28",

                children: [
                    {
                        tag: "field", name: "PresetScenario", xref: "cluster§4.3.8.28.1",
                        details: "This field shall specify a PresetScenarioEnum value supported by this thermostat."
                    },
                    {
                        tag: "field", name: "NumberOfPresets", xref: "cluster§4.3.8.28.2",
                        details: "This field shall specify a limit for the number of presets for this PresetScenarioEnum."
                    },
                    {
                        tag: "field", name: "PresetTypeFeatures", xref: "cluster§4.3.8.28.3",
                        details: "This field shall specify a bitmap of features for this PresetTypeStruct."
                    }
                ]
            },

            {
                tag: "datatype", name: "WeeklyScheduleTransitionStruct", xref: "cluster§4.3.8.29",
                details: "This represents a single transition in a Thermostat schedule",

                children: [
                    {
                        tag: "field", name: "TransitionTime", xref: "cluster§4.3.8.29.1",
                        details: "This field shall represent the start time of the schedule transition during the associated day. The " +
                            "time will be represented by a 16 bits unsigned integer to designate the minutes since midnight. For " +
                            "example, 6am will be represented by 360 minutes since midnight and 11:30pm will be represented by " +
                            "1410 minutes since midnight."
                    },

                    {
                        tag: "field", name: "HeatSetpoint", xref: "cluster§4.3.8.29.2",
                        details: "This field shall represent the heat setpoint to be applied at this associated transition start time."
                    },
                    {
                        tag: "field", name: "CoolSetpoint", xref: "cluster§4.3.8.29.3",
                        details: "This field shall represent the cool setpoint to be applied at this associated transition start time."
                    }
                ]
            },

            {
                tag: "datatype", name: "ScheduleStruct", xref: "cluster§4.3.8.30",

                children: [
                    {
                        tag: "field", name: "ScheduleHandle", xref: "cluster§4.3.8.30.1",

                        details: "This field shall indicate a device generated identifier for this schedule. It shall be unique on the " +
                            "device, and shall NOT be reused after the associated schedule has been deleted." +
                            "\n" +
                            "This field shall only be null when the encompassing ScheduleStruct is appended to the Schedules " +
                            "attribute for the purpose of creating a new Schedule. Refer to Schedules for the creation of " +
                            "Schedule handles."
                    },

                    {
                        tag: "field", name: "SystemMode", xref: "cluster§4.3.8.30.2",
                        details: "This field shall specify the default thermostat system mode for transitions in this schedule. The " +
                            "only valid values for this field shall be Auto, Heat, and Cool."
                    },
                    {
                        tag: "field", name: "Name", xref: "cluster§4.3.8.30.3",
                        details: "This field shall specify a name for the ScheduleStruct."
                    },
                    {
                        tag: "field", name: "PresetHandle", xref: "cluster§4.3.8.30.4",
                        details: "This field shall indicate the default PresetHandle value for transitions in this schedule."
                    },

                    {
                        tag: "field", name: "Transitions", xref: "cluster§4.3.8.30.5",

                        details: "This field shall specify a list of transitions for the schedule." +
                            "\n" +
                            "This field shall NOT contain more than one ScheduleStruct with the same TransitionTime field and " +
                            "overlapping DayOfWeek fields; i.e. there shall be no duplicate transitions." +
                            "\n" +
                            "If the NumberOfScheduleTransitionsPerDay attribute is not null, then for each bit in " +
                            "ScheduleDayOfWeekBitmap, the number of transitions with that bit set in DayOfWeek shall NOT be " +
                            "greater than the value of the NumberOfScheduleTransitionsPerDay attribute." +
                            "\n" +
                            "For the purposes of determining which ScheduleStruct in this list is currently active, the current " +
                            "time shall be the number of minutes past midnight in the display value of the current time, not the " +
                            "actual number of minutes that have elapsed since midnight. On days which transition into or out of " +
                            "daylight saving time, certain values may repeat or not occur during the transition period." +
                            "\n" +
                            "A ScheduleTransitionStruct in this list shall be active if the current day of the week matches its " +
                            "DayOfWeek field and the current time is greater than or equal to the TransitionTime, but less than " +
                            "the TransitionTime on any other ScheduleTransitionStruct in the Transitions field whose DayOfWeek " +
                            "field also matches the current day of the week." +
                            "\n" +
                            "If the current time is less than every ScheduleTransitionStruct whose DayOfWeek field also matches " +
                            "the current day of the week, the server shall attempt the same process to identify the active " +
                            "ScheduleTransitionStruct for the day preceding the previously attempted day of the week, repeating " +
                            "until an active ScheduleTransitionStruct is found or the attempted day is the current day of the " +
                            "week again. If no active ScheduleTransitionStruct is found, then the active ScheduleTransitionStruct " +
                            "shall be the ScheduleTransitionStruct with the largest TransitionTime field from the set of " +
                            "ScheduleTransitionStructs whose DayOfWeek field matches the current day of the week."
                    },

                    {
                        tag: "field", name: "BuiltIn", xref: "cluster§4.3.8.30.6",
                        details: "This field shall indicate whether the schedule is marked as \"built-in\", meaning that it can be " +
                            "modified, but it cannot be deleted."
                    }
                ]
            },

            {
                tag: "datatype", name: "ScheduleTransitionStruct", xref: "cluster§4.3.8.31",

                details: "This struct provides a time of day and a set of days of the week for a state transition within a " +
                    "schedule. The thermostat shall use the following order of precedence for determining a new setpoint " +
                    "at the time of transition:" +
                    "\n" +
                    "  1. If the PresetHandle field is provided, then the setpoint for the PresetStruct in the Presets " +
                    "     attribute with that identifier shall be used" +
                    "\n" +
                    "  2. If either the HeatingSetpoint or CoolingSetpoint is provided, then it shall be used" +
                    "\n" +
                    "    a. If the SystemMode field is provided, the HeatingSetpoint and CoolingSetpoint fields shall be " +
                    "       interpreted using the SystemMode field" +
                    "\n" +
                    "    b. If the SystemMode field is not provided, the HeatingSetpoint and CoolingSetpoint fields shall " +
                    "       be interpreted using the SystemMode field on the parent ScheduleStruct" +
                    "\n" +
                    "  3. If neither the PresetHandle field or any Setpoint field is provided, then the PresetHandle " +
                    "     field on the parent ScheduleStruct shall be used to determine the active PresetStruct" +
                    "\n" +
                    "  4. If the PresetHandle is not indicated and no setpoint is provided for the current SystemMode, " +
                    "     the server shall use a default value for the current SystemMode." +
                    "\n" +
                    "If the setpoint was derived from a preset, then the ActivePresetHandle shall be set to the " +
                    "PresetHandle of that preset." +
                    "\n" +
                    "If a CoolingSetpoint was used to determine the cooling setpoint:" +
                    "\n" +
                    "  • If the server supports the OCC feature, and the Occupied bit is not set on the Occupancy " +
                    "    attribute, then the UnoccupiedCoolingSetpoint attribute shall be set to the CoolingSetpoint" +
                    "\n" +
                    "  • Otherwise, the OccupiedCoolingSetpoint attribute shall be set to the CoolingSetpoint If a " +
                    "    HeatingSetpoint was used to determine the heating setpoint:" +
                    "\n" +
                    "  • If the server supports the OCC feature, and the Occupied bit is not set on the Occupancy " +
                    "    attribute, then the UnoccupiedHeatingSetpoint attribute shall be set to the HeatingSetpoint" +
                    "\n" +
                    "  • Otherwise, the OccupiedHeatingSetpoint attribute shall be set to the HeatingSetpoint The " +
                    "    ScheduleTransitionStruct shall be invalid if all the following are true:" +
                    "\n" +
                    "  • The HeatingSetpoint field is not provided" +
                    "\n" +
                    "  • The PresetHandle field is not provided" +
                    "\n" +
                    "  • The PresetHandle field on the encompassing ScheduleStruct is not provided" +
                    "\n" +
                    "  • The SystemMode field is provided and has the value Heat or Auto, or the SystemMode field on the " +
                    "    parent ScheduleStruct has the value Heat or Auto The ScheduleTransitionStruct shall be invalid " +
                    "    if all the following are true:" +
                    "\n" +
                    "  • The CoolingSetpoint field is not provided" +
                    "\n" +
                    "  • The PresetHandle field is not provided" +
                    "\n" +
                    "  • The PresetHandle field on the encompassing ScheduleStruct is not provided" +
                    "\n" +
                    "  • The SystemMode field is provided and has the value Cool or Auto, or the SystemMode field on the " +
                    "    parent ScheduleStruct has the value Cool or Auto",

                children: [
                    {
                        tag: "field", name: "DayOfWeek", xref: "cluster§4.3.8.31.1",
                        details: "This field shall specify a bitmask of days of the week that the transition applies to. The Vacation " +
                            "bit shall NOT be set; vacation schedules shall be set via the vacation preset."
                    },

                    {
                        tag: "field", name: "TransitionTime", xref: "cluster§4.3.8.31.2",
                        details: "This shall specify the time of day at which the transition becomes active, in terms of minutes " +
                            "within the day representing the wall clock, where 0 is 00:00:00, 1 is 00:01:00 and 1439 is 23:59:00." +
                            "\n" +
                            "Handling of transitions during the changeover of Daylight Saving Time is implementation-dependent."
                    },

                    {
                        tag: "field", name: "PresetHandle", xref: "cluster§4.3.8.31.3",
                        details: "This field shall specify the preset used at the TransitionTime. If this field is provided, then the " +
                            "SystemMode, CoolingSetpoint and HeatingSetpoint fields shall NOT be provided."
                    },

                    {
                        tag: "field", name: "SystemMode", xref: "cluster§4.3.8.31.4",
                        details: "This shall specify the default mode to which the thermostat will switch for this transition, " +
                            "overriding the default for the schedule. The only valid values for this field shall be Auto, Heat, " +
                            "Cool and Off. This field shall only be included when the required system mode differs from the " +
                            "schedule’s default SystemMode."
                    },

                    {
                        tag: "field", name: "CoolingSetpoint", xref: "cluster§4.3.8.31.5",
                        details: "This field shall specify the cooling setpoint for the transition. If PresetHandle is set, this field " +
                            "shall NOT be included. Refer to Setpoint Limits for value constraints."
                    },
                    {
                        tag: "field", name: "HeatingSetpoint", xref: "cluster§4.3.8.31.6",
                        details: "This field shall specify the cooling setpoint for the transition. If PresetHandle is set, this field " +
                            "shall NOT be included. Refer to Setpoint Limits for value constraints."
                    }
                ]
            },

            {
                tag: "datatype", name: "ScheduleTypeStruct", xref: "cluster§4.3.8.32",

                children: [
                    {
                        tag: "field", name: "SystemMode", xref: "cluster§4.3.8.32.1",
                        details: "This field shall specify a SystemModeEnum supported by this thermostat for Schedules. The only valid " +
                            "values for this field shall be Auto, Heat, and Cool."
                    },
                    {
                        tag: "field", name: "NumberOfSchedules", xref: "cluster§4.3.8.32.2",
                        details: "This field shall specify a limit for the number of Schedules for this SystemMode."
                    },
                    {
                        tag: "field", name: "ScheduleTypeFeatures", xref: "cluster§4.3.8.32.3",
                        details: "This field shall specify a bitmap of features for this schedule entry. At least one of " +
                            "SupportsPresets and SupportsSetpoints shall be set."
                    }
                ]
            }
        ]
    }
);
