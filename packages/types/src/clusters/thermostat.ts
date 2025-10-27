/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    Attribute,
    OptionalFixedAttribute,
    OptionalAttribute,
    WritableAttribute,
    OptionalWritableAttribute,
    FixedAttribute,
    Command,
    TlvNoResponse
} from "../cluster/Cluster.js";
import { BitFlag, BitsFromPartial, BitField } from "../schema/BitmapSchema.js";
import { TlvUInt8, TlvBitmap, TlvInt16, TlvInt8, TlvEnum, TlvUInt16, TlvEpochS, TlvUInt32 } from "../tlv/TlvNumber.js";
import { AccessLevel } from "#model";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { TlvByteString, TlvString } from "../tlv/TlvString.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvAttributeId } from "../datatype/AttributeId.js";
import { Status } from "../globals/Status.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Thermostat {
    /**
     * These are optional features supported by ThermostatCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.4
     */
    export enum Feature {
        /**
         * Heating (HEAT)
         *
         * Thermostat is capable of managing a heating device
         */
        Heating = "Heating",

        /**
         * Cooling (COOL)
         *
         * Thermostat is capable of managing a cooling device
         */
        Cooling = "Cooling",

        /**
         * Occupancy (OCC)
         *
         * Supports Occupied and Unoccupied setpoints
         */
        Occupancy = "Occupancy",

        /**
         * ScheduleConfiguration (SCH)
         *
         * Supports remote configuration of a weekly schedule of setpoint transitions
         */
        ScheduleConfiguration = "ScheduleConfiguration",

        /**
         * Setback (SB)
         *
         * Supports configurable setback (or span)
         */
        Setback = "Setback",

        /**
         * AutoMode (AUTO)
         *
         * Supports a System Mode of Auto
         */
        AutoMode = "AutoMode",

        /**
         * LocalTemperatureNotExposed (LTNE)
         *
         * This feature indicates that the Calculated Local Temperature used internally is unavailable to report
         * externally, for example due to the temperature control being done by a separate subsystem which does not
         * offer a view into the currently measured temperature, but allows setpoints to be provided.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.4.1
         */
        LocalTemperatureNotExposed = "LocalTemperatureNotExposed",

        /**
         * MatterScheduleConfiguration (MSCH)
         *
         * This feature indicates that the thermostat is capable of schedules. If this feature is supported, the
         * thermostat shall support a mechanism to do time synchronization.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.4.2
         */
        MatterScheduleConfiguration = "MatterScheduleConfiguration",

        /**
         * Presets (PRES)
         *
         * Thermostat supports setpoint presets
         */
        Presets = "Presets"
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.6
     */
    export const Occupancy = {
        /**
         * Indicates the occupancy state
         *
         * If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall indicate the
         * unoccupied state.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.6.1
         */
        occupied: BitFlag(0)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.25
     */
    export enum ThermostatRunningMode {
        /**
         * The Thermostat does not generate demand for Cooling or Heating
         */
        Off = 0,

        /**
         * Demand is only generated for Cooling
         */
        Cool = 3,

        /**
         * Demand is only generated for Heating
         */
        Heat = 4
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.23
     */
    export enum StartOfWeek {
        Sunday = 0,
        Monday = 1,
        Tuesday = 2,
        Wednesday = 3,
        Thursday = 4,
        Friday = 5,
        Saturday = 6
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.12
     */
    export const ScheduleDayOfWeek = {
        /**
         * Sunday
         */
        sunday: BitFlag(0),

        /**
         * Monday
         */
        monday: BitFlag(1),

        /**
         * Tuesday
         */
        tuesday: BitFlag(2),

        /**
         * Wednesday
         */
        wednesday: BitFlag(3),

        /**
         * Thursday
         */
        thursday: BitFlag(4),

        /**
         * Friday
         */
        friday: BitFlag(5),

        /**
         * Saturday
         */
        saturday: BitFlag(6),

        /**
         * Away or Vacation
         */
        away: BitFlag(7)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.13
     */
    export const ScheduleMode = {
        /**
         * Adjust Heat Setpoint
         */
        heatSetpointPresent: BitFlag(0),

        /**
         * Adjust Cool Setpoint
         */
        coolSetpointPresent: BitFlag(1)
    };

    /**
     * This represents a single transition in a Thermostat schedule
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.29
     */
    export const TlvWeeklyScheduleTransition = TlvObject({
        /**
         * This field shall represent the start time of the schedule transition during the associated day. The time will
         * be represented by a 16 bits unsigned integer to designate the minutes since midnight. For example, 6am will
         * be represented by 360 minutes since midnight and 11:30pm will be represented by 1410 minutes since midnight.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.29.1
         */
        transitionTime: TlvField(0, TlvUInt16.bound({ max: 1439 })),

        /**
         * This field shall represent the heat setpoint to be applied at this associated transition start time.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.29.2
         */
        heatSetpoint: TlvField(1, TlvNullable(TlvInt16)),

        /**
         * This field shall represent the cool setpoint to be applied at this associated transition start time.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.29.3
         */
        coolSetpoint: TlvField(2, TlvNullable(TlvInt16))
    });

    /**
     * This represents a single transition in a Thermostat schedule
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.29
     */
    export interface WeeklyScheduleTransition extends TypeFromSchema<typeof TlvWeeklyScheduleTransition> {}

    /**
     * Input to the Thermostat setWeeklySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.2
     */
    export const TlvSetWeeklyScheduleRequest = TlvObject({
        /**
         * This field shall indicate how many individual transitions to expect for this sequence of commands. If a
         * device supports more than 10 transitions in its schedule they can send this by sending more than 1 “Set
         * Weekly Schedule” command, each containing the separate information that the device needs to set.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.2.1
         */
        numberOfTransitionsForSequence: TlvField(0, TlvUInt8),

        /**
         * This field shall represent the day of the week at which all the transitions within the payload of the command
         * SHOULD be associated to. This field is a bitmap and therefore the associated setpoint could overlap onto
         * multiple days (you could set one transition time for all “week days” or whatever combination of days the
         * implementation requests).
         *
         * Each setpoint transition will begin with the day of week for this transition. There can be up to 10
         * transitions for each command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.2.2
         */
        dayOfWeekForSequence: TlvField(1, TlvBitmap(TlvUInt8, ScheduleDayOfWeek)),

        /**
         * This field shall indicate how the application decodes the setpoint fields of each transition in the
         * Transitions list.
         *
         * If the HeatSetpointPresent bit is On, the HeatSetpoint field shall NOT be null in every entry of the
         * Transitions list.
         *
         * If the HeatSetpointPresent bit is Off, the HeatSetpoint field shall be null in every entry of the Transitions
         * list.
         *
         * If the CoolSetpointPresent bit is On, the CoolSetpoint field shall NOT be null in every entry of the
         * Transitions list.
         *
         * If the CoolSetpointPresent bit is Off, the CoolSetpoint field shall be null in every entry of the Transitions
         * list.
         *
         * At least one of the bits in the Mode For Sequence byte shall be on.
         *
         * Both bits must be respected, even if the HEAT or COOL feature is not supported, to ensure the command is
         * decoded and handled correctly.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.2.3
         */
        modeForSequence: TlvField(2, TlvBitmap(TlvUInt8, ScheduleMode)),

        /**
         * This field shall contain the list of setpoint transitions used to update the specified daily schedules
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.2.4
         */
        transitions: TlvField(3, TlvArray(TlvWeeklyScheduleTransition, { maxLength: 10 }))
    });

    /**
     * Input to the Thermostat setWeeklySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.2
     */
    export interface SetWeeklyScheduleRequest extends TypeFromSchema<typeof TlvSetWeeklyScheduleRequest> {}

    /**
     * Input to the Thermostat getWeeklySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.3
     */
    export const TlvGetWeeklyScheduleRequest = TlvObject({
        /**
         * This field shall indicate the number of days the client would like to return the setpoint values for and
         * could be any combination of single days or the entire week.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.3.1
         */
        daysToReturn: TlvField(0, TlvBitmap(TlvUInt8, ScheduleDayOfWeek)),

        /**
         * This field shall indicate the mode the client would like to return the set point values for and could be any
         * combination of heat only, cool only or heat & cool.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.3.2
         */
        modeToReturn: TlvField(1, TlvBitmap(TlvUInt8, ScheduleMode))
    });

    /**
     * Input to the Thermostat getWeeklySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.3
     */
    export interface GetWeeklyScheduleRequest extends TypeFromSchema<typeof TlvGetWeeklyScheduleRequest> {}

    /**
     * This command has the same payload format as the Set Weekly Schedule.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.4
     */
    export const TlvGetWeeklyScheduleResponse = TlvObject({
        numberOfTransitionsForSequence: TlvField(0, TlvUInt8),
        dayOfWeekForSequence: TlvField(1, TlvBitmap(TlvUInt8, ScheduleDayOfWeek)),
        modeForSequence: TlvField(2, TlvBitmap(TlvUInt8, ScheduleMode)),
        transitions: TlvField(3, TlvArray(TlvWeeklyScheduleTransition, { maxLength: 10 }))
    });

    /**
     * This command has the same payload format as the Set Weekly Schedule.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.4
     */
    export interface GetWeeklyScheduleResponse extends TypeFromSchema<typeof TlvGetWeeklyScheduleResponse> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.21
     */
    export enum PresetScenario {
        /**
         * The thermostat-controlled area is occupied
         *
         * This value shall indicate the preset for periods when the thermostat’s temperature-controlled area is
         * occupied. It is intended for thermostats that can automatically determine occupancy.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.21.2
         */
        Occupied = 1,

        /**
         * The thermostat-controlled area is unoccupied
         *
         * This value shall indicate the preset for periods when the thermostat’s temperature-controlled area is
         * unoccupied. It is intended for thermostats that can automatically determine occupancy.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.21.3
         */
        Unoccupied = 2,

        /**
         * Users are likely to be sleeping
         *
         * This value shall indicate the preset for periods when users are likely to be asleep.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.21.4
         */
        Sleep = 3,

        /**
         * Users are likely to be waking up
         *
         * This value shall indicate the preset for periods when users are likely to be waking up.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.21.5
         */
        Wake = 4,

        /**
         * Users are on vacation
         *
         * This value shall indicate the preset for periods when users are on vacation, or otherwise out-of-home for
         * extended periods of time.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.21.6
         */
        Vacation = 5,

        /**
         * Users are likely to be going to sleep
         *
         * This value shall indicate the preset for periods when users are likely to be going to sleep.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.21.7
         */
        GoingToSleep = 6,

        /**
         * Custom presets
         *
         * This value shall indicate a free-form preset; when set, the Name field on PresetStruct shall NOT be null.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.21.8
         */
        UserDefined = 254
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.7
     */
    export const PresetTypeFeatures = {
        /**
         * Preset may be automatically activated by the thermostat
         */
        automatic: BitFlag(0),

        /**
         * Preset supports user-provided names
         */
        supportsNames: BitFlag(1)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.28
     */
    export const TlvPresetType = TlvObject({
        /**
         * This field shall specify a PresetScenarioEnum value supported by this thermostat.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.28.1
         */
        presetScenario: TlvField(0, TlvEnum<PresetScenario>()),

        /**
         * This field shall specify a limit for the number of presets for this PresetScenarioEnum.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.28.2
         */
        numberOfPresets: TlvField(1, TlvUInt8),

        /**
         * This field shall specify a bitmap of features for this PresetTypeStruct.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.28.3
         */
        presetTypeFeatures: TlvField(2, TlvBitmap(TlvUInt16, PresetTypeFeatures))
    });

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.28
     */
    export interface PresetType extends TypeFromSchema<typeof TlvPresetType> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.27
     */
    export const TlvPreset = TlvObject({
        /**
         * This field shall indicate a device generated identifier for this preset. It shall be unique on the device,
         * and shall NOT be reused after the associated preset has been deleted.
         *
         * This field shall only be null when the encompassing PresetStruct is appended to the Presets attribute for the
         * purpose of creating a new Preset. Refer to Presets for the creation of Preset handles.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.27.1
         */
        presetHandle: TlvField(0, TlvNullable(TlvByteString.bound({ maxLength: 16 }))),

        /**
         * This field shall indicate the associated PresetScenarioEnum value for this preset.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.27.2
         */
        presetScenario: TlvField(1, TlvEnum<PresetScenario>()),

        /**
         * This field shall indicate a name provided by a user. The null value shall indicate no name.
         *
         * Within each subset of presets sharing the same PresetScenario field value, there shall NOT be any presets
         * with the same value, including null as a value, in the Name field.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.27.3
         */
        name: TlvOptionalField(2, TlvNullable(TlvString.bound({ maxLength: 64 }))),

        /**
         * This field shall indicate the cooling setpoint for the preset. Refer to Setpoint Limits for value
         * constraints.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.27.4
         */
        coolingSetpoint: TlvOptionalField(3, TlvInt16),

        /**
         * This field shall indicate the heating setpoint for the preset. Refer to Setpoint Limits for value
         * constraints.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.27.5
         */
        heatingSetpoint: TlvOptionalField(4, TlvInt16),

        /**
         * This field shall indicate whether the preset is marked as "built-in", meaning that it can be modified, but it
         * cannot be deleted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.27.6
         */
        builtIn: TlvField(5, TlvNullable(TlvBoolean))
    });

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.27
     */
    export interface Preset extends TypeFromSchema<typeof TlvPreset> {}

    /**
     * Input to the Thermostat setActivePresetRequest command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.9
     */
    export const TlvSetActivePresetRequest = TlvObject({
        /**
         * This field shall specify the value of the PresetHandle field on the PresetStruct to be made active. If the
         * field is set to null, that indicates there should be no active preset.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.9.1
         */
        presetHandle: TlvField(0, TlvNullable(TlvByteString.bound({ maxLength: 16 })))
    });

    /**
     * Input to the Thermostat setActivePresetRequest command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.9
     */
    export interface SetActivePresetRequest extends TypeFromSchema<typeof TlvSetActivePresetRequest> {}

    /**
     * Table 9. Interpretation of Heat, Cool and Auto SystemModeEnum Values
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.24
     */
    export enum SystemMode {
        /**
         * The Thermostat does not generate demand for Cooling or Heating
         */
        Off = 0,

        /**
         * Demand is generated for either Cooling or Heating, as required
         */
        Auto = 1,

        /**
         * Demand is only generated for Cooling
         */
        Cool = 3,

        /**
         * Demand is only generated for Heating
         */
        Heat = 4,

        /**
         * 2nd stage heating is in use to achieve desired temperature
         */
        EmergencyHeat = 5,

        /**
         * (see Terms)
         */
        Precooling = 6,

        FanOnly = 7,
        Dry = 8,
        Sleep = 9
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.11
     */
    export const ScheduleTypeFeatures = {
        /**
         * Supports presets
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports specifying presets on ScheduleTransitionStructs
         * contained in its Transitions field.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.11.1
         */
        supportsPresets: BitFlag(0),

        /**
         * Supports setpoints
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports specifying setpoints on ScheduleTransitionStructs
         * contained in its Transitions field.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.11.2
         */
        supportsSetpoints: BitFlag(1),

        /**
         * Supports user-provided names
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports setting the value of the Name field.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.11.3
         */
        supportsNames: BitFlag(2),

        /**
         * Supports transitioning to SystemModeOff
         *
         * This bit shall indicate that any ScheduleStruct with a SystemMode field whose value matches the SystemMode
         * field on the encompassing ScheduleTypeStruct supports setting its SystemMode field to Off.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.11.4
         */
        supportsOff: BitFlag(3)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.32
     */
    export const TlvScheduleType = TlvObject({
        /**
         * This field shall specify a SystemModeEnum supported by this thermostat for Schedules. The only valid values
         * for this field shall be Auto, Heat, and Cool.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.32.1
         */
        systemMode: TlvField(0, TlvEnum<SystemMode>()),

        /**
         * This field shall specify a limit for the number of Schedules for this SystemMode.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.32.2
         */
        numberOfSchedules: TlvField(1, TlvUInt8),

        /**
         * This field shall specify a bitmap of features for this schedule entry. At least one of SupportsPresets and
         * SupportsSetpoints shall be set.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.32.3
         */
        scheduleTypeFeatures: TlvField(2, TlvBitmap(TlvUInt16, ScheduleTypeFeatures))
    });

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.32
     */
    export interface ScheduleType extends TypeFromSchema<typeof TlvScheduleType> {}

    /**
     * This struct provides a time of day and a set of days of the week for a state transition within a schedule. The
     * thermostat shall use the following order of precedence for determining a new setpoint at the time of transition:
     *
     *   1. If the PresetHandle field is provided, then the setpoint for the PresetStruct in the Presets attribute with
     *      that identifier shall be used
     *
     *   2. If either the HeatingSetpoint or CoolingSetpoint is provided, then it shall be used
     *
     *     a. If the SystemMode field is provided, the HeatingSetpoint and CoolingSetpoint fields shall be interpreted
     *        using the SystemMode field
     *
     *     b. If the SystemMode field is not provided, the HeatingSetpoint and CoolingSetpoint fields shall be
     *        interpreted using the SystemMode field on the parent ScheduleStruct
     *
     *   3. If neither the PresetHandle field or any Setpoint field is provided, then the PresetHandle field on the
     *      parent ScheduleStruct shall be used to determine the active PresetStruct
     *
     *   4. If the PresetHandle is not indicated and no setpoint is provided for the current SystemMode, the server
     *      shall use a default value for the current SystemMode.
     *
     * If the setpoint was derived from a preset, then the ActivePresetHandle shall be set to the PresetHandle of that
     * preset.
     *
     * If a CoolingSetpoint was used to determine the cooling setpoint:
     *
     *   • If the server supports the OCC feature, and the Occupied bit is not set on the Occupancy attribute, then the
     *     UnoccupiedCoolingSetpoint attribute shall be set to the CoolingSetpoint
     *
     *   • Otherwise, the OccupiedCoolingSetpoint attribute shall be set to the CoolingSetpoint If a HeatingSetpoint was
     *     used to determine the heating setpoint:
     *
     *   • If the server supports the OCC feature, and the Occupied bit is not set on the Occupancy attribute, then the
     *     UnoccupiedHeatingSetpoint attribute shall be set to the HeatingSetpoint
     *
     *   • Otherwise, the OccupiedHeatingSetpoint attribute shall be set to the HeatingSetpoint The
     *     ScheduleTransitionStruct shall be invalid if all the following are true:
     *
     *   • The HeatingSetpoint field is not provided
     *
     *   • The PresetHandle field is not provided
     *
     *   • The PresetHandle field on the encompassing ScheduleStruct is not provided
     *
     *   • The SystemMode field is provided and has the value Heat or Auto, or the SystemMode field on the parent
     *     ScheduleStruct has the value Heat or Auto The ScheduleTransitionStruct shall be invalid if all the following
     *     are true:
     *
     *   • The CoolingSetpoint field is not provided
     *
     *   • The PresetHandle field is not provided
     *
     *   • The PresetHandle field on the encompassing ScheduleStruct is not provided
     *
     *   • The SystemMode field is provided and has the value Cool or Auto, or the SystemMode field on the parent
     *     ScheduleStruct has the value Cool or Auto
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.31
     */
    export const TlvScheduleTransition = TlvObject({
        /**
         * This field shall specify a bitmask of days of the week that the transition applies to. The Vacation bit shall
         * NOT be set; vacation schedules shall be set via the vacation preset.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.31.1
         */
        dayOfWeek: TlvField(0, TlvBitmap(TlvUInt8, ScheduleDayOfWeek)),

        /**
         * This shall specify the time of day at which the transition becomes active, in terms of minutes within the day
         * representing the wall clock, where 0 is 00:00:00, 1 is 00:01:00 and 1439 is 23:59:00.
         *
         * Handling of transitions during the changeover of Daylight Saving Time is implementation-dependent.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.31.2
         */
        transitionTime: TlvField(1, TlvUInt16.bound({ max: 1439 })),

        /**
         * This field shall specify the preset used at the TransitionTime. If this field is provided, then the
         * SystemMode, CoolingSetpoint and HeatingSetpoint fields shall NOT be provided.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.31.3
         */
        presetHandle: TlvOptionalField(2, TlvByteString.bound({ maxLength: 16 })),

        /**
         * This shall specify the default mode to which the thermostat will switch for this transition, overriding the
         * default for the schedule. The only valid values for this field shall be Auto, Heat, Cool and Off. This field
         * shall only be included when the required system mode differs from the schedule’s default SystemMode.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.31.4
         */
        systemMode: TlvOptionalField(3, TlvEnum<SystemMode>()),

        /**
         * This field shall specify the cooling setpoint for the transition. If PresetHandle is set, this field shall
         * NOT be included. Refer to Setpoint Limits for value constraints.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.31.5
         */
        coolingSetpoint: TlvOptionalField(4, TlvInt16),

        /**
         * This field shall specify the cooling setpoint for the transition. If PresetHandle is set, this field shall
         * NOT be included. Refer to Setpoint Limits for value constraints.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.31.6
         */
        heatingSetpoint: TlvOptionalField(5, TlvInt16)
    });

    /**
     * This struct provides a time of day and a set of days of the week for a state transition within a schedule. The
     * thermostat shall use the following order of precedence for determining a new setpoint at the time of transition:
     *
     *   1. If the PresetHandle field is provided, then the setpoint for the PresetStruct in the Presets attribute with
     *      that identifier shall be used
     *
     *   2. If either the HeatingSetpoint or CoolingSetpoint is provided, then it shall be used
     *
     *     a. If the SystemMode field is provided, the HeatingSetpoint and CoolingSetpoint fields shall be interpreted
     *        using the SystemMode field
     *
     *     b. If the SystemMode field is not provided, the HeatingSetpoint and CoolingSetpoint fields shall be
     *        interpreted using the SystemMode field on the parent ScheduleStruct
     *
     *   3. If neither the PresetHandle field or any Setpoint field is provided, then the PresetHandle field on the
     *      parent ScheduleStruct shall be used to determine the active PresetStruct
     *
     *   4. If the PresetHandle is not indicated and no setpoint is provided for the current SystemMode, the server
     *      shall use a default value for the current SystemMode.
     *
     * If the setpoint was derived from a preset, then the ActivePresetHandle shall be set to the PresetHandle of that
     * preset.
     *
     * If a CoolingSetpoint was used to determine the cooling setpoint:
     *
     *   • If the server supports the OCC feature, and the Occupied bit is not set on the Occupancy attribute, then the
     *     UnoccupiedCoolingSetpoint attribute shall be set to the CoolingSetpoint
     *
     *   • Otherwise, the OccupiedCoolingSetpoint attribute shall be set to the CoolingSetpoint If a HeatingSetpoint was
     *     used to determine the heating setpoint:
     *
     *   • If the server supports the OCC feature, and the Occupied bit is not set on the Occupancy attribute, then the
     *     UnoccupiedHeatingSetpoint attribute shall be set to the HeatingSetpoint
     *
     *   • Otherwise, the OccupiedHeatingSetpoint attribute shall be set to the HeatingSetpoint The
     *     ScheduleTransitionStruct shall be invalid if all the following are true:
     *
     *   • The HeatingSetpoint field is not provided
     *
     *   • The PresetHandle field is not provided
     *
     *   • The PresetHandle field on the encompassing ScheduleStruct is not provided
     *
     *   • The SystemMode field is provided and has the value Heat or Auto, or the SystemMode field on the parent
     *     ScheduleStruct has the value Heat or Auto The ScheduleTransitionStruct shall be invalid if all the following
     *     are true:
     *
     *   • The CoolingSetpoint field is not provided
     *
     *   • The PresetHandle field is not provided
     *
     *   • The PresetHandle field on the encompassing ScheduleStruct is not provided
     *
     *   • The SystemMode field is provided and has the value Cool or Auto, or the SystemMode field on the parent
     *     ScheduleStruct has the value Cool or Auto
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.31
     */
    export interface ScheduleTransition extends TypeFromSchema<typeof TlvScheduleTransition> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.30
     */
    export const TlvSchedule = TlvObject({
        /**
         * This field shall indicate a device generated identifier for this schedule. It shall be unique on the device,
         * and shall NOT be reused after the associated schedule has been deleted.
         *
         * This field shall only be null when the encompassing ScheduleStruct is appended to the Schedules attribute for
         * the purpose of creating a new Schedule. Refer to Schedules for the creation of Schedule handles.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.30.1
         */
        scheduleHandle: TlvField(0, TlvNullable(TlvByteString.bound({ maxLength: 16 }))),

        /**
         * This field shall specify the default thermostat system mode for transitions in this schedule. The only valid
         * values for this field shall be Auto, Heat, and Cool.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.30.2
         */
        systemMode: TlvField(1, TlvEnum<SystemMode>()),

        /**
         * This field shall specify a name for the ScheduleStruct.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.30.3
         */
        name: TlvOptionalField(2, TlvString.bound({ maxLength: 64 })),

        /**
         * This field shall indicate the default PresetHandle value for transitions in this schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.30.4
         */
        presetHandle: TlvOptionalField(3, TlvByteString.bound({ maxLength: 16 })),

        /**
         * This field shall specify a list of transitions for the schedule.
         *
         * This field shall NOT contain more than one ScheduleStruct with the same TransitionTime field and overlapping
         * DayOfWeek fields; i.e. there shall be no duplicate transitions.
         *
         * If the NumberOfScheduleTransitionsPerDay attribute is not null, then for each bit in ScheduleDayOfWeekBitmap,
         * the number of transitions with that bit set in DayOfWeek shall NOT be greater than the value of the
         * NumberOfScheduleTransitionsPerDay attribute.
         *
         * For the purposes of determining which ScheduleStruct in this list is currently active, the current time shall
         * be the number of minutes past midnight in the display value of the current time, not the actual number of
         * minutes that have elapsed since midnight. On days which transition into or out of daylight saving time,
         * certain values may repeat or not occur during the transition period.
         *
         * A ScheduleTransitionStruct in this list shall be active if the current day of the week matches its DayOfWeek
         * field and the current time is greater than or equal to the TransitionTime, but less than the TransitionTime
         * on any other ScheduleTransitionStruct in the Transitions field whose DayOfWeek field also matches the current
         * day of the week.
         *
         * If the current time is less than every ScheduleTransitionStruct whose DayOfWeek field also matches the
         * current day of the week, the server shall attempt the same process to identify the active
         * ScheduleTransitionStruct for the day preceding the previously attempted day of the week, repeating until an
         * active ScheduleTransitionStruct is found or the attempted day is the current day of the week again. If no
         * active ScheduleTransitionStruct is found, then the active ScheduleTransitionStruct shall be the
         * ScheduleTransitionStruct with the largest TransitionTime field from the set of ScheduleTransitionStructs
         * whose DayOfWeek field matches the current day of the week.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.30.5
         */
        transitions: TlvField(4, TlvArray(TlvScheduleTransition, { minLength: 1 })),

        /**
         * This field shall indicate whether the schedule is marked as "built-in", meaning that it can be modified, but
         * it cannot be deleted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.30.6
         */
        builtIn: TlvField(5, TlvNullable(TlvBoolean))
    });

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.30
     */
    export interface Schedule extends TypeFromSchema<typeof TlvSchedule> {}

    /**
     * Input to the Thermostat setActiveScheduleRequest command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.8
     */
    export const TlvSetActiveScheduleRequest = TlvObject({
        /**
         * This field shall specify the value of the ScheduleHandle field on the ScheduleStruct to be made active.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.8.1
         */
        scheduleHandle: TlvField(0, TlvByteString.bound({ maxLength: 16 }))
    });

    /**
     * Input to the Thermostat setActiveScheduleRequest command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.8
     */
    export interface SetActiveScheduleRequest extends TypeFromSchema<typeof TlvSetActiveScheduleRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.5
     */
    export const HvacSystemType = {
        /**
         * Stage of cooling the HVAC system is using.
         *
         * These bits shall indicate what stage of cooling the HVAC system is using.
         *
         *   • 00 = Cool Stage 1
         *
         *   • 01 = Cool Stage 2
         *
         *   • 10 = Cool Stage 3
         *
         *   • 11 = Reserved
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.5.1
         */
        coolingStage: BitField(0, 2),

        /**
         * Stage of heating the HVAC system is using.
         *
         * These bits shall indicate what stage of heating the HVAC system is using.
         *
         *   • 00 = Heat Stage 1
         *
         *   • 01 = Heat Stage 2
         *
         *   • 10 = Heat Stage 3
         *
         *   • 11 = Reserved
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.5.2
         */
        heatingStage: BitField(2, 2),

        /**
         * Is the heating type Heat Pump.
         *
         * This bit shall indicate whether the HVAC system is conventional or a heat pump.
         *
         *   • 0 = Conventional
         *
         *   • 1 = Heat Pump
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.5.3
         */
        heatingIsHeatPump: BitFlag(4),

        /**
         * Does the HVAC system use fuel.
         *
         * This bit shall indicate whether the HVAC system uses fuel.
         *
         *   • 0 = Does not use fuel
         *
         *   • 1 = Uses fuel
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.5.4
         */
        heatingUsesFuel: BitFlag(5)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.10
     */
    export const RemoteSensing = {
        /**
         * Calculated Local Temperature is derived from a remote node
         */
        localTemperature: BitFlag(0),

        /**
         * OutdoorTemperature is derived from a remote node
         */
        outdoorTemperature: BitFlag(1),

        /**
         * Occupancy is derived from a remote node
         */
        occupancy: BitFlag(2)
    };

    /**
     * > [!NOTE]
     *
     * > CoolingAndHeating
     *
     * A thermostat indicating it supports CoolingAndHeating (or CoolingAndHeatingWithReheat) SHOULD be able to request
     * heating or cooling on demand and will usually support the Auto SystemMode.
     *
     * Systems which support cooling or heating, requiring external intervention to change modes or where the whole
     * building must be in the same mode, SHOULD report CoolingOnly or HeatingOnly based on the current capability.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.20
     */
    export enum ControlSequenceOfOperation {
        /**
         * Heat and Emergency are not possible
         */
        CoolingOnly = 0,

        /**
         * Heat and Emergency are not possible
         */
        CoolingWithReheat = 1,

        /**
         * Cool and precooling (see Terms) are not possible
         */
        HeatingOnly = 2,

        /**
         * Cool and precooling are not possible
         */
        HeatingWithReheat = 3,

        /**
         * All modes are possible
         */
        CoolingAndHeating = 4,

        /**
         * All modes are possible
         */
        CoolingAndHeatingWithReheat = 5
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.26
     */
    export enum TemperatureSetpointHold {
        /**
         * Follow scheduling program
         */
        SetpointHoldOff = 0,

        /**
         * Maintain current setpoint, regardless of schedule transitions
         */
        SetpointHoldOn = 1
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.8
     */
    export const ProgrammingOperationMode = {
        /**
         * Schedule programming mode. This enables any programmed weekly schedule configurations.
         */
        scheduleActive: BitFlag(0),

        /**
         * Auto/recovery mode
         */
        autoRecovery: BitFlag(1),

        /**
         * Economy/EnergyStar mode
         */
        economy: BitFlag(2)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.9
     */
    export const RelayState = {
        /**
         * Heat Stage On
         */
        heat: BitFlag(0),

        /**
         * Cool Stage On
         */
        cool: BitFlag(1),

        /**
         * Fan Stage On
         */
        fan: BitFlag(2),

        /**
         * Heat 2nd Stage On
         */
        heatStage2: BitFlag(3),

        /**
         * Cool 2nd Stage On
         */
        coolStage2: BitFlag(4),

        /**
         * Fan 2nd Stage On
         */
        fanStage2: BitFlag(5),

        /**
         * Fan 3rd Stage On
         */
        fanStage3: BitFlag(6)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.22
     */
    export enum SetpointChangeSource {
        /**
         * Manual, user-initiated setpoint change via the thermostat
         */
        Manual = 0,

        /**
         * Schedule/internal programming-initiated setpoint change
         */
        Schedule = 1,

        /**
         * Externally-initiated setpoint change (e.g., DRLC cluster command, attribute write)
         */
        External = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.18
     */
    export enum AcType {
        /**
         * Unknown AC Type
         */
        Unknown = 0,

        /**
         * Cooling and Fixed Speed
         */
        CoolingFixed = 1,

        /**
         * Heat Pump and Fixed Speed
         */
        HeatPumpFixed = 2,

        /**
         * Cooling and Inverter
         */
        CoolingInverter = 3,

        /**
         * Heat Pump and Inverter
         */
        HeatPumpInverter = 4
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.17
     */
    export enum AcRefrigerantType {
        /**
         * Unknown Refrigerant Type
         */
        Unknown = 0,

        /**
         * R22 Refrigerant
         */
        R22 = 1,

        /**
         * R410a Refrigerant
         */
        R410A = 2,

        /**
         * R407c Refrigerant
         */
        R407C = 3
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.15
     */
    export enum AcCompressorType {
        /**
         * Unknown compressor type
         */
        Unknown = 0,

        /**
         * Max working ambient 43 °C
         */
        T1 = 1,

        /**
         * Max working ambient 35 °C
         */
        T2 = 2,

        /**
         * Max working ambient 52 °C
         */
        T3 = 3
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.4
     */
    export const AcErrorCode = {
        /**
         * Compressor Failure or Refrigerant Leakage
         */
        compressorFail: BitFlag(0),

        /**
         * Room Temperature Sensor Failure
         */
        roomSensorFail: BitFlag(1),

        /**
         * Outdoor Temperature Sensor Failure
         */
        outdoorSensorFail: BitFlag(2),

        /**
         * Indoor Coil Temperature Sensor Failure
         */
        coilSensorFail: BitFlag(3),

        /**
         * Fan Failure
         */
        fanFail: BitFlag(4)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.16
     */
    export enum AcLouverPosition {
        /**
         * Fully Closed
         */
        Closed = 1,

        /**
         * Fully Open
         */
        Open = 2,

        /**
         * Quarter Open
         */
        Quarter = 3,

        /**
         * Half Open
         */
        Half = 4,

        /**
         * Three Quarters Open
         */
        ThreeQuarters = 5
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.14
     */
    export enum AcCapacityFormat {
        /**
         * British Thermal Unit per Hour
         */
        BtUh = 0
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.8.19
     */
    export enum SetpointRaiseLowerMode {
        /**
         * Adjust Heat Setpoint
         */
        Heat = 0,

        /**
         * Adjust Cool Setpoint
         */
        Cool = 1,

        /**
         * Adjust Heat Setpoint and Cool Setpoint
         */
        Both = 2
    }

    /**
     * Input to the Thermostat setpointRaiseLower command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.1
     */
    export const TlvSetpointRaiseLowerRequest = TlvObject({
        /**
         * The field shall specify which setpoints are to be adjusted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.1.1
         */
        mode: TlvField(0, TlvEnum<SetpointRaiseLowerMode>()),

        /**
         * This field shall indicate the amount (possibly negative) that should be added to the setpoint(s), in steps of
         * 0.1°C.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.1.2
         */
        amount: TlvField(1, TlvInt8)
    });

    /**
     * Input to the Thermostat setpointRaiseLower command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.1
     */
    export interface SetpointRaiseLowerRequest extends TypeFromSchema<typeof TlvSetpointRaiseLowerRequest> {}

    /**
     * The value of Thermostat.requestType
     */
    export enum RequestType {
        BeginWrite = 0,
        CommitWrite = 1,
        RollbackWrite = 2
    }

    /**
     * Input to the Thermostat atomicRequest command
     */
    export const TlvAtomicRequest = TlvObject({
        requestType: TlvField(0, TlvEnum<RequestType>()),
        attributeRequests: TlvField(1, TlvArray(TlvAttributeId)),
        timeout: TlvOptionalField(2, TlvUInt16)
    });

    /**
     * Input to the Thermostat atomicRequest command
     */
    export interface AtomicRequest extends TypeFromSchema<typeof TlvAtomicRequest> {}

    /**
     * The value of Thermostat.entry
     */
    export const TlvEntry = TlvObject({
        attributeId: TlvField(0, TlvAttributeId),
        statusCode: TlvField(1, TlvEnum<Status>())
    });

    /**
     * The value of Thermostat.entry
     */
    export interface Entry extends TypeFromSchema<typeof TlvEntry> {}

    export const TlvAtomicResponse = TlvObject({
        statusCode: TlvField(0, TlvEnum<Status>()),
        attributeStatus: TlvField(1, TlvArray(TlvEntry)),
        timeout: TlvOptionalField(2, TlvUInt16)
    });
    export interface AtomicResponse extends TypeFromSchema<typeof TlvAtomicResponse> {}

    /**
     * A ThermostatCluster supports these elements if it supports feature Occupancy.
     */
    export const OccupancyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates whether the heated/cooled space is occupied or not, as measured locally or remotely (over the
             * network).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.4
             */
            occupancy: Attribute(
                0x2,
                TlvBitmap(TlvUInt8, Occupancy),
                { default: BitsFromPartial(Occupancy, { occupied: true }) }
            )
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports feature Heating.
     */
    export const HeatingComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the absolute minimum level that the heating setpoint may be set to. This is a limitation
             * imposed by the manufacturer.
             *
             * ### Refer to Setpoint Limits for constraints
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.5
             */
            absMinHeatSetpointLimit: OptionalFixedAttribute(0x3, TlvInt16, { default: 700 }),

            /**
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9
             */
            absMaxHeatSetpointLimit: OptionalFixedAttribute(0x4, TlvInt16, { default: 3000 }),

            /**
             * Indicates the level of heating demanded by the PI loop in percent. This value is 0 when the thermostat is
             * in “off” or “cooling” mode.
             *
             * This attribute is reported regularly and may be used to control a heating device.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.10
             */
            piHeatingDemand: OptionalAttribute(0x8, TlvUInt8.bound({ max: 100 })),

            /**
             * Indicates the heating mode setpoint when the room is occupied. Refer to Setpoint Limits for constraints.
             *
             * If an attempt is made to set this attribute to a value greater than MaxHeatSetpointLimit or less than
             * MinHeatSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * If this attribute is set to a value that is greater than (OccupiedCoolingSetpoint - MinSetpointDeadBand),
             * the value of OccupiedCoolingSetpoint shall be adjusted to (OccupiedHeatingSetpoint +
             * MinSetpointDeadBand).
             *
             * If the occupancy status of the room is unknown, this attribute shall be used as the heating mode
             * setpoint.
             *
             * If a client changes the value of this attribute, the server supports the PRES feature, and the server
             * either does not support the OCC feature or the Occupied bit is set on the Occupancy attribute, the value
             * of the ActivePresetHandle attribute shall be set to null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.14
             */
            occupiedHeatingSetpoint: WritableAttribute(0x12, TlvInt16, { persistent: true, default: 2000 }),

            /**
             * Indicates the minimum level that the heating setpoint may be set to.
             *
             * This attribute, and the following three attributes, allow the user to define setpoint limits more
             * constrictive than the manufacturer imposed ones. Limiting users (e.g., in a commercial building) to such
             * setpoint limits can help conserve power.
             *
             * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
             * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit
             * this attribute to be set to the desired value. If an attempt is made to set this attribute to a value
             * which is not consistent with the constraints and cannot be resolved by modifying setpoints then a
             * response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.17
             */
            minHeatSetpointLimit: OptionalWritableAttribute(
                0x15,
                TlvInt16,
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the maximum level that the heating setpoint may be set to.
             *
             * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
             * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit
             * this attribute to be set to the desired value. If an attempt is made to set this attribute to a value
             * which is not consistent with the constraints and cannot be resolved by modifying setpoints then a
             * response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.18
             */
            maxHeatSetpointLimit: OptionalWritableAttribute(
                0x16,
                TlvInt16,
                { persistent: true, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports feature Cooling.
     */
    export const CoolingComponent = MutableCluster.Component({
        attributes: {
            /**
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9
             */
            absMinCoolSetpointLimit: OptionalFixedAttribute(0x5, TlvInt16, { default: 1600 }),

            /**
             * Indicates the absolute maximum level that the cooling setpoint may be set to. This is a limitation
             * imposed by the manufacturer.
             *
             * ### Refer to Setpoint Limits for constraints
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.8
             */
            absMaxCoolSetpointLimit: OptionalFixedAttribute(0x6, TlvInt16, { default: 3200 }),

            /**
             * Indicates the level of cooling demanded by the PI (proportional integral) control loop in use by the
             * thermostat (if any), in percent. This value is 0 when the thermostat is in “off” or “heating” mode.
             *
             * This attribute is reported regularly and may be used to control a cooling device.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.9
             */
            piCoolingDemand: OptionalAttribute(0x7, TlvUInt8.bound({ max: 100 })),

            /**
             * Indicates the cooling mode setpoint when the room is occupied. Refer to Setpoint Limits for constraints.
             *
             * If an attempt is made to set this attribute to a value greater than MaxCoolSetpointLimit or less than
             * MinCoolSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * If this attribute is set to a value that is less than (OccupiedHeatingSetpoint + MinSetpointDeadBand),
             * the value of OccupiedHeatingSetpoint shall be adjusted to (OccupiedCoolingSetpoint -
             * MinSetpointDeadBand).
             *
             * If the occupancy status of the room is unknown, this attribute shall be used as the cooling mode
             * setpoint.
             *
             * If a client changes the value of this attribute, the server supports the PRES feature, and the server
             * either does not support the OCC feature or the Occupied bit is set on the Occupancy attribute, the value
             * of the ActivePresetHandle attribute shall be set to null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.13
             */
            occupiedCoolingSetpoint: WritableAttribute(0x11, TlvInt16, { persistent: true, default: 2600 }),

            /**
             * Indicates the minimum level that the cooling setpoint may be set to.
             *
             * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
             * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit
             * this attribute to be set to the desired value. If an attempt is made to set this attribute to a value
             * which is not consistent with the constraints and cannot be resolved by modifying setpoints then a
             * response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.19
             */
            minCoolSetpointLimit: OptionalWritableAttribute(
                0x17,
                TlvInt16,
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the maximum level that the cooling setpoint may be set to.
             *
             * Refer to Setpoint Limits for constraints. If an attempt is made to set this attribute to a value which
             * conflicts with setpoint values then those setpoints shall be adjusted by the minimum amount to permit
             * this attribute to be set to the desired value. If an attempt is made to set this attribute to a value
             * which is not consistent with the constraints and cannot be resolved by modifying setpoints then a
             * response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.20
             */
            maxCoolSetpointLimit: OptionalWritableAttribute(
                0x18,
                TlvInt16,
                { persistent: true, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A ThermostatCluster supports these elements if doesn't support feature LTNE.
     */
    export const NotLocalTemperatureNotExposedComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the offset the Thermostat server shall make to the measured temperature (locally or remotely)
             * to adjust the Calculated Local Temperature prior to using, displaying or reporting it.
             *
             * The purpose of this attribute is to adjust the calibration of the Thermostat server per the user’s
             * preferences (e.g., to match if there are multiple servers displaying different values for the same HVAC
             * area) or compensate for variability amongst temperature sensors.
             *
             * If a Thermostat client attempts to write LocalTemperatureCalibration attribute to an unsupported value
             * (e.g., out of the range supported by the Thermostat server), the Thermostat server shall respond with a
             * status of SUCCESS and set the value of LocalTemperatureCalibration to the upper or lower limit reached.
             *
             * > [!NOTE]
             *
             * > Prior to revision 8 of this cluster specification the value of this attribute was constrained to a
             *   range of -2.5°C to 2.5°C.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.12
             */
            localTemperatureCalibration: OptionalWritableAttribute(
                0x10,
                TlvInt8,
                { persistent: true, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports features Cooling and Occupancy.
     */
    export const CoolingAndOccupancyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the cooling mode setpoint when the room is unoccupied. Refer to Setpoint Limits for
             * constraints.
             *
             * If an attempt is made to set this attribute to a value greater than MaxCoolSetpointLimit or less than
             * MinCoolSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * If this attribute is set to a value that is less than (UnoccupiedHeatingSetpoint + MinSetpointDeadBand),
             * the value of UnoccupiedHeatingSetpoint shall be adjusted to (UnoccupiedCoolingSetpoint -
             * MinSetpointDeadBand).
             *
             * If the occupancy status of the room is unknown, this attribute shall NOT be used.
             *
             * If a client changes the value of this attribute, the server supports the PRES and OCC features, and the
             * Occupied bit is not set on the Occupancy attribute, the value of the ActivePresetHandle attribute shall
             * be set to null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.15
             */
            unoccupiedCoolingSetpoint: WritableAttribute(0x13, TlvInt16, { persistent: true, default: 2600 })
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports features Heating and Occupancy.
     */
    export const HeatingAndOccupancyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the heating mode setpoint when the room is unoccupied. Refer to Setpoint Limits for
             * constraints.
             *
             * If an attempt is made to set this attribute to a value greater than MaxHeatSetpointLimit or less than
             * MinHeatSetpointLimit, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * If this attribute is set to a value that is greater than (UnoccupiedCoolingSetpoint -
             * MinSetpointDeadBand), the value of UnoccupiedCoolingSetpoint shall be adjusted to
             *
             * + MinSetpointDeadBand).
             *
             * If the occupancy status of the room is unknown, this attribute shall NOT be used.
             *
             * If a client changes the value of this attribute, the server supports the PRES and OCC features, and the
             * Occupied bit is not set on the Occupancy attribute, the value of the ActivePresetHandle attribute shall
             * be set to null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.16
             */
            unoccupiedHeatingSetpoint: WritableAttribute(0x14, TlvInt16, { persistent: true, default: 2000 })
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports feature AutoMode.
     */
    export const AutoModeComponent = MutableCluster.Component({
        attributes: {
            /**
             * On devices which support the AUTO feature, this attribute shall indicate the minimum difference between
             * the Heat Setpoint and the Cool Setpoint.
             *
             * Refer to Setpoint Limits for constraints.
             *
             * > [!NOTE]
             *
             * > Prior to revision 8 of this cluster specification the value of this attribute was constrained to a
             *   range of 0°C to 2.5°C.
             *
             * For backwards compatibility, this attribute is optionally writeable. However any writes to this attribute
             * shall be silently ignored.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.21
             */
            minSetpointDeadBand: WritableAttribute(
                0x19,
                TlvInt8.bound({ min: 0 }),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the running mode of the thermostat. This attribute uses the same values as SystemModeEnum but
             * can only be Off, Cool or Heat. This attribute is intended to provide additional information when the
             * thermostat’s system mode is in auto mode.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.25
             */
            thermostatRunningMode: OptionalAttribute(
                0x1e,
                TlvEnum<ThermostatRunningMode>(),
                { default: ThermostatRunningMode.Off }
            )
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports feature ScheduleConfiguration.
     */
    export const ScheduleConfigurationComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the day of the week that this thermostat considers to be the start of week for weekly setpoint
             * scheduling.
             *
             * This attribute may be able to be used as the base to determine if the device supports weekly scheduling
             * by reading the attribute. Successful response means that the weekly scheduling is supported.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.26
             */
            startOfWeek: FixedAttribute(0x20, TlvEnum<StartOfWeek>()),

            /**
             * Indicates how many weekly schedule transitions the thermostat is capable of handling.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.27
             */
            numberOfWeeklyTransitions: FixedAttribute(0x21, TlvUInt8, { default: 0 }),

            /**
             * Indicates how many daily schedule transitions the thermostat is capable of handling.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.28
             */
            numberOfDailyTransitions: FixedAttribute(0x22, TlvUInt8, { default: 0 })
        },

        commands: {
            /**
             * This command is used to update the thermostat weekly setpoint schedule from a management system. If the
             * thermostat already has a weekly setpoint schedule programmed, then it SHOULD replace each daily setpoint
             * set as it receives the updates from the management system. For example, if the thermostat has 4 setpoints
             * for every day of the week and is sent a SetWeeklySchedule command with one setpoint for Saturday then the
             * thermostat SHOULD remove all 4 setpoints for Saturday and replace those with the updated setpoint but
             * leave all other days unchanged. If the schedule is larger than what fits in one frame or contains more
             * than 10 transitions, the schedule shall then be sent using multiple SetWeeklySchedule Commands.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.2
             */
            setWeeklySchedule: Command(
                0x1,
                TlvSetWeeklyScheduleRequest,
                0x1,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.3
             */
            getWeeklySchedule: Command(0x2, TlvGetWeeklyScheduleRequest, 0x0, TlvGetWeeklyScheduleResponse),

            /**
             * This command is used to clear the weekly schedule. The Clear weekly schedule has no payload.
             *
             * Upon receipt, all transitions currently stored shall be cleared and a default response of SUCCESS shall
             * be sent in response. There are no error responses to this command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.5
             */
            clearWeeklySchedule: Command(0x3, TlvNoArguments, 0x3, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports feature Setback.
     */
    export const SetbackComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the amount that the Thermostat server will allow the Calculated Local Temperature to float
             * above the OccupiedCoolingSetpoint (i.e., OccupiedCoolingSetpoint + OccupiedSetback) or below the
             * OccupiedHeatingSetpoint setpoint (i.e., OccupiedHeatingSetpoint – OccupiedSetback) before initiating a
             * state change to bring the temperature back to the user’s desired setpoint. This attribute is sometimes
             * also referred to as the “span.”
             *
             * The purpose of this attribute is to allow remote configuration of the span between the desired setpoint
             * and the measured temperature to help prevent over-cycling and reduce energy bills, though this may result
             * in lower comfort on the part of some users.
             *
             * The null value indicates the attribute is unused.
             *
             * If the Thermostat client attempts to write OccupiedSetback to a value greater than OccupiedSetbackMax,
             * the Thermostat server shall set its OccupiedSetback value to OccupiedSetbackMax and shall send a Write
             * Attribute Response command with a Status Code field enumeration of SUCCESS response.
             *
             * If the Thermostat client attempts to write OccupiedSetback to a value less than OccupiedSetbackMin, the
             * Thermostat server shall set its OccupiedSetback value to OccupiedSetbackMin and shall send a Write
             * Attribute Response command with a Status Code field enumeration of SUCCESS response.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.36
             */
            occupiedSetback: WritableAttribute(
                0x34,
                TlvNullable(TlvUInt8),
                { persistent: true, default: null, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the minimum value that the Thermostat server will allow the OccupiedSetback attribute to be
             * configured by a user.
             *
             * The null value indicates the attribute is unused.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.37
             */
            occupiedSetbackMin: FixedAttribute(0x35, TlvNullable(TlvUInt8), { default: null }),

            /**
             * Indicates the maximum value that the Thermostat server will allow the OccupiedSetback attribute to be
             * configured by a user.
             *
             * The null value indicates the attribute is unused.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.38
             */
            occupiedSetbackMax: FixedAttribute(0x36, TlvNullable(TlvUInt8), { default: null })
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports features Setback and Occupancy.
     */
    export const SetbackAndOccupancyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the amount that the Thermostat server will allow the Calculated Local Temperature to float
             * above the UnoccupiedCoolingSetpoint (i.e., UnoccupiedCoolingSetpoint + UnoccupiedSetback) or below the
             * UnoccupiedHeatingSetpoint setpoint (i.e., UnoccupiedHeatingSetpoint - UnoccupiedSetback) before
             * initiating a state change to bring the temperature back to the user’s desired setpoint. This attribute is
             * sometimes also referred to as the “span.”
             *
             * The purpose of this attribute is to allow remote configuration of the span between the desired setpoint
             * and the measured temperature to help prevent over-cycling and reduce energy bills, though this may result
             * in lower comfort on the part of some users.
             *
             * The null value indicates the attribute is unused.
             *
             * If the Thermostat client attempts to write UnoccupiedSetback to a value greater than
             * UnoccupiedSetbackMax, the Thermostat server shall set its UnoccupiedSetback value to UnoccupiedSetbackMax
             * and shall send a Write Attribute Response command with a Status Code field enumeration of SUCCESS
             * response.
             *
             * If the Thermostat client attempts to write UnoccupiedSetback to a value less than UnoccupiedSetbackMin,
             * the Thermostat server shall set its UnoccupiedSetback value to UnoccupiedSetbackMin and shall send a
             * Write Attribute Response command with a Status Code field enumeration of SUCCESS response.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.39
             */
            unoccupiedSetback: WritableAttribute(
                0x37,
                TlvNullable(TlvUInt8),
                { persistent: true, default: null, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the minimum value that the Thermostat server will allow the UnoccupiedSetback attribute to be
             * configured by a user.
             *
             * The null value indicates the attribute is unused.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.40
             */
            unoccupiedSetbackMin: FixedAttribute(0x38, TlvNullable(TlvUInt8), { default: null }),

            /**
             * Indicates the maximum value that the Thermostat server will allow the UnoccupiedSetback attribute to be
             * configured by a user.
             *
             * The null value indicates the attribute is unused.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.41
             */
            unoccupiedSetbackMax: FixedAttribute(0x39, TlvNullable(TlvUInt8), { default: null })
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports feature Presets.
     */
    export const PresetsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the supported PresetScenarioEnum values, limits on how many presets can be created for each
             * PresetScenarioEnum, and whether or not a thermostat can transition automatically to a given scenario.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.51
             */
            presetTypes: FixedAttribute(0x48, TlvArray(TlvPresetType), { default: [] }),

            /**
             * Indicates the maximum number of entries supported by the Presets attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.53
             */
            numberOfPresets: FixedAttribute(0x4a, TlvUInt8, { default: 0 }),

            /**
             * Indicates the PresetHandle of the active preset. If this attribute is null, then there is no active
             * preset.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.57
             */
            activePresetHandle: Attribute(
                0x4e,
                TlvNullable(TlvByteString.bound({ maxLength: 16 })),
                { persistent: true, default: null }
            ),

            /**
             * This attribute shall contain the current list of configured presets. On receipt of a write request:
             *
             *   1. If the PresetHandle field is null, the PresetStruct shall be treated as an added preset, and the
             *      device shall create a new unique value for the PresetHandle field.
             *
             *     a. If the BuiltIn field is true, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *   2. If the PresetHandle field is not null, the PresetStruct shall be treated as a modification of an
             *      existing preset.
             *
             *     a. If the value of the PresetHandle field does not match any of the existing presets, a response with
             *        the status code NOT_FOUND shall be returned.
             *
             *     b. If the value of the PresetHandle field is duplicated on multiple presets in the updated list, a
             *        response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *     c. If the BuiltIn field is true, and the PresetStruct in the current value with a matching
             *        PresetHandle field has a BuiltIn field set to false, a response with the status code
             *        CONSTRAINT_ERROR shall be returned.
             *
             *     d. If the BuiltIn field is false, and the PresetStruct in the current value with a matching
             *        PresetHandle field has a BuiltIn field set to true, a response with the status code
             *        CONSTRAINT_ERROR shall be returned.
             *
             *   3. If the specified PresetScenarioEnum value does not exist in PresetTypes, a response with the status
             *      code CONSTRAINT_ERROR shall be returned.
             *
             *   4. If the Name is set, but the associated PresetTypeStruct does not have the SupportsNames bit set, a
             *      response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *   5. If appending the received PresetStruct to the pending list of Presets would cause the total number
             *      of pending presets to exceed the value of the NumberOfPresets attribute, a response with the status
             *      code RESOURCE_EXHAUSTED shall be returned.
             *
             *   6. If appending the received PresetStruct to the pending list of Presets would cause the total number
             *      of pending presets whose PresetScenario field matches the appended preset’s PresetScenario field to
             *      exceed the value of the NumberOfPresets field on the PresetTypeStruct whose PresetScenario matches
             *      the appended preset’s PresetScenario field, a response with the status code RESOURCE_EXHAUSTED shall
             *      be returned.
             *
             *   7. Otherwise, the write shall be pended until receipt of a commit request, and the status code SUCCESS
             *      shall be returned.
             *
             *     a. If the BuiltIn field is null:
             *
             *       i. If there is a PresetStruct in the current value with a matching PresetHandle field, the BuiltIn
             *          field on the pending PresetStruct shall be set to the value of the BuiltIn on the matching
             *          PresetStruct.
             *
             *       ii. Otherwise, the BuiltIn field on the pending PresetStruct shall be set to false.
             *
             * On an attempt to commit, the status of this attribute shall be determined as follows:
             *
             *   1. For all existing presets:
             *
             *     a. If, after applying all pending changes, the updated value of the Presets attribute would not
             *        contain a PresetStruct with a matching PresetHandle field, indicating the removal of the
             *        PresetStruct, the server shall check for invalid removal of the PresetStruct:
             *
             *       i. If the BuiltIn field is true on the removed PresetStruct, the attribute status shall be
             *          CONSTRAINT_ERROR.
             *
             *       ii. If the MSCH feature is supported and the removed PresetHandle would be referenced by any
             *           PresetHandle on any ScheduleTransitionStruct on any ScheduleStruct in the updated value of the
             *           Schedules attribute, the attribute status shall be INVALID_IN_STATE.
             *
             *       iii. If the removed PresetHandle is equal to the value of the ActivePresetHandle attribute, the
             *            attribute status shall be INVALID_IN_STATE.
             *
             *   2. Otherwise, the attribute status shall be SUCCESS.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.59
             */
            presets: WritableAttribute(
                0x50,
                TlvArray(TlvPreset),
                { persistent: true, default: [], writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.9
             */
            setActivePresetRequest: Command(0x6, TlvSetActivePresetRequest, 0x6, TlvNoResponse)
        }
    });

    /**
     * A ThermostatCluster supports these elements if it supports feature MatterScheduleConfiguration.
     */
    export const MatterScheduleConfigurationComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the supported SystemMode values for Schedules, limits on how many schedules can be created for
             * each SystemMode value, and whether or not a given SystemMode value supports transitions to Presets,
             * target setpoints, or both.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.52
             */
            scheduleTypes: FixedAttribute(0x49, TlvArray(TlvScheduleType), { default: [] }),

            /**
             * Indicates the maximum number of entries supported by the Schedules attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.54
             */
            numberOfSchedules: FixedAttribute(0x4b, TlvUInt8, { default: 0 }),

            /**
             * Indicates the maximum number of transitions per Schedules attribute entry.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.55
             */
            numberOfScheduleTransitions: FixedAttribute(0x4c, TlvUInt8, { default: 0 }),

            /**
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9
             */
            numberOfScheduleTransitionPerDay: FixedAttribute(0x4d, TlvNullable(TlvUInt8), { default: null }),

            /**
             * Indicates the ScheduleHandle of the active schedule. A null value in this attribute indicates that there
             * is no active schedule.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.58
             */
            activeScheduleHandle: Attribute(
                0x4f,
                TlvNullable(TlvByteString.bound({ maxLength: 16 })),
                { persistent: true, default: null }
            ),

            /**
             * This attribute shall contain a list of ScheduleStructs. On receipt of a write request:
             *
             *   1. For all schedules in the write request:
             *
             *     a. If the ScheduleHandle field is null, the ScheduleStruct shall be treated as an added schedule, and
             *        the device shall create a new unique value for the ScheduleHandle field.
             *
             *       i. If the BuiltIn field is true, a response with the status code CONSTRAINT_ERROR shall be
             *          returned.
             *
             *     b. Otherwise, if the ScheduleHandle field is not null, the ScheduleStruct shall be treated as a
             *        modification of an existing schedule.
             *
             *       i. If the value of the ScheduleHandle field does not match any of the existing schedules, a
             *          response with the status code NOT_FOUND shall be returned.
             *
             *       ii. If the BuiltIn field is true, and the ScheduleStruct in the current value with a matching
             *           ScheduleHandle field has a BuiltIn field set to false, a response with the status code
             *           CONSTRAINT_ERROR shall be returned.
             *
             *       iii. If the BuiltIn field is false, and the ScheduleStruct in the current value with a matching
             *            ScheduleHandle field has a BuiltIn field set to true, a response with the status code
             *            CONSTRAINT_ERROR shall be returned.
             *
             *     c. If the specified SystemMode does not exist in ScheduleTypes, a response with the status code
             *        CONSTRAINT_ERROR shall be returned.
             *
             *     d. If the number of transitions exceeds the NumberOfScheduleTransitions value, a response with the
             *        status code RESOURCE_EXHAUSTED shall be returned.
             *
             *     e. If the value of the NumberOfScheduleTransitionsPerDay attribute is not null, and the number of
             *        transitions on any single day of the week exceeds the NumberOfScheduleTransitionsPerDay value, a
             *        response with the status code RESOURCE_EXHAUSTED shall be returned.
             *
             *     f. If the PresetHandle field is present, but the associated ScheduleTypeStruct does not have the
             *        SupportsPresets bit set, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *     g. If the PresetHandle field is present, but after applying all pending changes, the Presets
             *        attribute would not contain a PresetStruct whose PresetHandle field matches the value of the
             *        PresetHandle field, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *     h. If the Name is set, but the associated ScheduleTypeStruct does not have the SupportsNames bit set,
             *        a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *       i. For all transitions in all schedules in the write request:
             *
             *       i. If the PresetHandle field is present, but the ScheduleTypeStruct matching the value of the
             *          SystemMode field on the encompassing ScheduleStruct does not have the SupportsPresets bit set, a
             *          response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *     j. If the PresetHandle field is present, but after applying all pending changes, the Presets
             *        attribute would not contain a PresetStruct whose PresetHandle field matches the value of the
             *        PresetHandle field, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *       i. If the SystemMode field is present, but the ScheduleTypeStruct matching the value of the
             *          SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set,
             *          a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *       ii. If the SystemMode field is has a value of SystemModeOff, but the ScheduleTypeStruct matching
             *           the value of the SystemMode field on the encompassing ScheduleStruct does not have the
             *           SupportsOff bit set, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *     k. If the HeatingSetpoint field is present, but the ScheduleTypeStruct matching the value of the
             *        SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set, a
             *        response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *     l. If the CoolingSetpoint field is present, but the ScheduleTypeStruct matching the value of the
             *        SystemMode field on the encompassing ScheduleStruct does not have the SupportsSetpoints bit set, a
             *        response with the status code CONSTRAINT_ERROR shall be returned.
             *
             *   2. If appending the received ScheduleStruct to the pending list of Schedules would cause the total
             *      number of pending schedules to exceed the value of the NumberOfSchedules attribute, a response with
             *      the status code RESOURCE_EXHAUSTED shall be returned.
             *
             *   3. If appending the received ScheduleStruct to the pending list of Schedules would cause the total
             *      number of pending schedules whose SystemMode field matches the appended schedule’s SystemMode field
             *      to exceed the value of the NumberOfSchedules field on the ScheduleTypeStruct whose SystemMode field
             *      matches the appended schedule’s SystemMode field, a response with the status code RESOURCE_EXHAUSTED
             *      shall be returned.
             *
             *   4. Otherwise, the write shall be pended until receipt of a commit request, and the attribute status
             *      shall be SUCCESS.
             *
             *     a. If the BuiltIn field is null:
             *
             *       i. If there is a ScheduleStruct in the current value with a matching ScheduleHandle field, the
             *          BuiltIn field on the pending ScheduleStruct shall be set to the value of the BuiltIn on the
             *          matching ScheduleStruct.
             *
             *       ii. Otherwise, the BuiltIn field on the pending ScheduleStruct shall be set to false.
             *
             * On an attempt to commit, the status of this attribute shall be determined as follows:
             *
             *   1. For all existing schedules:
             *
             *     a. If, after applying all pending changes, the updated value of the Schedules attribute would not
             *        contain a ScheduleStruct with a matching ScheduleHandle field, indicating the removal of the
             *        ScheduleStruct, the server shall check for invalid removal of the ScheduleStruct:
             *
             *       i. If the BuiltIn field is true on the removed ScheduleStruct, the attribute status shall be
             *          CONSTRAINT_ERROR.
             *
             *       ii. If the removed ScheduleHandle is equal to the value of the ActiveScheduleHandle attribute, the
             *           attribute status shall be INVALID_IN_STATE.
             *
             *   2. Otherwise, the attribute status shall be SUCCESS.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.60
             */
            schedules: WritableAttribute(
                0x51,
                TlvArray(TlvSchedule),
                { persistent: true, default: [], writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.8
             */
            setActiveScheduleRequest: Command(0x5, TlvSetActiveScheduleRequest, 0x5, TlvNoResponse)
        }
    });

    /**
     * These elements and properties are present in all Thermostat clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x201,
        name: "Thermostat",
        revision: 9,

        features: {
            /**
             * Thermostat is capable of managing a heating device
             */
            heating: BitFlag(0),

            /**
             * Thermostat is capable of managing a cooling device
             */
            cooling: BitFlag(1),

            /**
             * Supports Occupied and Unoccupied setpoints
             */
            occupancy: BitFlag(2),

            /**
             * Supports remote configuration of a weekly schedule of setpoint transitions
             */
            scheduleConfiguration: BitFlag(3),

            /**
             * Supports configurable setback (or span)
             */
            setback: BitFlag(4),

            /**
             * Supports a System Mode of Auto
             */
            autoMode: BitFlag(5),

            /**
             * This feature indicates that the Calculated Local Temperature used internally is unavailable to report
             * externally, for example due to the temperature control being done by a separate subsystem which does not
             * offer a view into the currently measured temperature, but allows setpoints to be provided.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.4.1
             */
            localTemperatureNotExposed: BitFlag(6),

            /**
             * This feature indicates that the thermostat is capable of schedules. If this feature is supported, the
             * thermostat shall support a mechanism to do time synchronization.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.4.2
             */
            matterScheduleConfiguration: BitFlag(7),

            /**
             * Thermostat supports setpoint presets
             */
            presets: BitFlag(8)
        },

        attributes: {
            /**
             * Indicates the current Calculated Local Temperature, when available.
             *
             *   • If the LTNE feature is not supported:
             *
             *     ◦ If the LocalTemperatureCalibration is invalid or currently unavailable, the attribute shall report
             *       null.
             *
             *     ◦ If the LocalTemperatureCalibration is valid, the attribute shall report that value.
             *
             *   • Otherwise, if the LTNE feature is supported, there is no feedback externally available for the
             *     LocalTemperatureCalibration. In that case, the LocalTemperature attribute shall always report null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.2
             */
            localTemperature: Attribute(0x0, TlvNullable(TlvInt16)),

            /**
             * Indicates the outdoor temperature, as measured locally or remotely (over the network).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.3
             */
            outdoorTemperature: OptionalAttribute(0x1, TlvNullable(TlvInt16), { default: null }),

            /**
             * Indicates the HVAC system type controlled by the thermostat. If the thermostat uses physical DIP switches
             * to set these parameters, this information shall be available read-only from the DIP switches. If these
             * parameters are set via software, there shall be read/write access in order to provide remote programming
             * capability.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.11
             * @deprecated
             */
            hvacSystemTypeConfiguration: OptionalWritableAttribute(
                0x9,
                TlvBitmap(TlvUInt8, HvacSystemType),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates when the local temperature, outdoor temperature and occupancy are being sensed by remote
             * networked sensors, rather than internal sensors.
             *
             * If the LTNE feature is present in the server, the LocalTemperature RemoteSensing bit value shall always
             * report a value of 0.
             *
             * If the LocalTemperature RemoteSensing bit is written with a value of 1 when the LTNE feature is present,
             * the write shall fail and the server shall report a CONSTRAINT_ERROR.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.22
             */
            remoteSensing: OptionalWritableAttribute(
                0x1a,
                TlvBitmap(TlvUInt8, RemoteSensing),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the overall operating environment of the thermostat, and thus the possible system modes that
             * the thermostat can operate in.
             *
             * If an attempt is made to write to this attribute, the server shall silently ignore the write and the
             * value of this attribute shall remain unchanged. This behavior is in place for backwards compatibility
             * with existing thermostats.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.23
             */
            controlSequenceOfOperation: WritableAttribute(
                0x1b,
                TlvEnum<ControlSequenceOfOperation>(),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the current operating mode of the thermostat. Its value shall be limited by the
             * ControlSequenceOfOperation attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.24
             */
            systemMode: WritableAttribute(
                0x1c,
                TlvEnum<SystemMode>(),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the temperature hold status on the thermostat. If hold status is on, the thermostat SHOULD
             * maintain the temperature setpoint for the current mode until a system mode change. If hold status is off,
             * the thermostat SHOULD follow the setpoint transitions specified by its internal scheduling program. If
             * the thermostat supports setpoint hold for a specific duration, it SHOULD also implement the
             * TemperatureSetpointHoldDuration attribute.
             *
             * If the server supports a setpoint hold for a specific duration, it SHOULD also implement the
             * SetpointHoldExpiryTimestamp attribute.
             *
             * If this attribute is updated to SetpointHoldOn and the TemperatureSetpointHoldDuration has a non-null
             * value and the SetpointHoldExpiryTimestamp is supported, the server shall update the
             * SetpointHoldExpiryTimestamp with a value of current UTC timestamp, in seconds, plus the value in
             * TemperatureSetpointHoldDuration multiplied by 60.
             *
             * If this attribute is updated to SetpointHoldOff and the SetpointHoldExpiryTimestamp is supported, the
             * server shall set the SetpointHoldExpiryTimestamp to null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.29
             */
            temperatureSetpointHold: OptionalWritableAttribute(
                0x23,
                TlvEnum<TemperatureSetpointHold>(),
                { persistent: true, default: TemperatureSetpointHold.SetpointHoldOff, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the period in minutes for which a setpoint hold is active. Thermostats that support hold for a
             * specified duration SHOULD implement this attribute. The null value indicates the field is unused. All
             * other values are reserved.
             *
             * If this attribute is updated to a non-null value and the TemperatureSetpointHold is set to SetpointHoldOn
             * and the SetpointHoldExpiryTimestamp is supported, the server shall update SetpointHoldExpiryTimestamp
             * with a value of current UTC timestamp, in seconds, plus the new value of this attribute multiplied by 60.
             *
             * If this attribute is set to null and the SetpointHoldExpiryTimestamp is supported, the server shall set
             * the SetpointHoldExpiryTimestamp to null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.30
             */
            temperatureSetpointHoldDuration: OptionalWritableAttribute(
                0x24,
                TlvNullable(TlvUInt16.bound({ max: 1440 })),
                { persistent: true, default: null, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the operational state of the thermostat’s programming. The thermostat shall modify its
             * programming operation when this attribute is modified by a client and update this attribute when its
             * programming operation is modified locally by a user. The thermostat may support more than one active
             * ProgrammingOperationModeBitmap. For example, the thermostat may operate simultaneously in Schedule
             * Programming Mode and Recovery Mode.
             *
             * Thermostats which contain a schedule may use this attribute to control how that schedule is used, even if
             * they do not support the ScheduleConfiguration feature.
             *
             * When ScheduleActive is not set, the setpoint is altered only by manual up/down changes at the thermostat
             * or remotely, not by internal schedule programming.
             *
             * > [!NOTE]
             *
             * > Modifying the ScheduleActive bit does not clear or delete previous weekly schedule programming
             *   configurations.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.31
             */
            thermostatProgrammingOperationMode: OptionalWritableAttribute(
                0x25,
                TlvBitmap(TlvUInt8, ProgrammingOperationMode),
                { writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the current relay state of the heat, cool, and fan relays. Unimplemented outputs shall be
             * treated as if they were Off.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.32
             */
            thermostatRunningState: OptionalAttribute(0x29, TlvBitmap(TlvUInt16, RelayState)),

            /**
             * Indicates the source of the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint (i.e., who
             * or what determined the current setpoint).
             *
             * This attribute enables service providers to determine whether changes to setpoints were initiated due to
             * occupant comfort, scheduled programming or some other source (e.g., electric utility or other service
             * provider). Because automation services may initiate frequent setpoint changes, this attribute clearly
             * differentiates the source of setpoint changes made at the thermostat.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.33
             */
            setpointChangeSource: OptionalAttribute(
                0x30,
                TlvEnum<SetpointChangeSource>(),
                { default: SetpointChangeSource.Manual }
            ),

            /**
             * Indicates the delta between the current active OccupiedCoolingSetpoint or OccupiedHeatingSetpoint and the
             * previous active setpoint. This attribute is meant to accompany the SetpointChangeSource attribute;
             * devices implementing SetpointChangeAmount SHOULD also implement SetpointChangeSource.
             *
             * The null value indicates that the previous setpoint was unknown.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.34
             */
            setpointChangeAmount: OptionalAttribute(0x31, TlvNullable(TlvInt16), { default: null }),

            /**
             * Indicates the time in UTC at which the SetpointChangeAmount attribute change was recorded.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.35
             */
            setpointChangeSourceTimestamp: OptionalAttribute(0x32, TlvEpochS, { default: 0 }),

            /**
             * Indicates the delta between the Calculated Local Temperature and the OccupiedHeatingSetpoint or
             * UnoccupiedHeatingSetpoint attributes at which the Thermostat server will operate in emergency heat mode.
             *
             * If the difference between the Calculated Local Temperature and OccupiedCoolingSetpoint or
             * UnoccupiedCoolingSetpoint is greater than or equal to the EmergencyHeatDelta and the Thermostat server’s
             * SystemMode attribute is in a heating-related mode, then the Thermostat server shall immediately switch to
             * the SystemMode attribute value that provides the highest stage of heating (e.g., emergency heat) and
             * continue operating in that running state until the OccupiedHeatingSetpoint value is reached. For example:
             *
             *   • Calculated Local Temperature = 10.0°C
             *
             *   • OccupiedHeatingSetpoint = 16.0°C
             *
             *   • EmergencyHeatDelta = 2.0°C
             *
             * ⇒ OccupiedHeatingSetpoint - Calculated Local Temperature ≥? EmergencyHeatDelta
             *
             * ⇒ 16°C - 10°C ≥? 2°C
             *
             * ⇒ TRUE >>> Thermostat server changes its SystemMode to operate in 2nd stage or emergency heat mode
             *
             * The purpose of this attribute is to provide Thermostat clients the ability to configure rapid heating
             * when a setpoint is of a specified amount greater than the measured temperature. This allows the heated
             * space to be quickly heated to the desired level set by the user.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.42
             */
            emergencyHeatDelta: OptionalWritableAttribute(
                0x3a,
                TlvUInt8,
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the type of Mini Split ACTypeEnum of Mini Split AC is defined depending on how Cooling and
             * Heating condition is achieved by Mini Split AC.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.43
             */
            acType: OptionalWritableAttribute(
                0x40,
                TlvEnum<AcType>(),
                { persistent: true, default: AcType.Unknown, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates capacity of Mini Split AC in terms of the format defined by the ACCapacityFormat attribute
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.44
             */
            acCapacity: OptionalWritableAttribute(
                0x41,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates type of refrigerant used within the Mini Split AC.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.45
             */
            acRefrigerantType: OptionalWritableAttribute(
                0x42,
                TlvEnum<AcRefrigerantType>(),
                { persistent: true, default: AcRefrigerantType.Unknown, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the type of compressor used within the Mini Split AC.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.46
             */
            acCompressorType: OptionalWritableAttribute(
                0x43,
                TlvEnum<AcCompressorType>(),
                { persistent: true, default: AcCompressorType.Unknown, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the type of errors encountered within the Mini Split AC.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.47
             */
            acErrorCode: OptionalWritableAttribute(
                0x44,
                TlvBitmap(TlvUInt32, AcErrorCode),
                { writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the position of Louver on the AC.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.48
             */
            acLouverPosition: OptionalWritableAttribute(
                0x45,
                TlvEnum<AcLouverPosition>(),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the temperature of the AC coil, as measured locally or remotely (over the network).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.49
             */
            acCoilTemperature: OptionalAttribute(0x46, TlvNullable(TlvInt16), { default: null }),

            /**
             * Indicates the format for the ACCapacity attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.50
             */
            acCapacityFormat: OptionalWritableAttribute(
                0x47,
                TlvEnum<AcCapacityFormat>(),
                { persistent: true, default: AcCapacityFormat.BtUh, writeAcl: AccessLevel.Manage }
            ),

            /**
             * If there is a known time when the TemperatureSetpointHold shall be cleared, this attribute shall contain
             * the timestamp in UTC indicating when that will happen. If there is no such known time, this attribute
             * shall be null.
             *
             * If the TemperatureSetpointHold is set to SetpointHoldOn and the TemperatureSetpointHoldDuration is set to
             * null, this attribute shall be set to null indicating there is a hold on the Thermostat without a
             * duration.
             *
             * If the TemperatureSetpointHold is set to SetpointHoldOff, this attribute shall be set to null indicating
             * there is no hold on the Thermostat.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.9.61
             */
            setpointHoldExpiryTimestamp: OptionalAttribute(
                0x52,
                TlvNullable(TlvEpochS),
                { persistent: true, default: null }
            )
        },

        commands: {
            /**
             * @see {@link MatterSpecification.v141.Cluster} § 4.3.10.1
             */
            setpointRaiseLower: Command(0x0, TlvSetpointRaiseLowerRequest, 0x0, TlvNoResponse),

            atomicRequest: Command(0xfe, TlvAtomicRequest, 0xfd, TlvAtomicResponse)
        },

        /**
         * This metadata controls which ThermostatCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { occupancy: true }, component: OccupancyComponent },
            { flags: { heating: true }, component: HeatingComponent },
            { flags: { cooling: true }, component: CoolingComponent },
            { flags: { localTemperatureNotExposed: false }, component: NotLocalTemperatureNotExposedComponent },
            { flags: { cooling: true, occupancy: true }, component: CoolingAndOccupancyComponent },
            { flags: { heating: true, occupancy: true }, component: HeatingAndOccupancyComponent },
            { flags: { autoMode: true }, component: AutoModeComponent },
            { flags: { scheduleConfiguration: true }, component: ScheduleConfigurationComponent },
            { flags: { setback: true }, component: SetbackComponent },
            { flags: { setback: true, occupancy: true }, component: SetbackAndOccupancyComponent },
            { flags: { presets: true }, component: PresetsComponent },
            { flags: { matterScheduleConfiguration: true }, component: MatterScheduleConfigurationComponent },
            { flags: { autoMode: true, heating: false }, component: false },
            { flags: { autoMode: true, cooling: false }, component: false },
            { flags: { heating: false, cooling: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster provides an interface to the functionality of a thermostat.
     *
     * Per the Matter specification you cannot use {@link ThermostatCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const OCC = { occupancy: true };
    const HEAT = { heating: true };
    const COOL = { cooling: true };
    const COOL_OCC = { cooling: true, occupancy: true };
    const HEAT_OCC = { heating: true, occupancy: true };
    const AUTO = { autoMode: true };
    const SCH = { scheduleConfiguration: true };
    const SB = { setback: true };
    const SB_OCC = { setback: true, occupancy: true };
    const PRES = { presets: true };
    const MSCH = { matterScheduleConfiguration: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            ...Base.attributes,
            occupancy: MutableCluster.AsConditional(OccupancyComponent.attributes.occupancy, { mandatoryIf: [OCC] }),
            absMinHeatSetpointLimit: MutableCluster.AsConditional(
                HeatingComponent.attributes.absMinHeatSetpointLimit,
                { optionalIf: [HEAT] }
            ),
            absMaxHeatSetpointLimit: MutableCluster.AsConditional(
                HeatingComponent.attributes.absMaxHeatSetpointLimit,
                { optionalIf: [HEAT] }
            ),
            absMinCoolSetpointLimit: MutableCluster.AsConditional(
                CoolingComponent.attributes.absMinCoolSetpointLimit,
                { optionalIf: [COOL] }
            ),
            absMaxCoolSetpointLimit: MutableCluster.AsConditional(
                CoolingComponent.attributes.absMaxCoolSetpointLimit,
                { optionalIf: [COOL] }
            ),
            piCoolingDemand: MutableCluster.AsConditional(
                CoolingComponent.attributes.piCoolingDemand,
                { optionalIf: [COOL] }
            ),
            piHeatingDemand: MutableCluster.AsConditional(
                HeatingComponent.attributes.piHeatingDemand,
                { optionalIf: [HEAT] }
            ),
            localTemperatureCalibration: MutableCluster.AsConditional(
                NotLocalTemperatureNotExposedComponent.attributes.localTemperatureCalibration,
                { optionalIf: [] }
            ),
            occupiedCoolingSetpoint: MutableCluster.AsConditional(
                CoolingComponent.attributes.occupiedCoolingSetpoint,
                { mandatoryIf: [COOL] }
            ),
            occupiedHeatingSetpoint: MutableCluster.AsConditional(
                HeatingComponent.attributes.occupiedHeatingSetpoint,
                { mandatoryIf: [HEAT] }
            ),
            unoccupiedCoolingSetpoint: MutableCluster.AsConditional(
                CoolingAndOccupancyComponent.attributes.unoccupiedCoolingSetpoint,
                { mandatoryIf: [COOL_OCC] }
            ),
            unoccupiedHeatingSetpoint: MutableCluster.AsConditional(
                HeatingAndOccupancyComponent.attributes.unoccupiedHeatingSetpoint,
                { mandatoryIf: [HEAT_OCC] }
            ),
            minHeatSetpointLimit: MutableCluster.AsConditional(
                HeatingComponent.attributes.minHeatSetpointLimit,
                { optionalIf: [HEAT] }
            ),
            maxHeatSetpointLimit: MutableCluster.AsConditional(
                HeatingComponent.attributes.maxHeatSetpointLimit,
                { optionalIf: [HEAT] }
            ),
            minCoolSetpointLimit: MutableCluster.AsConditional(
                CoolingComponent.attributes.minCoolSetpointLimit,
                { optionalIf: [COOL] }
            ),
            maxCoolSetpointLimit: MutableCluster.AsConditional(
                CoolingComponent.attributes.maxCoolSetpointLimit,
                { optionalIf: [COOL] }
            ),
            minSetpointDeadBand: MutableCluster.AsConditional(
                AutoModeComponent.attributes.minSetpointDeadBand,
                { mandatoryIf: [AUTO] }
            ),
            thermostatRunningMode: MutableCluster.AsConditional(
                AutoModeComponent.attributes.thermostatRunningMode,
                { optionalIf: [AUTO] }
            ),
            startOfWeek: MutableCluster.AsConditional(
                ScheduleConfigurationComponent.attributes.startOfWeek,
                { mandatoryIf: [SCH] }
            ),
            numberOfWeeklyTransitions: MutableCluster.AsConditional(
                ScheduleConfigurationComponent.attributes.numberOfWeeklyTransitions,
                { mandatoryIf: [SCH] }
            ),
            numberOfDailyTransitions: MutableCluster.AsConditional(
                ScheduleConfigurationComponent.attributes.numberOfDailyTransitions,
                { mandatoryIf: [SCH] }
            ),
            occupiedSetback: MutableCluster.AsConditional(
                SetbackComponent.attributes.occupiedSetback,
                { mandatoryIf: [SB] }
            ),
            occupiedSetbackMin: MutableCluster.AsConditional(
                SetbackComponent.attributes.occupiedSetbackMin,
                { mandatoryIf: [SB] }
            ),
            occupiedSetbackMax: MutableCluster.AsConditional(
                SetbackComponent.attributes.occupiedSetbackMax,
                { mandatoryIf: [SB] }
            ),
            unoccupiedSetback: MutableCluster.AsConditional(
                SetbackAndOccupancyComponent.attributes.unoccupiedSetback,
                { mandatoryIf: [SB_OCC] }
            ),
            unoccupiedSetbackMin: MutableCluster.AsConditional(
                SetbackAndOccupancyComponent.attributes.unoccupiedSetbackMin,
                { mandatoryIf: [SB_OCC] }
            ),
            unoccupiedSetbackMax: MutableCluster.AsConditional(
                SetbackAndOccupancyComponent.attributes.unoccupiedSetbackMax,
                { mandatoryIf: [SB_OCC] }
            ),
            presetTypes: MutableCluster.AsConditional(PresetsComponent.attributes.presetTypes, { mandatoryIf: [PRES] }),
            scheduleTypes: MutableCluster.AsConditional(
                MatterScheduleConfigurationComponent.attributes.scheduleTypes,
                { mandatoryIf: [MSCH] }
            ),
            numberOfPresets: MutableCluster.AsConditional(
                PresetsComponent.attributes.numberOfPresets,
                { mandatoryIf: [PRES] }
            ),
            numberOfSchedules: MutableCluster.AsConditional(
                MatterScheduleConfigurationComponent.attributes.numberOfSchedules,
                { mandatoryIf: [MSCH] }
            ),
            numberOfScheduleTransitions: MutableCluster.AsConditional(
                MatterScheduleConfigurationComponent.attributes.numberOfScheduleTransitions,
                { mandatoryIf: [MSCH] }
            ),
            numberOfScheduleTransitionPerDay: MutableCluster.AsConditional(
                MatterScheduleConfigurationComponent.attributes.numberOfScheduleTransitionPerDay,
                { mandatoryIf: [MSCH] }
            ),
            activePresetHandle: MutableCluster.AsConditional(
                PresetsComponent.attributes.activePresetHandle,
                { mandatoryIf: [PRES] }
            ),
            activeScheduleHandle: MutableCluster.AsConditional(
                MatterScheduleConfigurationComponent.attributes.activeScheduleHandle,
                { mandatoryIf: [MSCH] }
            ),
            presets: MutableCluster.AsConditional(PresetsComponent.attributes.presets, { mandatoryIf: [PRES] }),
            schedules: MutableCluster.AsConditional(
                MatterScheduleConfigurationComponent.attributes.schedules,
                { mandatoryIf: [MSCH] }
            )
        },

        commands: {
            ...Base.commands,
            setWeeklySchedule: MutableCluster.AsConditional(
                ScheduleConfigurationComponent.commands.setWeeklySchedule,
                { mandatoryIf: [SCH] }
            ),
            getWeeklySchedule: MutableCluster.AsConditional(
                ScheduleConfigurationComponent.commands.getWeeklySchedule,
                { mandatoryIf: [SCH] }
            ),
            clearWeeklySchedule: MutableCluster.AsConditional(
                ScheduleConfigurationComponent.commands.clearWeeklySchedule,
                { mandatoryIf: [SCH] }
            ),
            setActiveScheduleRequest: MutableCluster.AsConditional(
                MatterScheduleConfigurationComponent.commands.setActiveScheduleRequest,
                { mandatoryIf: [MSCH] }
            ),
            setActivePresetRequest: MutableCluster.AsConditional(
                PresetsComponent.commands.setActivePresetRequest,
                { mandatoryIf: [PRES] }
            )
        }
    });

    /**
     * This cluster supports all Thermostat features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ThermostatCluster = Thermostat.Cluster;
export const ThermostatCluster = Thermostat.Cluster;
ClusterRegistry.register(Thermostat.Complete);
