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
    EventElement as Event,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const EnergyEvse = Cluster(
    { name: "EnergyEvse", id: 0x99 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 3 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PREF", conformance: "M", constraint: "0", title: "ChargingPreferences" }),
        Field({ name: "SOC", conformance: "P, O", constraint: "1", title: "SoCReporting" }),
        Field({ name: "PNC", conformance: "P, O", constraint: "2", title: "PlugAndCharge" }),
        Field({ name: "RFID", conformance: "O", constraint: "3", title: "Rfid" }),
        Field({ name: "V2X", conformance: "P, O", constraint: "4", title: "V2X" })
    ),

    Attribute({ name: "State", id: 0x0, type: "StateEnum", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "SupplyState", id: 0x1, type: "SupplyStateEnum", access: "R V", conformance: "M" }),
    Attribute({ name: "FaultState", id: 0x2, type: "FaultStateEnum", access: "R V", conformance: "M" }),
    Attribute({ name: "ChargingEnabledUntil", id: 0x3, type: "epoch-s", access: "R V", conformance: "M", quality: "X N" }),
    Attribute({ name: "DischargingEnabledUntil", id: 0x4, type: "epoch-s", access: "R V", conformance: "V2X", quality: "X N" }),
    Attribute({
        name: "CircuitCapacity", id: 0x5, type: "amperage-mA", access: "R V", conformance: "M",
        constraint: "min 0", quality: "N"
    }),
    Attribute({
        name: "MinimumChargeCurrent", id: 0x6, type: "amperage-mA", access: "R V", conformance: "M",
        constraint: "min 0", quality: "N"
    }),
    Attribute({
        name: "MaximumChargeCurrent", id: 0x7, type: "amperage-mA", access: "R V", conformance: "M",
        constraint: "min 0", quality: "N"
    }),
    Attribute({
        name: "MaximumDischargeCurrent", id: 0x8, type: "amperage-mA", access: "R V", conformance: "V2X",
        constraint: "min 0", quality: "N"
    }),
    Attribute({
        name: "UserMaximumChargeCurrent", id: 0x9, type: "amperage-mA", access: "RW VM", conformance: "O",
        constraint: "desc", default: 0, quality: "N"
    }),
    Attribute({
        name: "RandomizationDelayWindow", id: 0xa, type: "elapsed-s", access: "RW VM", conformance: "O",
        constraint: "max 86400", default: 600, quality: "N"
    }),
    Attribute({ name: "NextChargeStartTime", id: 0x23, type: "epoch-s", access: "R V", conformance: "PREF", quality: "X" }),
    Attribute(
        { name: "NextChargeTargetTime", id: 0x24, type: "epoch-s", access: "R V", conformance: "PREF", quality: "X" }
    ),
    Attribute({
        name: "NextChargeRequiredEnergy", id: 0x25, type: "energy-mWh", access: "R V", conformance: "PREF",
        constraint: "min 0", quality: "X"
    }),
    Attribute({ name: "NextChargeTargetSoC", id: 0x26, type: "percent", access: "R V", conformance: "PREF", quality: "X" }),
    Attribute({
        name: "ApproximateEvEfficiency", id: 0x27, type: "uint16", access: "RW VM", conformance: "[PREF]",
        constraint: "desc", default: null, quality: "X N"
    }),
    Attribute({ name: "StateOfCharge", id: 0x30, type: "percent", access: "R V", conformance: "SOC", quality: "X" }),
    Attribute({
        name: "BatteryCapacity", id: 0x31, type: "energy-mWh", access: "R V", conformance: "SOC",
        constraint: "min 0", quality: "X"
    }),
    Attribute({
        name: "VehicleId", id: 0x32, type: "string", access: "R V", conformance: "PNC",
        constraint: "max 32", quality: "X"
    }),
    Attribute({ name: "SessionId", id: 0x40, type: "uint32", access: "R V", conformance: "M", quality: "X N" }),
    Attribute({ name: "SessionDuration", id: 0x41, type: "elapsed-s", access: "R V", conformance: "M", quality: "X N Q" }),
    Attribute({
        name: "SessionEnergyCharged", id: 0x42, type: "energy-mWh", access: "R V", conformance: "M",
        constraint: "min 0", quality: "X N Q"
    }),
    Attribute({
        name: "SessionEnergyDischarged", id: 0x43, type: "energy-mWh", access: "R V", conformance: "V2X",
        constraint: "min 0", quality: "X N Q"
    }),
    Event(
        { name: "EvConnected", id: 0x0, access: "V", conformance: "M", priority: "info" },
        Field({ name: "SessionId", id: 0x0, type: "uint32", conformance: "M" })
    ),

    Event(
        { name: "EvNotDetected", id: 0x1, access: "V", conformance: "M", priority: "info" },
        Field({ name: "SessionId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "State", id: 0x1, type: "StateEnum", conformance: "M" }),
        Field({ name: "SessionDuration", id: 0x2, type: "elapsed-s", conformance: "M" }),
        Field({ name: "SessionEnergyCharged", id: 0x3, type: "energy-mWh", conformance: "M", constraint: "min 0" }),
        Field({ name: "SessionEnergyDischarged", id: 0x4, type: "energy-mWh", conformance: "V2X", constraint: "min 0" })
    ),

    Event(
        { name: "EnergyTransferStarted", id: 0x2, access: "V", conformance: "M", priority: "info" },
        Field({ name: "SessionId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "State", id: 0x1, type: "StateEnum", conformance: "M" }),
        Field({ name: "MaximumCurrent", id: 0x2, type: "amperage-mA", conformance: "M", constraint: "min 0" }),
        Field({ name: "MaximumDischargeCurrent", id: 0x3, type: "amperage-mA", conformance: "V2X", constraint: "min 0" })
    ),

    Event(
        { name: "EnergyTransferStopped", id: 0x3, access: "V", conformance: "M", priority: "info" },
        Field({ name: "SessionId", id: 0x0, type: "uint32", conformance: "M" }),
        Field({ name: "State", id: 0x1, type: "StateEnum", conformance: "M" }),
        Field({ name: "Reason", id: 0x2, type: "EnergyTransferStoppedReasonEnum", conformance: "M" }),
        Field({ name: "EnergyTransferred", id: 0x4, type: "energy-mWh", conformance: "M", constraint: "min 0" }),
        Field({ name: "EnergyDischarged", id: 0x5, type: "energy-mWh", conformance: "V2X", constraint: "min 0" })
    ),

    Event(
        { name: "Fault", id: 0x4, access: "V", conformance: "M", priority: "critical" },
        Field({ name: "SessionId", id: 0x0, type: "uint32", conformance: "M", quality: "X" }),
        Field({ name: "State", id: 0x1, type: "StateEnum", conformance: "M" }),
        Field({ name: "FaultStatePreviousState", id: 0x2, type: "FaultStateEnum", conformance: "M" }),
        Field({ name: "FaultStateCurrentState", id: 0x4, type: "FaultStateEnum", conformance: "M" })
    ),

    Event(
        { name: "Rfid", id: 0x5, access: "V", conformance: "[RFID]", priority: "info" },
        Field({ name: "Uid", id: 0x0, type: "octstr", conformance: "M", constraint: "max 10" })
    ),
    Command({ name: "Disable", id: 0x1, access: "O T", conformance: "M", direction: "request", response: "status" }),

    Command(
        { name: "EnableCharging", id: 0x2, access: "O T", conformance: "M", direction: "request", response: "status" },
        Field({ name: "ChargingEnabledUntil", id: 0x0, type: "epoch-s", conformance: "M", quality: "X" }),
        Field({ name: "MinimumChargeCurrent", id: 0x1, type: "amperage-mA", conformance: "M", constraint: "min 0" }),
        Field({ name: "MaximumChargeCurrent", id: 0x2, type: "amperage-mA", conformance: "M", constraint: "min 0" })
    ),

    Command(
        {
            name: "EnableDischarging", id: 0x3, access: "O T", conformance: "V2X", direction: "request",
            response: "status"
        },
        Field({ name: "DischargingEnabledUntil", id: 0x0, type: "epoch-s", conformance: "M", quality: "X" }),
        Field({ name: "MaximumDischargeCurrent", id: 0x1, type: "amperage-mA", conformance: "M", constraint: "min 0" })
    ),

    Command({ name: "StartDiagnostics", id: 0x4, access: "O T", conformance: "O", direction: "request", response: "status" }),

    Command(
        { name: "SetTargets", id: 0x5, access: "O T", conformance: "PREF", direction: "request", response: "status" },
        Field(
            { name: "ChargingTargetSchedules", id: 0x0, type: "list", conformance: "M", constraint: "max 7" },
            Field({ name: "entry", type: "ChargingTargetScheduleStruct" })
        )
    ),

    Command({
        name: "GetTargets", id: 0x6, access: "O T", conformance: "PREF", direction: "request",
        response: "GetTargetsResponse"
    }),
    Command(
        { name: "ClearTargets", id: 0x7, access: "O T", conformance: "PREF", direction: "request", response: "status" }
    ),

    Command(
        { name: "GetTargetsResponse", id: 0x0, conformance: "PREF", direction: "response" },
        Field(
            { name: "ChargingTargetSchedules", id: 0x0, type: "list", conformance: "M", constraint: "max 7" },
            Field({ name: "entry", type: "ChargingTargetScheduleStruct" })
        )
    ),

    Datatype(
        { name: "TargetDayOfWeekBitmap", type: "map8" },
        Field({ name: "Sunday", constraint: "0" }),
        Field({ name: "Monday", constraint: "1" }),
        Field({ name: "Tuesday", constraint: "2" }),
        Field({ name: "Wednesday", constraint: "3" }),
        Field({ name: "Thursday", constraint: "4" }),
        Field({ name: "Friday", constraint: "5" }),
        Field({ name: "Saturday", constraint: "6" })
    ),

    Datatype(
        { name: "StateEnum", type: "enum8" },
        Field({ name: "NotPluggedIn", id: 0x0, conformance: "M" }),
        Field({ name: "PluggedInNoDemand", id: 0x1, conformance: "M" }),
        Field({ name: "PluggedInDemand", id: 0x2, conformance: "M" }),
        Field({ name: "PluggedInCharging", id: 0x3, conformance: "M" }),
        Field({ name: "PluggedInDischarging", id: 0x4, conformance: "V2X" }),
        Field({ name: "SessionEnding", id: 0x5, conformance: "M" }),
        Field({ name: "Fault", id: 0x6, conformance: "M" })
    ),

    Datatype(
        { name: "SupplyStateEnum", type: "enum8" },
        Field({ name: "Disabled", id: 0x0, conformance: "M" }),
        Field({ name: "ChargingEnabled", id: 0x1, conformance: "M" }),
        Field({ name: "DischargingEnabled", id: 0x2, conformance: "[V2X]" }),
        Field({ name: "DisabledError", id: 0x3, conformance: "M" }),
        Field({ name: "DisabledDiagnostics", id: 0x4, conformance: "M" }),
        Field({ name: "Enabled", id: 0x5, conformance: "[V2X]" })
    ),

    Datatype(
        { name: "FaultStateEnum", type: "enum8" },
        Field({ name: "NoError", id: 0x0, conformance: "M" }),
        Field({ name: "MeterFailure", id: 0x1, conformance: "M" }),
        Field({ name: "OverVoltage", id: 0x2, conformance: "M" }),
        Field({ name: "UnderVoltage", id: 0x3, conformance: "M" }),
        Field({ name: "OverCurrent", id: 0x4, conformance: "M" }),
        Field({ name: "ContactWetFailure", id: 0x5, conformance: "M" }),
        Field({ name: "ContactDryFailure", id: 0x6, conformance: "M" }),
        Field({ name: "GroundFault", id: 0x7, conformance: "M" }),
        Field({ name: "PowerLoss", id: 0x8, conformance: "M" }),
        Field({ name: "PowerQuality", id: 0x9, conformance: "M" }),
        Field({ name: "PilotShortCircuit", id: 0xa, conformance: "M" }),
        Field({ name: "EmergencyStop", id: 0xb, conformance: "M" }),
        Field({ name: "EvDisconnected", id: 0xc, conformance: "M" }),
        Field({ name: "WrongPowerSupply", id: 0xd, conformance: "M" }),
        Field({ name: "LiveNeutralSwap", id: 0xe, conformance: "M" }),
        Field({ name: "OverTemperature", id: 0xf, conformance: "M" }),
        Field({ name: "Other", id: 0xff, conformance: "M" })
    ),

    Datatype(
        { name: "EnergyTransferStoppedReasonEnum", type: "enum8" },
        Field({ name: "EvStopped", id: 0x0, conformance: "M" }),
        Field({ name: "EvseStopped", id: 0x1, conformance: "M" }),
        Field({ name: "Other", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "ChargingTargetStruct", type: "struct" },
        Field({ name: "TargetTimeMinutesPastMidnight", id: 0x0, type: "uint16", conformance: "M", constraint: "max 1439" }),
        Field({ name: "TargetSoC", id: 0x1, type: "percent", conformance: "SOC, O.a+", default: 0 }),
        Field({
            name: "AddedEnergy", id: 0x2, type: "energy-mWh", conformance: "[SOC], O.a+", constraint: "min 0",
            default: 0
        })
    ),

    Datatype(
        { name: "ChargingTargetScheduleStruct", type: "struct" },
        Field({ name: "DayOfWeekForSequence", id: 0x0, type: "TargetDayOfWeekBitmap", conformance: "M" }),
        Field(
            { name: "ChargingTargets", id: 0x1, type: "list", conformance: "M", constraint: "max 10" },
            Field({ name: "entry", type: "ChargingTargetStruct" })
        )
    )
);

MatterDefinition.children.push(EnergyEvse);
