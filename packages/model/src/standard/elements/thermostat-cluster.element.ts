/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const Thermostat = Cluster(
    { name: "Thermostat", id: 0x201 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 9 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "HEAT", conformance: "AUTO, O.a+", constraint: "0", title: "Heating" }),
        Field({ name: "COOL", conformance: "AUTO, O.a+", constraint: "1", title: "Cooling" }),
        Field({ name: "OCC", conformance: "O", constraint: "2", title: "Occupancy" }),
        Field({ name: "SCH", conformance: "O", constraint: "3", title: "ScheduleConfiguration" }),
        Field({ name: "SB", conformance: "O", constraint: "4", title: "Setback" }),
        Field({ name: "AUTO", conformance: "O", constraint: "5", title: "AutoMode" }),
        Field({ name: "LTNE", conformance: "O", constraint: "6", title: "LocalTemperatureNotExposed" }),
        Field({ name: "MSCH", conformance: "O", constraint: "7", title: "MatterScheduleConfiguration" }),
        Field({ name: "PRES", conformance: "O", constraint: "8", title: "Presets" })
    ),

    Attribute({ name: "LocalTemperature", id: 0x0, type: "temperature", access: "R V", conformance: "M", quality: "X P" }),
    Attribute({
        name: "OutdoorTemperature", id: 0x1, type: "temperature", access: "R V", conformance: "O",
        default: null, quality: "X"
    }),
    Attribute({ name: "Occupancy", id: 0x2, type: "OccupancyBitmap", access: "R V", conformance: "OCC", default: 1 }),
    Attribute({
        name: "AbsMinHeatSetpointLimit", id: 0x3, type: "temperature", access: "R V", conformance: "[HEAT]",
        constraint: "desc", default: { type: "celsius", value: 7 }, quality: "F"
    }),
    Attribute({
        name: "AbsMaxHeatSetpointLimit", id: 0x4, type: "temperature", access: "R V", conformance: "[HEAT]",
        constraint: "desc", default: { type: "celsius", value: 30 }, quality: "F"
    }),
    Attribute({
        name: "AbsMinCoolSetpointLimit", id: 0x5, type: "temperature", access: "R V", conformance: "[COOL]",
        constraint: "desc", default: { type: "celsius", value: 16 }, quality: "F"
    }),
    Attribute({
        name: "AbsMaxCoolSetpointLimit", id: 0x6, type: "temperature", access: "R V", conformance: "[COOL]",
        constraint: "desc", default: { type: "celsius", value: 32 }, quality: "F"
    }),
    Attribute({
        name: "PiCoolingDemand", id: 0x7, type: "uint8", access: "R V", conformance: "[COOL]",
        constraint: "0% to 100%", quality: "P"
    }),
    Attribute({
        name: "PiHeatingDemand", id: 0x8, type: "uint8", access: "R V", conformance: "[HEAT]",
        constraint: "0% to 100%", quality: "P"
    }),
    Attribute({
        name: "HvacSystemTypeConfiguration", id: 0x9, type: "HVACSystemTypeBitmap", access: "R[W] VM",
        conformance: "D", constraint: "desc", default: 0, quality: "N"
    }),
    Attribute({
        name: "LocalTemperatureCalibration", id: 0x10, type: "SignedTemperature", access: "RW VM",
        conformance: "[!LTNE]", default: { type: "celsius", value: 0 }, quality: "N"
    }),
    Attribute({
        name: "OccupiedCoolingSetpoint", id: 0x11, type: "temperature", access: "RW VO",
        conformance: "COOL", constraint: "desc", default: { type: "celsius", value: 26 }, quality: "N"
    }),
    Attribute({
        name: "OccupiedHeatingSetpoint", id: 0x12, type: "temperature", access: "RW VO",
        conformance: "HEAT", constraint: "desc", default: { type: "celsius", value: 20 }, quality: "N"
    }),
    Attribute({
        name: "UnoccupiedCoolingSetpoint", id: 0x13, type: "temperature", access: "RW VO",
        conformance: "COOL & OCC", constraint: "desc", default: { type: "celsius", value: 26 },
        quality: "N"
    }),
    Attribute({
        name: "UnoccupiedHeatingSetpoint", id: 0x14, type: "temperature", access: "RW VO",
        conformance: "HEAT & OCC", constraint: "desc", default: { type: "celsius", value: 20 },
        quality: "N"
    }),
    Attribute({
        name: "MinHeatSetpointLimit", id: 0x15, type: "temperature", access: "RW VM", conformance: "[HEAT]",
        constraint: "desc", default: { type: "reference", name: "AbsMinHeatSetpointLimit" }, quality: "N"
    }),
    Attribute({
        name: "MaxHeatSetpointLimit", id: 0x16, type: "temperature", access: "RW VM", conformance: "[HEAT]",
        constraint: "desc", default: { type: "reference", name: "AbsMaxHeatSetpointLimit" }, quality: "N"
    }),
    Attribute({
        name: "MinCoolSetpointLimit", id: 0x17, type: "temperature", access: "RW VM", conformance: "[COOL]",
        constraint: "desc", default: { type: "reference", name: "AbsMinCoolSetpointLimit" }, quality: "N"
    }),
    Attribute({
        name: "MaxCoolSetpointLimit", id: 0x18, type: "temperature", access: "RW VM", conformance: "[COOL]",
        constraint: "desc", default: { type: "reference", name: "AbsMaxCoolSetpointLimit" }, quality: "N"
    }),
    Attribute({
        name: "MinSetpointDeadBand", id: 0x19, type: "SignedTemperature", access: "R[W] VM",
        conformance: "AUTO", constraint: "0 to 12.7°C", default: { type: "celsius", value: 2 },
        quality: "N"
    }),
    Attribute({
        name: "RemoteSensing", id: 0x1a, type: "RemoteSensingBitmap", access: "RW VM", conformance: "O",
        default: 0, quality: "N"
    }),
    Attribute({
        name: "ControlSequenceOfOperation", id: 0x1b, type: "ControlSequenceOfOperationEnum",
        access: "RW VM", conformance: "M", constraint: "desc", quality: "N"
    }),
    Attribute({
        name: "SystemMode", id: 0x1c, type: "SystemModeEnum", access: "RW VM", conformance: "M",
        constraint: "desc", quality: "N"
    }),
    Attribute({
        name: "ThermostatRunningMode", id: 0x1e, type: "ThermostatRunningModeEnum", access: "R V",
        conformance: "[AUTO]", constraint: "desc", default: 0
    }),
    Attribute({
        name: "StartOfWeek", id: 0x20, type: "StartOfWeekEnum", access: "R V", conformance: "SCH",
        constraint: "desc", quality: "F"
    }),
    Attribute({
        name: "NumberOfWeeklyTransitions", id: 0x21, type: "uint8", access: "R V", conformance: "SCH",
        default: 0, quality: "F"
    }),
    Attribute({
        name: "NumberOfDailyTransitions", id: 0x22, type: "uint8", access: "R V", conformance: "SCH",
        default: 0, quality: "F"
    }),
    Attribute({
        name: "TemperatureSetpointHold", id: 0x23, type: "TemperatureSetpointHoldEnum", access: "RW VM",
        conformance: "O", constraint: "desc", default: 0, quality: "N"
    }),
    Attribute({
        name: "TemperatureSetpointHoldDuration", id: 0x24, type: "uint16", access: "RW VM",
        conformance: "O", constraint: "max 1440", default: null, quality: "X N"
    }),
    Attribute({
        name: "ThermostatProgrammingOperationMode", id: 0x25, type: "ProgrammingOperationModeBitmap",
        access: "RW VM", conformance: "O", constraint: "desc", default: 0, quality: "P"
    }),
    Attribute({
        name: "ThermostatRunningState", id: 0x29, type: "RelayStateBitmap", access: "R V", conformance: "O",
        constraint: "desc"
    }),
    Attribute({
        name: "SetpointChangeSource", id: 0x30, type: "SetpointChangeSourceEnum", access: "R V",
        conformance: "O", constraint: "desc", default: 0
    }),
    Attribute({
        name: "SetpointChangeAmount", id: 0x31, type: "TemperatureDifference", access: "R V",
        conformance: "O", default: null, quality: "X"
    }),
    Attribute({ name: "SetpointChangeSourceTimestamp", id: 0x32, type: "epoch-s", access: "R V", conformance: "O", default: 0 }),
    Attribute({
        name: "OccupiedSetback", id: 0x34, type: "UnsignedTemperature", access: "RW VM", conformance: "SB",
        constraint: "occupiedSetbackMin to occupiedSetbackMax", default: null, quality: "X N"
    }),
    Attribute({
        name: "OccupiedSetbackMin", id: 0x35, type: "UnsignedTemperature", access: "R V", conformance: "SB",
        constraint: "max occupiedSetbackMax", default: null, quality: "X F"
    }),
    Attribute({
        name: "OccupiedSetbackMax", id: 0x36, type: "UnsignedTemperature", access: "R V", conformance: "SB",
        constraint: "occupiedSetbackMin to 25.4°C", default: null, quality: "X F"
    }),
    Attribute({
        name: "UnoccupiedSetback", id: 0x37, type: "UnsignedTemperature", access: "RW VM",
        conformance: "SB & OCC", constraint: "unoccupiedSetbackMin to unoccupiedSetbackMax", default: null,
        quality: "X N"
    }),
    Attribute({
        name: "UnoccupiedSetbackMin", id: 0x38, type: "UnsignedTemperature", access: "R V",
        conformance: "SB & OCC", constraint: "max unoccupiedSetbackMax", default: null, quality: "X F"
    }),
    Attribute({
        name: "UnoccupiedSetbackMax", id: 0x39, type: "UnsignedTemperature", access: "R V",
        conformance: "SB & OCC", constraint: "unoccupiedSetbackMin to 25.4°C", default: null,
        quality: "X F"
    }),
    Attribute({
        name: "EmergencyHeatDelta", id: 0x3a, type: "UnsignedTemperature", access: "RW VM",
        conformance: "O", default: { type: "celsius", value: 25 }, quality: "N"
    }),
    Attribute({
        name: "AcType", id: 0x40, type: "ACTypeEnum", access: "RW VM", conformance: "O", constraint: "desc",
        default: 0, quality: "N"
    }),
    Attribute(
        { name: "AcCapacity", id: 0x41, type: "uint16", access: "RW VM", conformance: "O", default: 0, quality: "N" }
    ),
    Attribute({
        name: "AcRefrigerantType", id: 0x42, type: "ACRefrigerantTypeEnum", access: "RW VM",
        conformance: "O", constraint: "desc", default: 0, quality: "N"
    }),
    Attribute({
        name: "AcCompressorType", id: 0x43, type: "ACCompressorTypeEnum", access: "RW VM", conformance: "O",
        constraint: "desc", default: 0, quality: "N"
    }),
    Attribute({ name: "AcErrorCode", id: 0x44, type: "ACErrorCodeBitmap", access: "RW VM", conformance: "O", default: 0 }),
    Attribute({
        name: "AcLouverPosition", id: 0x45, type: "ACLouverPositionEnum", access: "RW VM", conformance: "O",
        constraint: "desc", default: 0, quality: "N"
    }),
    Attribute({
        name: "AcCoilTemperature", id: 0x46, type: "temperature", access: "R V", conformance: "O",
        default: null, quality: "X"
    }),
    Attribute({
        name: "AcCapacityFormat", id: 0x47, type: "ACCapacityFormatEnum", access: "RW VM", conformance: "O",
        constraint: "desc", default: 0, quality: "N"
    }),

    Attribute(
        {
            name: "PresetTypes", id: 0x48, type: "list", access: "R V", conformance: "PRES", constraint: "desc",
            quality: "F"
        },
        Field({ name: "entry", type: "PresetTypeStruct" })
    ),

    Attribute(
        {
            name: "ScheduleTypes", id: 0x49, type: "list", access: "R V", conformance: "MSCH",
            constraint: "desc", quality: "F"
        },
        Field({ name: "entry", type: "ScheduleTypeStruct" })
    ),

    Attribute({ name: "NumberOfPresets", id: 0x4a, type: "uint8", access: "R V", conformance: "PRES", default: 0, quality: "F" }),
    Attribute({
        name: "NumberOfSchedules", id: 0x4b, type: "uint8", access: "R V", conformance: "MSCH", default: 0,
        quality: "F"
    }),
    Attribute({
        name: "NumberOfScheduleTransitions", id: 0x4c, type: "uint8", access: "R V", conformance: "MSCH",
        default: 0, quality: "F"
    }),
    Attribute({
        name: "NumberOfScheduleTransitionPerDay", id: 0x4d, type: "uint8", access: "R V",
        conformance: "MSCH", default: null, quality: "X F"
    }),
    Attribute({
        name: "ActivePresetHandle", id: 0x4e, type: "octstr", access: "R V", conformance: "PRES",
        constraint: "max 16", default: null, quality: "X N"
    }),
    Attribute({
        name: "ActiveScheduleHandle", id: 0x4f, type: "octstr", access: "R V", conformance: "MSCH",
        constraint: "max 16", default: null, quality: "X N"
    }),

    Attribute(
        {
            name: "Presets", id: 0x50, type: "list", access: "RW VM", conformance: "PRES",
            constraint: "max numberOfPresets", default: [], quality: "N T"
        },
        Field({ name: "entry", type: "PresetStruct" })
    ),

    Attribute(
        {
            name: "Schedules", id: 0x51, type: "list", access: "RW VM", conformance: "MSCH", constraint: "desc",
            default: [], quality: "N T"
        },
        Field({ name: "entry", type: "ScheduleStruct" })
    ),

    Attribute({
        name: "SetpointHoldExpiryTimestamp", id: 0x52, type: "epoch-s", access: "R V", conformance: "O",
        default: null, quality: "X N"
    }),

    Command(
        {
            name: "SetpointRaiseLower", id: 0x0, access: "O", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "Mode", id: 0x0, type: "SetpointRaiseLowerModeEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "Amount", id: 0x1, type: "int8", conformance: "M" })
    ),

    Command(
        {
            name: "SetWeeklySchedule", id: 0x1, access: "M", conformance: "SCH", direction: "request",
            response: "status"
        },
        Field({ name: "NumberOfTransitionsForSequence", id: 0x0, type: "uint8", conformance: "M" }),
        Field({
            name: "DayOfWeekForSequence", id: 0x1, type: "ScheduleDayOfWeekBitmap", conformance: "M",
            constraint: "desc"
        }),
        Field({ name: "ModeForSequence", id: 0x2, type: "ScheduleModeBitmap", conformance: "M", constraint: "desc" }),
        Field(
            { name: "Transitions", id: 0x3, type: "list", conformance: "M", constraint: "max 10" },
            Field({ name: "entry", type: "WeeklyScheduleTransitionStruct" })
        )
    ),

    Command(
        {
            name: "GetWeeklySchedule", id: 0x2, access: "O", conformance: "SCH", direction: "request",
            response: "GetWeeklyScheduleResponse"
        },
        Field({ name: "DaysToReturn", id: 0x0, type: "ScheduleDayOfWeekBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "ModeToReturn", id: 0x1, type: "ScheduleModeBitmap", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "GetWeeklyScheduleResponse", id: 0x0, conformance: "SCH", direction: "response" },
        Field({ name: "NumberOfTransitionsForSequence", id: 0x0, type: "uint8", conformance: "M" }),
        Field({
            name: "DayOfWeekForSequence", id: 0x1, type: "ScheduleDayOfWeekBitmap", conformance: "M",
            constraint: "desc"
        }),
        Field({ name: "ModeForSequence", id: 0x2, type: "ScheduleModeBitmap", conformance: "M", constraint: "desc" }),
        Field(
            { name: "Transitions", id: 0x3, type: "list", conformance: "M", constraint: "max 10" },
            Field({ name: "entry", type: "WeeklyScheduleTransitionStruct" })
        )
    ),

    Command({ name: "ClearWeeklySchedule", id: 0x3, access: "M", conformance: "SCH", direction: "request", response: "status" }),

    Command(
        { name: "GetRelayStatusLogResponse", id: 0x1, conformance: "GetRelayStatusLog", direction: "response" },
        Field({ name: "TimeOfDay", id: 0x0, type: "uint16", conformance: "M", constraint: "max 1439" }),
        Field({ name: "RelayStatus", id: 0x1, type: "RelayStateBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "LocalTemperature", id: 0x2, type: "temperature", conformance: "M", quality: "X" }),
        Field({
            name: "HumidityInPercentage", id: 0x3, type: "uint8", conformance: "M", constraint: "0% to 100%",
            quality: "X"
        }),
        Field({ name: "Setpoint", id: 0x4, type: "temperature", conformance: "M" }),
        Field({ name: "UnreadEntries", id: 0x5, type: "uint16", conformance: "M" })
    ),

    Command(
        {
            name: "SetActiveScheduleRequest", id: 0x5, access: "O", conformance: "MSCH", direction: "request",
            response: "status"
        },
        Field({ name: "ScheduleHandle", id: 0x0, type: "octstr", conformance: "M", constraint: "max 16" })
    ),

    Command(
        {
            name: "SetActivePresetRequest", id: 0x6, access: "O", conformance: "PRES", direction: "request",
            response: "status"
        },
        Field({ name: "PresetHandle", id: 0x0, type: "octstr", conformance: "M", constraint: "max 16", quality: "X" })
    ),

    Datatype({ name: "TemperatureDifference", type: "int16" }),
    Datatype({ name: "SignedTemperature", type: "int8" }),
    Datatype({ name: "UnsignedTemperature", type: "uint8" }),

    Datatype(
        { name: "ACErrorCodeBitmap", type: "map32" },
        Field({ name: "CompressorFail", constraint: "0" }),
        Field({ name: "RoomSensorFail", constraint: "1" }),
        Field({ name: "OutdoorSensorFail", constraint: "2" }),
        Field({ name: "CoilSensorFail", constraint: "3" }),
        Field({ name: "FanFail", constraint: "4" })
    ),

    Datatype(
        { name: "HVACSystemTypeBitmap", type: "map8" },
        Field({ name: "CoolingStage", constraint: "0 to 1" }),
        Field({ name: "HeatingStage", constraint: "2 to 3" }),
        Field({ name: "HeatingIsHeatPump", constraint: "4" }),
        Field({ name: "HeatingUsesFuel", constraint: "5" })
    ),

    Datatype({ name: "OccupancyBitmap", type: "map8" }, Field({ name: "Occupied", constraint: "0" })),
    Datatype(
        { name: "PresetTypeFeaturesBitmap", type: "map16" },
        Field({ name: "Automatic", constraint: "0" }),
        Field({ name: "SupportsNames", constraint: "1" })
    ),

    Datatype(
        { name: "ProgrammingOperationModeBitmap", type: "map8" },
        Field({ name: "ScheduleActive", constraint: "0" }),
        Field({ name: "AutoRecovery", constraint: "1" }),
        Field({ name: "Economy", constraint: "2" })
    ),

    Datatype(
        { name: "RelayStateBitmap", type: "map16" },
        Field({ name: "Heat", constraint: "0" }),
        Field({ name: "Cool", constraint: "1" }),
        Field({ name: "Fan", constraint: "2" }),
        Field({ name: "HeatStage2", constraint: "3" }),
        Field({ name: "CoolStage2", constraint: "4" }),
        Field({ name: "FanStage2", constraint: "5" }),
        Field({ name: "FanStage3", constraint: "6" })
    ),

    Datatype(
        { name: "RemoteSensingBitmap", type: "map8" },
        Field({ name: "LocalTemperature", constraint: "0" }),
        Field({ name: "OutdoorTemperature", constraint: "1" }),
        Field({ name: "Occupancy", constraint: "2" })
    ),

    Datatype(
        { name: "ScheduleTypeFeaturesBitmap", type: "map16" },
        Field({ name: "SupportsPresets", constraint: "0" }),
        Field({ name: "SupportsSetpoints", constraint: "1" }),
        Field({ name: "SupportsNames", constraint: "2" }),
        Field({ name: "SupportsOff", constraint: "3" })
    ),

    Datatype(
        { name: "ScheduleDayOfWeekBitmap", type: "map8" },
        Field({ name: "Sunday", constraint: "0" }),
        Field({ name: "Monday", constraint: "1" }),
        Field({ name: "Tuesday", constraint: "2" }),
        Field({ name: "Wednesday", constraint: "3" }),
        Field({ name: "Thursday", constraint: "4" }),
        Field({ name: "Friday", constraint: "5" }),
        Field({ name: "Saturday", constraint: "6" }),
        Field({ name: "Away", constraint: "7" })
    ),

    Datatype(
        { name: "ScheduleModeBitmap", type: "map8" },
        Field({ name: "HeatSetpointPresent", constraint: "0" }),
        Field({ name: "CoolSetpointPresent", constraint: "1" })
    ),
    Datatype({ name: "ACCapacityFormatEnum", type: "enum8" }, Field({ name: "BtUh", id: 0x0, conformance: "O" })),

    Datatype(
        { name: "ACCompressorTypeEnum", type: "enum8" },
        Field({ name: "Unknown", id: 0x0, conformance: "O" }),
        Field({ name: "T1", id: 0x1, conformance: "O" }),
        Field({ name: "T2", id: 0x2, conformance: "O" }),
        Field({ name: "T3", id: 0x3, conformance: "O" })
    ),

    Datatype(
        { name: "ACLouverPositionEnum", type: "enum8" },
        Field({ name: "Closed", id: 0x1, conformance: "O" }),
        Field({ name: "Open", id: 0x2, conformance: "O" }),
        Field({ name: "Quarter", id: 0x3, conformance: "O" }),
        Field({ name: "Half", id: 0x4, conformance: "O" }),
        Field({ name: "ThreeQuarters", id: 0x5, conformance: "O" })
    ),

    Datatype(
        { name: "ACRefrigerantTypeEnum", type: "enum8" },
        Field({ name: "Unknown", id: 0x0, conformance: "O" }),
        Field({ name: "R22", id: 0x1, conformance: "O" }),
        Field({ name: "R410A", id: 0x2, conformance: "O" }),
        Field({ name: "R407C", id: 0x3, conformance: "O" })
    ),

    Datatype(
        { name: "ACTypeEnum", type: "enum8" },
        Field({ name: "Unknown", id: 0x0, conformance: "O" }),
        Field({ name: "CoolingFixed", id: 0x1, conformance: "O" }),
        Field({ name: "HeatPumpFixed", id: 0x2, conformance: "O" }),
        Field({ name: "CoolingInverter", id: 0x3, conformance: "O" }),
        Field({ name: "HeatPumpInverter", id: 0x4, conformance: "O" })
    ),

    Datatype(
        { name: "SetpointRaiseLowerModeEnum", type: "enum8" },
        Field({ name: "Heat", id: 0x0, conformance: "HEAT" }),
        Field({ name: "Cool", id: 0x1, conformance: "COOL" }),
        Field({ name: "Both", id: 0x2, conformance: "HEAT | COOL" })
    ),

    Datatype(
        { name: "ControlSequenceOfOperationEnum", type: "enum8" },
        Field({ name: "CoolingOnly", id: 0x0, conformance: "[COOL]" }),
        Field({ name: "CoolingWithReheat", id: 0x1, conformance: "[COOL]" }),
        Field({ name: "HeatingOnly", id: 0x2, conformance: "[HEAT]" }),
        Field({ name: "HeatingWithReheat", id: 0x3, conformance: "[HEAT]" }),
        Field({ name: "CoolingAndHeating", id: 0x4, conformance: "[HEAT & COOL]" }),
        Field({ name: "CoolingAndHeatingWithReheat", id: 0x5, conformance: "[HEAT & COOL]" })
    ),

    Datatype(
        { name: "PresetScenarioEnum", type: "enum8" },
        Field({ name: "Occupied", id: 0x1, conformance: "M" }),
        Field({ name: "Unoccupied", id: 0x2, conformance: "M" }),
        Field({ name: "Sleep", id: 0x3, conformance: "M" }),
        Field({ name: "Wake", id: 0x4, conformance: "M" }),
        Field({ name: "Vacation", id: 0x5, conformance: "M" }),
        Field({ name: "GoingToSleep", id: 0x6, conformance: "M" }),
        Field({ name: "UserDefined", id: 0xfe, conformance: "M" })
    ),

    Datatype(
        { name: "SetpointChangeSourceEnum", type: "enum8" },
        Field({ name: "Manual", id: 0x0, conformance: "O" }),
        Field({ name: "Schedule", id: 0x1, conformance: "[SCH | MSCH]" }),
        Field({ name: "External", id: 0x2, conformance: "O" })
    ),

    Datatype(
        { name: "StartOfWeekEnum", type: "enum8" },
        Field({ name: "Sunday", id: 0x0, conformance: "M" }),
        Field({ name: "Monday", id: 0x1, conformance: "M" }),
        Field({ name: "Tuesday", id: 0x2, conformance: "M" }),
        Field({ name: "Wednesday", id: 0x3, conformance: "M" }),
        Field({ name: "Thursday", id: 0x4, conformance: "M" }),
        Field({ name: "Friday", id: 0x5, conformance: "M" }),
        Field({ name: "Saturday", id: 0x6, conformance: "M" })
    ),

    Datatype(
        { name: "SystemModeEnum", type: "enum8" },
        Field({ name: "Off", id: 0x0, conformance: "O" }),
        Field({ name: "Auto", id: 0x1, conformance: "AUTO" }),
        Field({ name: "Cool", id: 0x3, conformance: "[COOL]" }),
        Field({ name: "Heat", id: 0x4, conformance: "[HEAT]" }),
        Field({ name: "EmergencyHeat", id: 0x5, conformance: "[HEAT]" }),
        Field({ name: "Precooling", id: 0x6, conformance: "[COOL]" }),
        Field({ name: "FanOnly", id: 0x7, conformance: "O" }),
        Field({ name: "Dry", id: 0x8, conformance: "O" }),
        Field({ name: "Sleep", id: 0x9, conformance: "O" })
    ),

    Datatype(
        { name: "ThermostatRunningModeEnum", type: "enum8" },
        Field({ name: "Off", id: 0x0, conformance: "O" }),
        Field({ name: "Cool", id: 0x3, conformance: "[COOL]" }),
        Field({ name: "Heat", id: 0x4, conformance: "[HEAT]" })
    ),

    Datatype(
        { name: "TemperatureSetpointHoldEnum", type: "enum8" },
        Field({ name: "SetpointHoldOff", id: 0x0, conformance: "M" }),
        Field({ name: "SetpointHoldOn", id: 0x1, conformance: "M" })
    ),

    Datatype(
        { name: "PresetStruct", type: "struct" },
        Field({ name: "PresetHandle", id: 0x0, type: "octstr", conformance: "M", constraint: "max 16", quality: "X" }),
        Field({ name: "PresetScenario", id: 0x1, type: "PresetScenarioEnum", conformance: "M" }),
        Field({ name: "Name", id: 0x2, type: "string", conformance: "O", constraint: "max 64", default: null, quality: "X" }),
        Field({
            name: "CoolingSetpoint", id: 0x3, type: "temperature", conformance: "COOL", constraint: "desc",
            default: { type: "celsius", value: 26 }
        }),
        Field({
            name: "HeatingSetpoint", id: 0x4, type: "temperature", conformance: "HEAT", constraint: "desc",
            default: { type: "celsius", value: 20 }
        }),
        Field({ name: "BuiltIn", id: 0x5, type: "bool", conformance: "M", default: false, quality: "X" })
    ),

    Datatype(
        { name: "PresetTypeStruct", type: "struct" },
        Field({ name: "PresetScenario", id: 0x0, type: "PresetScenarioEnum", conformance: "M" }),
        Field({ name: "NumberOfPresets", id: 0x1, type: "uint8", conformance: "M", default: 0 }),
        Field({ name: "PresetTypeFeatures", id: 0x2, type: "PresetTypeFeaturesBitmap", conformance: "M", default: 0 })
    ),

    Datatype(
        { name: "WeeklyScheduleTransitionStruct", type: "struct" },
        Field({ name: "TransitionTime", id: 0x0, type: "uint16", conformance: "M", constraint: "max 1439" }),
        Field({ name: "HeatSetpoint", id: 0x1, type: "temperature", conformance: "M", quality: "X" }),
        Field({ name: "CoolSetpoint", id: 0x2, type: "temperature", conformance: "M", quality: "X" })
    ),

    Datatype(
        { name: "ScheduleStruct", type: "struct" },
        Field({ name: "ScheduleHandle", id: 0x0, type: "octstr", conformance: "M", constraint: "max 16", quality: "X" }),
        Field({ name: "SystemMode", id: 0x1, type: "SystemModeEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "Name", id: 0x2, type: "string", conformance: "O", constraint: "max 64" }),
        Field({ name: "PresetHandle", id: 0x3, type: "octstr", conformance: "O", constraint: "max 16" }),

        Field(
            {
                name: "Transitions", id: 0x4, type: "list", conformance: "M",
                constraint: "1 to numberOfScheduleTransitions", default: []
            },
            Field({ name: "entry", type: "ScheduleTransitionStruct" })
        ),

        Field({ name: "BuiltIn", id: 0x5, type: "bool", conformance: "M", default: false, quality: "X" })
    ),

    Datatype(
        { name: "ScheduleTransitionStruct", type: "struct" },
        Field({ name: "DayOfWeek", id: 0x0, type: "ScheduleDayOfWeekBitmap", conformance: "M", constraint: "desc" }),
        Field({ name: "TransitionTime", id: 0x1, type: "uint16", conformance: "M", constraint: "max 1439" }),
        Field({ name: "PresetHandle", id: 0x2, type: "octstr", conformance: "[PRES]", constraint: "max 16" }),
        Field({ name: "SystemMode", id: 0x3, type: "SystemModeEnum", conformance: "O", constraint: "desc" }),
        Field({ name: "CoolingSetpoint", id: 0x4, type: "temperature", conformance: "[COOL]", constraint: "desc" }),
        Field({ name: "HeatingSetpoint", id: 0x5, type: "temperature", conformance: "[HEAT]", constraint: "desc" })
    ),

    Datatype(
        { name: "ScheduleTypeStruct", type: "struct" },
        Field({ name: "SystemMode", id: 0x0, type: "SystemModeEnum", conformance: "M", constraint: "desc" }),
        Field({
            name: "NumberOfSchedules", id: 0x1, type: "uint8", conformance: "M",
            constraint: "max numberOfSchedules", default: 0
        }),
        Field({
            name: "ScheduleTypeFeatures", id: 0x2, type: "ScheduleTypeFeaturesBitmap", conformance: "M",
            constraint: "desc", default: 0
        })
    )
);

MatterDefinition.children.push(Thermostat);
